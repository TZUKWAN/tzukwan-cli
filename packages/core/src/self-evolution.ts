// Self-evolution and learning system
// Tracks errors, usage patterns, and builds knowledge about how the CLI is being used

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ErrorRecord {
  id: string;
  timestamp: string;
  errorType: string;
  errorMessage: string;
  context?: string;     // what command/action caused it
  solution?: string;    // how it was resolved (if known)
  resolved: boolean;
  occurrences: number;
}

export interface UsagePattern {
  command: string;
  count: number;
  lastUsed: string;
  successRate: number;
}

export class SelfEvolution {
  private errorsFile: string;
  private patternsFile: string;
  private errors: Map<string, ErrorRecord> = new Map();
  private patterns: Map<string, UsagePattern> = new Map();
  private readonly MAX_ERROR_HISTORY = 1000; // Prevent unbounded memory growth
  private readonly MAX_PATTERNS = 500;

  constructor() {
    this.errorsFile = path.join(os.homedir(), '.tzukwan', 'error-history.jsonl');
    this.patternsFile = path.join(os.homedir(), '.tzukwan', 'usage-patterns.json');
    this.loadErrors();
    this.loadPatterns();
  }

  /**
   * Trim errors map to prevent memory unbounded growth
   */
  private trimErrors(): void {
    if (this.errors.size <= this.MAX_ERROR_HISTORY) return;
    // Keep most recent and highest occurrence errors
    const sorted = Array.from(this.errors.entries()).sort((a, b) => {
      const aScore = (Number.isFinite(a[1].occurrences) ? a[1].occurrences : 0) + (a[1].resolved ? 0 : 1000);
      const bScore = (Number.isFinite(b[1].occurrences) ? b[1].occurrences : 0) + (b[1].resolved ? 0 : 1000);
      return bScore - aScore;
    });
    this.errors.clear();
    for (const [key, value] of sorted.slice(0, this.MAX_ERROR_HISTORY)) {
      this.errors.set(key, value);
    }
  }

  /**
   * Trim patterns map to prevent memory unbounded growth
   */
  private trimPatterns(): void {
    if (this.patterns.size <= this.MAX_PATTERNS) return;
    // Keep most frequently used patterns
    const sorted = Array.from(this.patterns.entries()).sort((a, b) => b[1].count - a[1].count);
    this.patterns.clear();
    for (const [key, value] of sorted.slice(0, this.MAX_PATTERNS)) {
      this.patterns.set(key, value);
    }
  }

  /**
   * Record a new error occurrence. If a similar error was seen before, increments its counter.
   * Deduplication is based on errorType + errorMessage fingerprint.
   */
  recordError(errorType: string, errorMessage: string, context?: string): ErrorRecord {
    const fingerprint = this.buildFingerprint(errorType, errorMessage);

    // Check if we've seen this error before
    const existing = this.errors.get(fingerprint);
    if (existing) {
      existing.occurrences++;
      existing.timestamp = new Date().toISOString();
      if (context) {
        existing.context = context;
      }
      this.saveErrors();
      return existing;
    }

    const record: ErrorRecord = {
      id: fingerprint,
      timestamp: new Date().toISOString(),
      errorType,
      errorMessage,
      context,
      resolved: false,
      occurrences: 1,
    };

    this.errors.set(fingerprint, record);
    this.appendError(record);
    this.trimErrors(); // Prevent unbounded growth
    return record;
  }

  /**
   * Mark an error as resolved and store the solution for future reference
   */
  resolveError(id: string, solution: string): boolean {
    const record = this.errors.get(id);
    if (!record) {
      return false;
    }
    record.resolved = true;
    record.solution = solution;
    this.saveErrors();
    return true;
  }

  /**
   * Search for a known solution to a given error message using fuzzy text matching.
   * Returns the best matching resolved ErrorRecord, or null if none found.
   */
  findSolution(errorMessage: string): ErrorRecord | null {
    const normalizedQuery = errorMessage.toLowerCase().trim();
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

    let bestRecord: ErrorRecord | null = null;
    let bestScore = 0;

    for (const record of this.errors.values()) {
      if (!record.resolved || !record.solution) {
        continue;
      }

      const score = this.fuzzyScore(record.errorMessage.toLowerCase(), normalizedQuery, queryWords);
      if (score > bestScore) {
        bestScore = score;
        bestRecord = record;
      }
    }

    // Only return a result if there is meaningful similarity
    return bestScore >= 0.2 ? bestRecord : null;
  }

  /**
   * Record a command invocation (success or failure) and update usage stats
   */
  recordUsage(command: string, success: boolean): void {
    const existing = this.patterns.get(command);
    if (existing) {
      const totalBefore = existing.count;
      existing.count++;
      existing.lastUsed = new Date().toISOString();
      // Incrementally update success rate (guard against NaN from corrupted data)
      const safeRate = Number.isFinite(existing.successRate) ? existing.successRate : 0;
      const successCount = Math.round(safeRate * totalBefore) + (success ? 1 : 0);
      existing.successRate = successCount / existing.count;
    } else {
      this.patterns.set(command, {
        command,
        count: 1,
        lastUsed: new Date().toISOString(),
        successRate: success ? 1 : 0,
      });
    }
    this.trimPatterns(); // Prevent unbounded growth
    this.savePatterns();
  }

