// Persistent cross-session memory system inspired by claude-mem
// Memory types: fact, experience, preference, skill, context

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type MemoryType = 'fact' | 'experience' | 'preference' | 'skill' | 'context';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  source?: string;          // e.g. agent ID or command that generated this
  createdAt: string;
  accessCount: number;
  lastAccessedAt: string;
  importance: number;       // 1-5 scale, higher = more important
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;            // relevance score 0-1
}

export class MemoryManager {
  private memories: Map<string, MemoryEntry> = new Map();
  private globalMemories: Map<string, MemoryEntry> = new Map();
  private memoryFile: string;
  private globalMemoryFile: string;

  constructor(filePath?: string, globalFilePath?: string) {
    this.globalMemoryFile = globalFilePath ?? path.join(os.homedir(), '.tzukwan', 'memory.jsonl');
    this.memoryFile = filePath ?? this.globalMemoryFile;
    this.load();
    if (this.memoryFile !== this.globalMemoryFile) {
      this.loadGlobal();
    }
  }

  /**
   * Switch to a different memory file. Saves current memories first, then
   * loads from the new path.
   */
  switchFile(newPath: string): void {
    this.save();
    this.memoryFile = newPath;
    this.memories.clear();
    this.load();
    if (this.memoryFile !== this.globalMemoryFile) {
      this.globalMemories.clear();
      this.loadGlobal();
    }
  }

  /**
   * Returns the current memory file path.
   */
  getFilePath(): string {
    return this.memoryFile;
  }

  getGlobalFilePath(): string {
    return this.globalMemoryFile;
  }

  promoteToGlobal(entryOrId: string | MemoryEntry): MemoryEntry | null {
    if (this.memoryFile === this.globalMemoryFile) {
      return typeof entryOrId === 'string' ? this.memories.get(entryOrId) ?? null : entryOrId;
    }

    const entry = typeof entryOrId === 'string' ? this.memories.get(entryOrId) : entryOrId;
    if (!entry) {
      return null;
    }

    const duplicate = Array.from(this.globalMemories.values()).find((candidate) =>
      candidate.type === entry.type &&
      candidate.content === entry.content,
    );
    if (duplicate) {
      duplicate.lastAccessedAt = new Date().toISOString();
      duplicate.accessCount += 1;
      this.saveGlobal();
      return duplicate;
    }

    const promoted: MemoryEntry = {
      ...entry,
      tags: [...new Set([...entry.tags, 'global'])],
      lastAccessedAt: new Date().toISOString(),
    };
    this.globalMemories.set(promoted.id, promoted);
    this.appendToGlobalFile(promoted);
    return promoted;
  }

  promoteReusableEntries(entries?: MemoryEntry[]): MemoryEntry[] {
    const candidates = entries ?? Array.from(this.memories.values());
    const promoted: MemoryEntry[] = [];

    for (const entry of candidates) {
      if (entry.importance < 4) continue;
      if (!['experience', 'skill', 'fact', 'context'].includes(entry.type)) continue;
      const promotedEntry = this.promoteToGlobal(entry);
      if (promotedEntry) {
        promoted.push(promotedEntry);
      }
    }

    return promoted;
  }

  private getAllMemories(): MemoryEntry[] {
    if (this.memoryFile === this.globalMemoryFile) {
      return Array.from(this.memories.values());
    }

    const merged = new Map<string, MemoryEntry>();
    for (const entry of this.globalMemories.values()) {
      merged.set(entry.id, entry);
    }
    for (const entry of this.memories.values()) {
      merged.set(entry.id, entry);
    }
    return Array.from(merged.values());
  }

  /**
   * Add a new memory entry
   */
  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessCount' | 'lastAccessedAt'>): MemoryEntry {
    const now = new Date().toISOString();
    const id = this.generateId();

    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this.memories.set(id, fullEntry);
    this.appendToFile(fullEntry);

