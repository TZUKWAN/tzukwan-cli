// Per-paper workspace system for managing paper-specific context and agents

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PaperMeta {
  id: string;                // e.g. "arxiv:2301.00001" or user-defined
  title: string;
  authors?: string[];
  abstract?: string;
  url?: string;
  source?: string;           // "arxiv", "manual", etc.
  createdAt: string;
  lastAccessedAt: string;
  agentEnsemble?: string[];  // IDs of agents active for this paper
}

export interface PaperAgentConfig {
  agentId: string;
  name: string;
  emoji: string;
  role: string;
  systemPrompt: string;     // specialized prompt for this paper
  temperature?: number;
}

export class PaperWorkspace {
  private papersDir: string;
  private activeWorkspaceId: string | null = null;

  constructor() {
    this.papersDir = path.join(os.homedir(), '.tzukwan', 'papers');
    // Ensure dir exists — recursive:true is idempotent, eliminates TOCTOU
    try { fs.mkdirSync(this.papersDir, { recursive: true }); } catch { /* non-fatal */ }
  }

  /**
   * Create a new paper workspace
   */
  create(id: string, title: string, meta?: Partial<PaperMeta>): PaperMeta {
    const now = new Date().toISOString();
    const paperMeta: PaperMeta = {
      ...meta,
      id,
      title,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.ensurePaperDir(id);
    this.saveMeta(id, paperMeta);

    // Create empty notes file
    const notesPath = path.join(this.getPaperDir(id), 'notes.md');
    if (!fs.existsSync(notesPath)) {
      fs.writeFileSync(notesPath, `# ${title}\n\n`, 'utf-8');
    }

    // Create empty memory file
    const memoryPath = path.join(this.getPaperDir(id), 'memory.jsonl');
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, '', 'utf-8');
    }

    // Create agents directory
    const agentsDir = path.join(this.getPaperDir(id), 'agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    // Generate default agent ensemble
    const ensemble = this.generateAgentEnsemble(id, paperMeta);
    this.saveAgentEnsemble(id, ensemble);

    // Update meta with agent ensemble IDs
    paperMeta.agentEnsemble = ensemble.map(a => a.agentId);
    this.saveMeta(id, paperMeta);

    return paperMeta;
  }

  /**
   * Open an existing workspace (sets active)
   */
  open(id: string): PaperMeta | null {
    const meta = this.loadMeta(id);
    if (!meta) {
      return null;
    }

    // Update last accessed time
    meta.lastAccessedAt = new Date().toISOString();
    this.saveMeta(id, meta);

    this.activeWorkspaceId = id;
    return meta;
  }

  /**
   * Close the active workspace
   */
  close(): void {
    this.activeWorkspaceId = null;
  }

  /**
   * Get the active workspace metadata
   */
  getActive(): PaperMeta | null {
    if (!this.activeWorkspaceId) {
      return null;
    }
    return this.loadMeta(this.activeWorkspaceId);
  }

  /**
   * Get the absolute workspace directory for a paper.
   */
  getWorkspaceDir(id: string): string {
    return this.getPaperDir(id);
  }

  /**
   * List all paper workspaces
   */
  list(): PaperMeta[] {
    if (!fs.existsSync(this.papersDir)) {
      return [];
    }

    const papers: PaperMeta[] = [];
    const entries = fs.readdirSync(this.papersDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const meta = this.loadMeta(entry.name);
        if (meta) {
          papers.push(meta);
        }
      }
    }

    // Sort by last accessed (most recent first)
    papers.sort((a, b) => {
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });

    return papers;
  }

  /**
   * Delete a workspace
   */
  delete(id: string): boolean {
    const paperDir = this.getPaperDir(id);
    if (!fs.existsSync(paperDir)) {
      return false;
    }

    try {
      // Recursively remove directory
      fs.rmSync(paperDir, { recursive: true, force: true });

      if (this.activeWorkspaceId === id) {
        this.activeWorkspaceId = null;
      }

      return true;
    } catch (error) {
      console.error(`Failed to delete paper workspace ${id}:`, error);
      return false;
    }
  }

  /**
   * Update metadata
   */
  updateMeta(id: string, updates: Partial<PaperMeta>): boolean {
    const meta = this.loadMeta(id);
    if (!meta) {
      return false;
    }

    Object.assign(meta, updates);
    meta.lastAccessedAt = new Date().toISOString();
    this.saveMeta(id, meta);
    return true;
  }

  /**
   * Get path to paper-specific agent conversation file
   */
  getAgentConversationPath(paperId: string, agentId: string): string {
    const agentsDir = path.join(this.getPaperDir(paperId), 'agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    return path.join(agentsDir, `${agentId}.jsonl`);
  }

  /**
   * Get notes for a paper
   */
  getNotes(id: string): string {
    const notesPath = path.join(this.getPaperDir(id), 'notes.md');
    if (!fs.existsSync(notesPath)) {
      return '';
    }
    return fs.readFileSync(notesPath, 'utf-8');
  }

  /**
   * Update notes for a paper
   */
  updateNotes(id: string, content: string): void {
    this.ensurePaperDir(id);
    const notesPath = path.join(this.getPaperDir(id), 'notes.md');
    fs.writeFileSync(notesPath, content, 'utf-8');

    // Update last accessed
    const meta = this.loadMeta(id);
    if (meta) {
      meta.lastAccessedAt = new Date().toISOString();
      this.saveMeta(id, meta);
    }
  }

  /**
   * Build context string for the paper (for injecting into agent system prompts)
   */
  buildPaperContext(id: string): string {
    const meta = this.loadMeta(id);
    if (!meta) {
      return '';
    }

    const lines: string[] = ['## 当前论文工作空间'];
    lines.push(`标题: ${meta.title}`);

    if (meta.source) {
      lines.push(`来源: ${meta.source}`);
    }

    if (meta.authors && meta.authors.length > 0) {
      lines.push(`作者: ${meta.authors.join(', ')}`);
    }

    if (meta.url) {
      lines.push(`链接: ${meta.url}`);
    }

    if (meta.abstract) {
      lines.push(`摘要: ${meta.abstract}`);
    }

    // Add notes if they exist
    const notes = this.getNotes(id);
    if (notes.trim()) {
      lines.push('\n## 用户笔记');
      lines.push(notes.slice(0, 1000)); // Limit notes length
    }

    return lines.join('\n');
  }

  /**
   * Generate a default agent ensemble for a paper (5 specialized agents)
   * Each agent's system prompt includes the paper context
   */
  generateAgentEnsemble(paperId: string, paperMeta: PaperMeta): PaperAgentConfig[] {
    const paperContext = this.buildPaperContext(paperId);
    const agents: PaperAgentConfig[] = [
      {
        agentId: `${paperId}-reader`,
        name: 'Paper Reader',
        emoji: '📖',
        role: '论文阅读专家',
        systemPrompt: `你是一位专业的学术论文阅读专家。你的任务是仔细阅读并理解论文内容，提供清晰、准确的解释。

${paperContext}

你的职责：
1. 逐段分析论文内容，提取核心观点和关键信息
2. 解释复杂概念和技术术语，使其易于理解
3. 总结论文的主要贡献和创新点
4. 回答关于论文内容的任何具体问题

请用中文回复，保持专业且友好的语气。`,
        temperature: 0.3,
      },
      {
        agentId: `${paperId}-method`,
        name: 'Method Analyzer',
        emoji: '🔬',
        role: '方法分析专家',
        systemPrompt: `你是一位专业的研究方法分析专家。你的任务是深入分析论文中的方法、算法和实验设计。

${paperContext}

你的职责：
1. 详细分析论文提出的方法和算法
2. 评估方法的技术细节和实现难点
3. 分析实验设计的合理性和局限性
4. 与其他类似方法进行对比分析
5. 评估方法的可复现性

请用中文回复，注重技术细节和严谨性。`,
        temperature: 0.2,
      },
      {
        agentId: `${paperId}-critic`,
        name: 'Critic',
        emoji: '🔍',
        role: '批判性分析专家',
        systemPrompt: `你是一位批判性思维专家。你的任务是找出论文中的弱点、局限性和潜在改进空间。

${paperContext}

你的职责：
1. 识别论文方法论的潜在缺陷
2. 分析实验结果的可信度和局限性
3. 找出论文未解决的问题或遗漏的方面
4. 评估论文声明的合理性和证据支持
5. 提出具体的改进建议

请用中文回复，保持建设性的批评态度，避免无根据的指责。`,
        temperature: 0.4,
      },
      {
        agentId: `${paperId}-implementer`,
        name: 'Implementer',
        emoji: '💻',
        role: '代码实现专家',
        systemPrompt: `你是一位专业的算法实现专家。你的任务是帮助将论文中的算法和方法转化为实际代码。

${paperContext}

你的职责：
1. 根据论文描述提供算法实现方案
2. 编写清晰、高效的代码示例
3. 解释关键代码片段的逻辑
4. 提供测试用例和验证方法
5. 讨论实现中的注意事项和优化技巧

请用中文回复，代码注释可以使用英文。优先使用 Python 或 TypeScript。`,
        temperature: 0.2,
      },
      {
        agentId: `${paperId}-connector`,
        name: 'Connector',
        emoji: '🔗',
        role: '关联研究专家',
        systemPrompt: `你是一位学术关联研究专家。你的任务是找到与当前论文相关的其他研究工作。

${paperContext}

你的职责：
1. 识别论文引用的关键相关工作
2. 推荐该领域的经典和最新论文
3. 分析该研究在领域内的位置和影响
4. 指出可能的后续研究方向
5. 帮助建立知识图谱和文献网络

请用中文回复，提供具体的论文标题和作者信息。`,
        temperature: 0.4,
      },
    ];

    return agents;
  }

  /**
   * Get the agent ensemble for a paper
   */
  getAgentEnsemble(paperId: string): PaperAgentConfig[] {
    const ensemblePath = path.join(this.getPaperDir(paperId), 'agent-ensemble.json');
    if (!fs.existsSync(ensemblePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(ensemblePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load agent ensemble for ${paperId}:`, error);
      return [];
    }
  }

  /**
   * Save agent ensemble
   */
  saveAgentEnsemble(paperId: string, ensemble: PaperAgentConfig[]): void {
    this.ensurePaperDir(paperId);
    const ensemblePath = path.join(this.getPaperDir(paperId), 'agent-ensemble.json');
    fs.writeFileSync(ensemblePath, JSON.stringify(ensemble, null, 2), 'utf-8');
  }

  /**
   * Get the directory path for a paper
   */
  private getPaperDir(id: string): string {
    // Sanitize ID to be safe for filesystem
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.papersDir, safeId);
  }

  /**
   * Ensure paper directory exists
   */
  private ensurePaperDir(id: string): void {
    const paperDir = this.getPaperDir(id);
    // Both calls are idempotent with recursive:true — eliminates TOCTOU
    try { fs.mkdirSync(paperDir, { recursive: true }); } catch { /* non-fatal */ }
    try { fs.mkdirSync(path.join(paperDir, 'agents'), { recursive: true }); } catch { /* non-fatal */ }
  }

  /**
   * Load metadata for a paper
   */
  private loadMeta(id: string): PaperMeta | null {
    const metaPath = path.join(this.getPaperDir(id), 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load meta for ${id}:`, error);
      return null;
    }
  }

  /**
   * Save metadata for a paper
   */
  private saveMeta(id: string, meta: PaperMeta): void {
    this.ensurePaperDir(id);
    const metaPath = path.join(this.getPaperDir(id), 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}

export default PaperWorkspace;