  /**
   * Get the most frequently used commands
   */
  getTopCommands(limit: number = 10): UsagePattern[] {
    const sorted = Array.from(this.patterns.values()).sort((a, b) => b.count - a.count);
    return sorted.slice(0, limit);
  }

  /**
   * Get unresolved errors sorted by occurrence count (most frequent first)
   */
  getUnresolvedErrors(limit: number = 20): ErrorRecord[] {
    const unresolved = Array.from(this.errors.values())
      .filter(e => !e.resolved)
      .sort((a, b) => b.occurrences - a.occurrences);
    return unresolved.slice(0, limit);
  }

  /**
   * Build a context string summarising known errors and solutions for injection into an LLM prompt
   */
  buildErrorContext(): string {
    const resolved = Array.from(this.errors.values()).filter(e => e.resolved && e.solution);
    if (resolved.length === 0) {
      return '';
    }

    const lines: string[] = ['## 已知错误及解决方案'];
    for (const record of resolved.slice(0, 10)) {
      lines.push(`- [${record.errorType}] ${record.errorMessage.slice(0, 100)}`);
      lines.push(`  解决方案: ${record.solution}`);
    }
    return lines.join('\n');
  }

  /**
   * Build a search query string to look up a solution for the given error online
   */
  buildSearchQuery(errorMessage: string): string {
    // Strip file paths, line numbers, and memory addresses that are specific to this run
    const cleaned = errorMessage
      .replace(/at\s+\S+:\d+:\d+/g, '')        // strip stack-frame locations
      .replace(/\b0x[0-9a-fA-F]+\b/g, '')       // strip memory addresses
      .replace(/\/[^\s]+\/[^\s]+/g, '')          // strip absolute unix paths
      .replace(/[A-Z]:\\[^\s]+/g, '')            // strip absolute windows paths
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 200);