    return fullEntry;
  }

  /**
   * Search memories by keyword (simple text matching, sorted by relevance then importance)
   */
  search(query: string, limit?: number): MemorySearchResult[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return [];
    }

    const STOPWORDS = new Set(['the', 'is', 'in', 'of', 'and', 'a', 'an', 'to', 'for', 'on', 'at', 'with', 'by', 'from', 'this', 'that', 'are', 'was', 'be', 'it', 'as', 'or', 'but', 'not']);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
    const results: MemorySearchResult[] = [];

    for (const entry of this.getAllMemories()) {
      const score = this.scoreMatch(entry, normalizedQuery, queryWords);
      if (score > 0) {
        // Update access stats
        entry.accessCount++;
        entry.lastAccessedAt = new Date().toISOString();
        results.push({ entry, score });
      }
    }

    // Sort by score (descending), then by importance (descending), then by recency
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.entry.importance !== a.entry.importance) {
        return b.entry.importance - a.entry.importance;
      }
      return new Date(b.entry.lastAccessedAt).getTime() - new Date(a.entry.lastAccessedAt).getTime();
    });

    // Access counts are updated in memory only; save is handled by background flush or add/update/delete
    // This avoids expensive disk I/O on every search

    return limit ? results.slice(0, limit) : results;
  }

  /**
   * Get all memories of a specific type
   */
  getByType(type: MemoryType): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    for (const entry of this.getAllMemories()) {
      if (entry.type === type) {
        entry.accessCount++;
        entry.lastAccessedAt = new Date().toISOString();
        results.push(entry);
      }
    }

    // Sort by importance (descending), then by recency
    results.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });

    // Access counts updated in memory only; periodic save via add/update/delete or background flush
    return results;
  }

  /**
   * Get a specific memory by ID
   */
  get(id: string): MemoryEntry | undefined {
    const entry = this.memories.get(id) ?? this.globalMemories.get(id);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessedAt = new Date().toISOString();
      // Access stats tracked in memory; no immediate save to reduce I/O
    }
    return entry;
  }

  /**
   * Update a memory entry
   */
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'tags' | 'importance'>>): boolean {
    const entry = this.memories.get(id);
    if (!entry) {
      return false;
    }

    if (updates.content !== undefined) {
      entry.content = updates.content;
    }
    if (updates.tags !== undefined) {
      entry.tags = updates.tags;
    }
    if (updates.importance !== undefined) {
      entry.importance = Math.max(1, Math.min(5, updates.importance));
    }

    entry.lastAccessedAt = new Date().toISOString();
    this.save();
    return true;
  }

  /**
   * Delete a memory
   */
  delete(id: string): boolean {
    const existed = this.memories.delete(id);
    if (existed) {
      this.save();
    }
    return existed;
  }

  /**
   * List all memories sorted by importance and recency
   */
  list(limit?: number): MemoryEntry[] {
    const entries = this.getAllMemories();

    // Sort by importance (descending), then by recency
    entries.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });

    return limit ? entries.slice(0, limit) : entries;
  }

  /**
   * Build a context string from relevant memories (to inject into LLM system prompt)
   */
  buildContext(query: string, maxEntries: number = 5): string {
    const results = this.search(query, maxEntries);

    if (results.length === 0) {
      return '';
    }

    const lines: string[] = ['## 相关记忆'];

    for (const { entry } of results) {
      const date = (entry.createdAt ?? '').slice(0, 7); // YYYY-MM format
      const tags = (entry.tags ?? []).length > 0 ? ` [${(entry.tags ?? []).join(', ')}]` : '';
      lines.push(`[${entry.type}] ${date}${tags} | ${entry.content}`);
    }

    return lines.join('\n');
  }

  /**
   * Auto-extract insights from a conversation message and store them
   * This is a simple heuristic-based extraction
   */
  autoExtract(content: string, source?: string): MemoryEntry[] {
    const extracted: MemoryEntry[] = [];
    const sentences = content.split(/[。！？\n]+/).filter(s => s.trim().length > 10);

    // Patterns that indicate valuable information
    const patterns: { pattern: RegExp; type: MemoryType; importance: number }[] = [
      { pattern: /(?:建议|推荐|最好|应该|可以).{5,}/, type: 'experience', importance: 4 },
      { pattern: /(?:重要|关键|核心|注意).{5,}/, type: 'context', importance: 5 },
      { pattern: /(?:错误|失败|问题|bug).{5,}/, type: 'experience', importance: 4 },
      { pattern: /(?:解决方案|修复|解决|处理).{5,}/, type: 'skill', importance: 4 },
      { pattern: /(?:最佳实践|规范|标准|约定).{5,}/, type: 'skill', importance: 4 },
      { pattern: /(?:事实是|实际上|本质上).{5,}/, type: 'fact', importance: 3 },
      { pattern: /(?:偏好|喜欢|习惯|通常).{5,}/, type: 'preference', importance: 3 },
    ];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length < 15 || trimmed.length > 500) {
        continue;
      }

      for (const { pattern, type, importance } of patterns) {
        if (pattern.test(trimmed)) {
          // Extract tags from the content
          const tags = this.extractTags(trimmed);

          const entry = this.add({
            type,
            content: trimmed,
            tags,
            source,
            importance,
          });

          extracted.push(entry);
          break; // Only extract one memory per sentence
        }
      }
    }

    return extracted;
  }

  /**
   * Get memory statistics
   */
  getStats(): { total: number; byType: Record<MemoryType, number>; oldestEntry: string; newestEntry: string } {
    const byType: Record<MemoryType, number> = {
      fact: 0,
      experience: 0,
      preference: 0,
      skill: 0,
      context: 0,
    };

    let oldestEntry = '';
    let newestEntry = '';
    let oldestTime = Infinity;
    let newestTime = 0;

    for (const entry of this.getAllMemories()) {
      byType[entry.type]++;

      const createdTime = new Date(entry.createdAt).getTime();
      if (createdTime < oldestTime) {
        oldestTime = createdTime;
        oldestEntry = entry.id;
      }
      if (createdTime > newestTime) {
        newestTime = createdTime;
        newestEntry = entry.id;
      }
    }

    return {
      // Use getAllMemories() count to avoid double-counting promoted entries
      // (entries promoted to global remain in both maps)
      total: this.getAllMemories().length,
      byType,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Load memories from JSONL file
   */
  private load(): void {
    // Ensure directory exists unconditionally (idempotent, avoids TOCTOU)
    try { fs.mkdirSync(path.dirname(this.memoryFile), { recursive: true }); } catch { /* ignore */ }

    try {
      const content = fs.readFileSync(this.memoryFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry: MemoryEntry = JSON.parse(line);
          if (entry.id && entry.type && entry.content) {
            this.memories.set(entry.id, entry);
          }
        } catch (e) {
          // Skip malformed lines
          console.warn(`Skipping malformed memory entry: ${line.slice(0, 50)}...`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load memories:', error);
      }
    }
  }

  private loadGlobal(): void {
    if (this.globalMemoryFile === this.memoryFile) {
      return;
    }

    try {
      const content = fs.readFileSync(this.globalMemoryFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        try {
          const entry: MemoryEntry = JSON.parse(line);
          if (entry.id && entry.type && entry.content) {
            this.globalMemories.set(entry.id, entry);
          }
        } catch {
          // Ignore malformed global memory entries
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load global memories:', error);
      }
    }
  }

  /**
   * Save all memories to JSONL file
   */
  private save(): void {
    try {
      const dir = path.dirname(this.memoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const lines: string[] = [];
      for (const entry of this.memories.values()) {
        lines.push(JSON.stringify(entry));
      }

      fs.writeFileSync(this.memoryFile, lines.join('\n') + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to save memories:', error);
    }
  }

  private saveGlobal(): void {
    if (this.globalMemoryFile === this.memoryFile) {
      return;
    }

    try {
      const dir = path.dirname(this.globalMemoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const lines: string[] = [];
      for (const entry of this.globalMemories.values()) {
        lines.push(JSON.stringify(entry));
      }

      fs.writeFileSync(this.globalMemoryFile, lines.join('\n') + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to save global memories:', error);
    }
  }

  /**
   * Append a single entry to the JSONL file
   */
  private appendToFile(entry: MemoryEntry): void {
    try {
      const dir = path.dirname(this.memoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.memoryFile, line, 'utf-8');
    } catch (error) {
      console.error('Failed to append memory:', error);
    }
  }

  private appendToGlobalFile(entry: MemoryEntry): void {
    if (this.globalMemoryFile === this.memoryFile) {
      this.appendToFile(entry);
      return;
    }

    try {
      const dir = path.dirname(this.globalMemoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.globalMemoryFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to append global memory:', error);
    }
  }

  /**
   * Calculate a simple relevance score for a memory entry
   */
  private scoreMatch(entry: MemoryEntry, query: string, queryWords: string[]): number {
    if (!entry.content || !entry.tags) return 0;
    const contentLower = entry.content.toLowerCase();
    const tagsLower = entry.tags.map(t => t.toLowerCase());

    let score = 0;

    // Exact phrase match in content (highest value)
    if (contentLower.includes(query)) {
      score += 0.6;
    }

    // Unique word matches in content (deduplicated - avoid inflating for repetition)
    if (queryWords.length > 0) {
      const matchedWords = queryWords.filter(word => contentLower.includes(word));
      score += (matchedWords.length / queryWords.length) * 0.3;
    }

    // Tag matches (high specificity signal)
    for (const word of queryWords) {
      if (tagsLower.some(tag => tag === word || tag.startsWith(word))) {
        score += 0.25;
      }
    }

    // Length factor: shorter, more focused entries score slightly higher
    const lengthFactor = Math.min(1, 150 / Math.max(50, entry.content.length));
    score *= (0.7 + 0.3 * lengthFactor);

    // Importance boost (subtle)
    score *= (0.85 + 0.15 * (entry.importance / 5));

    return Math.min(1, score);
  }

  /**
   * Generate a UUID-like ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `mem_${timestamp}_${random}`;
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // Extract hashtags
    const hashtagMatches = content.match(/#(\w+)/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map(t => t.slice(1)));
    }

    // Extract key technical terms
    const techTerms = [
      'typescript', 'javascript', 'python', 'rust', 'go', 'java',
      'react', 'vue', 'angular', 'node', 'deno', 'bun',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp',
      'llm', 'ai', 'ml', 'api', 'database', 'sql', 'nosql',
      'git', 'github', 'ci/cd', 'testing', 'jest', 'vitest',
    ];

    const contentLower = content.toLowerCase();
    for (const term of techTerms) {
      if (contentLower.includes(term)) {
        tags.push(term);
      }
    }

    // Remove duplicates and limit
    return [...new Set(tags)].slice(0, 5);
  }
}

export default MemoryManager;