    return `tzukwan-cli error: ${cleaned}`;
  }

  // ---------------------------------------------------------------------------
  // Auto-repair API
  // ---------------------------------------------------------------------------

  /**
   * Returns unresolved errors with occurrences >= minOccurrences (default 3),
   * sorted by occurrences descending — these are candidates for automatic repair.
   */
  getSelfRepairCandidates(minOccurrences: number = 3): ErrorRecord[] {
    return Array.from(this.errors.values())
      .filter(e => !e.resolved && e.occurrences >= minOccurrences)
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Attempt to automatically repair a single error by issuing a search and
   * recording the first useful response as a solution.
   *
   * NOTE: This method only records a *textual suggestion* as the solution.
   * It does NOT modify any source files or execute any code. The solution text
   * is stored in the ErrorRecord and surfaced via buildErrorContext() to inform
   * future LLM prompts or human review. Actual code changes must be applied
   * manually or by a separate code-modification agent acting on the suggestion.
   *
   * @param errorRecord  The error to repair
   * @param searchFn     An async function that accepts a query string and returns
   *                     a text response (e.g. from a web/arXiv search or LLM call)
   * @returns true if a solution was found and recorded, false otherwise
   */
  async autoRepair(
    errorRecord: ErrorRecord,
    searchFn: (query: string) => Promise<string>,
  ): Promise<boolean> {
    if (errorRecord.resolved) return false;
    if (errorRecord.occurrences < 3) return false;

    const query = this.buildSearchQuery(errorRecord.errorMessage);

    let response: string;
    try {
      response = await searchFn(query);
    } catch {
      return false;
    }

    if (!response || response.trim().length === 0) return false;

    // Heuristic: consider the response useful if it is long enough or contains
    // typical "solution" indicator phrases.
    const isUseful = this.isSolutionUseful(response);
    if (!isUseful) return false;

    const solutionText = response.slice(0, 2000);
    return this.resolveError(errorRecord.id, solutionText);
  }

  /**
   * Run a full auto-repair cycle: find all repair candidates and attempt to
   * resolve each one using the provided search function.
   *
   * @returns Stats with the number of attempted and repaired errors
   */
  async runAutoRepairCycle(
    searchFn: (query: string) => Promise<string>,
  ): Promise<{ repaired: number; attempted: number }> {
    const candidates = this.getSelfRepairCandidates();
    let repaired = 0;
    let attempted = 0;

    for (const candidate of candidates) {
      attempted++;
      const success = await this.autoRepair(candidate, searchFn);
      if (success) repaired++;
    }

    return { repaired, attempted };
  }

  // ---------------------------------------------------------------------------
  // Private helper for auto-repair
  // ---------------------------------------------------------------------------

  /**
   * Simple heuristic to decide whether a search result contains actionable
   * information that could serve as a solution hint.
   */
  private isSolutionUseful(text: string): boolean {
    // Reject very short responses
    if (text.trim().length < 50) return false;

    const lower = text.toLowerCase();

    // Positive indicators
    const positiveKeywords = [
      'solution', 'fix', 'resolve', 'workaround', 'error', 'issue',
      'problem', 'cause', 'because', 'try', 'install', 'update',
      'check', 'make sure', 'ensure', 'should', 'can be fixed',
      '解决', '修复', '原因', '方法', '可以',
    ];

    let matchCount = 0;
    for (const kw of positiveKeywords) {
      if (lower.includes(kw)) matchCount++;
    }

    // Require at least 2 positive keywords for the result to be considered useful
    return matchCount >= 2;
  }

  /**
   * Get high-level evolution stats
   */
  getStats(): { totalErrors: number; resolvedErrors: number; totalCommands: number; topCommand: string } {
    const totalErrors = this.errors.size;
    const resolvedErrors = Array.from(this.errors.values()).filter(e => e.resolved).length;
    const totalCommands = Array.from(this.patterns.values()).reduce((sum, p) => sum + p.count, 0);

    const top = this.getTopCommands(1);
    const topCommand = top.length > 0 ? top[0].command : '';

    return { totalErrors, resolvedErrors, totalCommands, topCommand };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a stable deduplication key for an error.
   * Uses errorType + djb2 hash of normalized message to minimize collision risk.
   */
  private buildFingerprint(errorType: string, errorMessage: string): string {
    // Normalize the message to remove run-specific details so the same logical
    // error maps to the same fingerprint across invocations
    const normalized = errorMessage
      .replace(/\b\d+\b/g, 'N')          // replace numbers
      .replace(/\/[^\s"']+/g, '/PATH')        // replace unix paths (stop at quotes)
      .replace(/[a-zA-Z]:\\[^\s"']+/g, 'PATH') // replace windows paths (both upper/lowercase drive)
      .slice(0, 120)
      .trim();
    // Use djb2 hash for consistent fingerprinting
    const hash = this.djb2(normalized);
    return `err_${errorType}_${hash}`;
  }

  /**
   * djb2 hash function - fast and good distribution for string hashing
   */
  private djb2(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return (hash >>> 0).toString(16); // Convert to unsigned and then hex
  }

  /**
   * Fuzzy similarity score between 0 and 1
   */
  private fuzzyScore(candidate: string, query: string, queryWords: string[]): number {
    let score = 0;

    // Exact substring match
    if (candidate.includes(query)) {
      score += 0.6;
    }

    // Individual word matches
    for (const word of queryWords) {
      if (candidate.includes(word)) {
        score += 0.1;
      }
    }

    // Normalise so longer queries don't unfairly dominate
    const wordMatchFraction = queryWords.filter(w => candidate.includes(w)).length / Math.max(queryWords.length, 1);
    score += wordMatchFraction * 0.3;

    return Math.min(1, score);
  }

  /**
   * Load error history from JSONL file
   */
  private loadErrors(): void {
    // Clear existing errors before loading to prevent stale data
    this.errors.clear();
    try {
      if (!fs.existsSync(this.errorsFile)) {
        const dir = path.dirname(this.errorsFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        return;
      }

      const content = fs.readFileSync(this.errorsFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const record: ErrorRecord = JSON.parse(line);
          if (record.id && record.errorType) {
            this.errors.set(record.id, record);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Load failure is non-fatal - ensure map is empty on failure
      this.errors.clear();
    }
  }

  /**
   * Load usage patterns from JSON file
   */
  private loadPatterns(): void {
    try {
      if (!fs.existsSync(this.patternsFile)) {
        return;
      }
      const raw = fs.readFileSync(this.patternsFile, 'utf-8');
      const list = JSON.parse(raw) as UsagePattern[];
      for (const pattern of list) {
        if (pattern.command) {
          this.patterns.set(pattern.command, pattern);
        }
      }
    } catch {
      // Load failure is non-fatal
    }
  }

  /**
   * Rewrite the entire error history JSONL file (used after mutations)
   */
  private saveErrors(): void {
    try {
      const dir = path.dirname(this.errorsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const lines = Array.from(this.errors.values()).map(e => JSON.stringify(e));
      fs.writeFileSync(this.errorsFile, lines.join('\n') + '\n', 'utf-8');
    } catch {
      // Save failure is non-fatal
    }
  }

  /**
   * Append a single new error record to the JSONL file
   */
  private appendError(record: ErrorRecord): void {
    try {
      const dir = path.dirname(this.errorsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.errorsFile, JSON.stringify(record) + '\n', 'utf-8');
    } catch {
      // Append failure is non-fatal
    }
  }

  /**
   * Persist usage patterns to disk
   */
  private savePatterns(): void {
    try {
      const dir = path.dirname(this.patternsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.patterns.values());
      fs.writeFileSync(this.patternsFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch {
      // Save failure is non-fatal
    }
  }
}
