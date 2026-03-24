import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import type { LLMClient } from './llm-client.js';

export interface FrontierEntry {
  id: string;           // arxiv ID
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  publishedAt: string;
  relevanceScore: number;  // 0-1, computed by keyword match
  summary?: string;        // LLM-generated 2-sentence summary
  isBreakthrough?: boolean; // flagged as potentially significant
}

export interface FrontierReport {
  date: string;
  field: string;
  keywords: string[];
  entries: FrontierEntry[];
  generatedAt: string;
  totalFetched: number;
}

export class FrontierObserver {
  private frontierDir: string;

  constructor(
    private userField: string,
    private keywords: string[],
    private llmClient?: LLMClient,
    private summaryThreshold: number = 0.3
  ) {
    this.frontierDir = path.join(os.homedir(), '.tzukwan', 'frontiers');
    // Ensure dir exists — recursive:true is idempotent, eliminates TOCTOU
    try { fs.mkdirSync(this.frontierDir, { recursive: true }); } catch { /* non-fatal */ }
  }

  /**
   * Fetch latest papers from arxiv matching the user's field and keywords.
   */
  async fetchLatest(maxResults: number = 30): Promise<FrontierEntry[]> {
    const fieldTerm = this.userField.trim();
    const keywordTerms = this.keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .map((keyword) => `all:"${keyword.replace(/"/g, '\\"')}"`);
    const queryTerms = [
      fieldTerm ? `all:"${fieldTerm.replace(/"/g, '\\"')}"` : '',
      ...keywordTerms,
    ].filter(Boolean);
    const encodedQuery = encodeURIComponent(queryTerms.length > 0 ? queryTerms.join(' OR ') : 'all:"research"');

    const url = `https://export.arxiv.org/api/query?search_query=${encodedQuery}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;

    let xmlData: string;
    try {
      const response = await axios.get<string>(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (academic research tool)' },
        responseType: 'text',
      });
      xmlData = response.data;
    } catch (err) {
      throw new Error(`Failed to fetch from arXiv: ${String(err)}`);
    }

    const entries = this.parseArxivXml(xmlData);
    const scored = this.scoreRelevance(entries);
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Generate LLM summaries for high-relevance papers
    if (this.llmClient) {
      const highRelevance = scored.filter(e => e.relevanceScore >= this.summaryThreshold);
      for (const entry of highRelevance) {
        entry.summary = await this.generateSummary(entry);
      }
    }

    return scored;
  }

  /**
   * Generate a 2-sentence LLM summary for a paper.
   */
  private async generateSummary(entry: FrontierEntry): Promise<string> {
    if (!this.llmClient) return '';
    try {
      const prompt = `请用2句话（中文）简洁总结以下论文的核心贡献和意义，面向研究${this.userField}领域的学者：\n\n标题：${entry.title}\n\n摘要：${entry.abstract.slice(0, 1000)}`;
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 150, temperature: 0.3 }
      );
      return response.content.trim();
    } catch {
      // Fallback to truncated abstract on LLM error
      return entry.abstract.slice(0, 200).trim() + (entry.abstract.length > 200 ? '...' : '');
    }
  }

  /**
   * Parse arXiv Atom XML response using string/regex parsing.
   * No external XML parser needed.
   */
  private parseArxivXml(xml: string): FrontierEntry[] {
    const entries: FrontierEntry[] = [];

    // Split by <entry> tags
    const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryPattern.exec(xml)) !== null) {
      const entryXml = match[1];

      // Extract id (arXiv URL like http://arxiv.org/abs/2401.12345v1)
      const idMatch = /<id>(.*?)<\/id>/s.exec(entryXml);
      const fullId = idMatch ? idMatch[1].trim() : '';
      // Extract just the arXiv ID from the URL
      const arxivId = fullId.replace(/^.*\/abs\//, '').replace(/v\d+$/, '');

      // Extract title (remove newlines and extra spaces)
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entryXml);
      const title = titleMatch
        ? titleMatch[1].replace(/\s+/g, ' ').trim()
        : '';

      // Extract abstract (summary tag in arXiv Atom)
      const abstractMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entryXml);
      const abstract = abstractMatch
        ? abstractMatch[1].replace(/\s+/g, ' ').trim()
        : '';

      // Extract authors
      const authorPattern = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
      const authors: string[] = [];
      let authorMatch: RegExpExecArray | null;
      while ((authorMatch = authorPattern.exec(entryXml)) !== null) {
        authors.push(authorMatch[1].trim());
      }

      // Extract published date
      const publishedMatch = /<published>(.*?)<\/published>/.exec(entryXml);
      const publishedAt = publishedMatch ? publishedMatch[1].trim() : '';

      // Extract categories
      const categoryPattern = /<category\s+term="([^"]+)"/g;
      const categories: string[] = [];
      let catMatch: RegExpExecArray | null;
      while ((catMatch = categoryPattern.exec(entryXml)) !== null) {
        categories.push(catMatch[1]);
      }

      if (arxivId && title) {
        entries.push({
          id: arxivId,
          title,
          authors,
          abstract,
          categories,
          publishedAt,
          relevanceScore: 0, // will be computed below
        });
      }
    }

    return entries;
  }

  /**
   * Score relevance of each entry based on keyword match in title+abstract.
   * Returns normalized score between 0 and 1.
   */
  private scoreRelevance(entries: FrontierEntry[]): FrontierEntry[] {
    if (this.keywords.length === 0) {
      return entries.map(e => ({ ...e, relevanceScore: 0.5 }));
    }

    return entries.map(entry => {
      const text = `${entry.title} ${entry.abstract}`.toLowerCase();
      let matchCount = 0;

      for (const keyword of this.keywords) {
        const kw = keyword.toLowerCase();
        // Skip excessively long keywords to avoid performance issues
        if (kw.length > 200) continue;
        // Count occurrences (not just presence)
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = text.match(regex);
        if (matches) {
          // Title matches weighted 3x, abstract 1x
          const titleText = entry.title.toLowerCase();
          const titleMatches = titleText.match(regex);
          matchCount += (titleMatches ? titleMatches.length * 3 : 0) +
                        (matches.length - (titleMatches ? titleMatches.length : 0));
        }
      }

      // Normalize: cap at keywords.length * 5 for score = 1.0
      const maxScore = this.keywords.length * 5;
      const score = Math.min(matchCount / maxScore, 1.0);

      // Flag as breakthrough if score > 0.6 and multiple keyword hits in title
      const titleKwMatches = this.keywords.filter(kw =>
        entry.title.toLowerCase().includes(kw.toLowerCase())
      ).length;
      const isBreakthrough = score > 0.6 && titleKwMatches >= 2;

      return { ...entry, relevanceScore: score, isBreakthrough };
    });
  }

  /**
   * Generate a FrontierReport from entries and save to disk.
   */
  async generateReport(entries: FrontierEntry[]): Promise<FrontierReport> {
    const today = new Date().toISOString().split('T')[0];
    const report: FrontierReport = {
      date: today,
      field: this.userField,
      keywords: this.keywords,
      entries,
      generatedAt: new Date().toISOString(),
      totalFetched: entries.length,
    };

    const reportPath = path.join(this.frontierDir, `${today}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  /**
   * Load a report for a given date (defaults to today).
   */
  loadReport(date?: string): FrontierReport | null {
    const rawDate = date ?? new Date().toISOString().split('T')[0];
    // Validate date format (YYYY-MM-DD) to prevent path traversal attacks
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null;
    const targetDate = rawDate;
    const reportPath = path.join(this.frontierDir, `${targetDate}.json`);

    if (!fs.existsSync(reportPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(reportPath, 'utf-8');
      return JSON.parse(raw) as FrontierReport;
    } catch {
      return null;
    }
  }

  /**
   * List dates of all available reports.
   */
  listReports(): string[] {
    if (!fs.existsSync(this.frontierDir)) {
      return [];
    }

    return fs
      .readdirSync(this.frontierDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
      .reverse(); // most recent first
  }

  /**
   * Build a human-readable digest from a report, suitable for display or Telegram.
   */
  buildDigestText(report: FrontierReport): string {
    const lines: string[] = [];

    lines.push(`===== 科研前沿日报 =====`);
    lines.push(`日期：${report.date}`);
    lines.push(`领域：${report.field}`);
    lines.push(`关键词：${report.keywords.join(', ')}`);
    lines.push(`共获取论文：${report.totalFetched} 篇`);
    lines.push('');

    const breakthroughs = report.entries.filter(e => e.isBreakthrough);
    if (breakthroughs.length > 0) {
      lines.push(`--- 重要突破性工作 (${breakthroughs.length} 篇) ---`);
      for (const entry of breakthroughs.slice(0, 5)) {
        lines.push('');
        lines.push(`[${entry.id}] ${entry.title}`);
        lines.push(`作者：${entry.authors.slice(0, 3).join(', ')}${entry.authors.length > 3 ? ' 等' : ''}`);
        lines.push(`分类：${entry.categories.join(', ')}`);
        lines.push(`相关度：${(entry.relevanceScore * 100).toFixed(0)}%`);
        if (entry.summary) {
          lines.push(`摘要：${entry.summary}`);
        } else {
          const shortAbstract = entry.abstract.slice(0, 200).trim();
          lines.push(`摘要：${shortAbstract}${entry.abstract.length > 200 ? '...' : ''}`);
        }
        lines.push(`链接：https://arxiv.org/abs/${entry.id}`);
      }
      lines.push('');
    }

    const topEntries = report.entries
      .filter(e => !e.isBreakthrough)
      .slice(0, 10);

    if (topEntries.length > 0) {
      lines.push(`--- 近期相关论文 (Top ${Math.min(10, topEntries.length)} 篇) ---`);
      for (const entry of topEntries) {
        lines.push('');
        lines.push(`[${entry.id}] ${entry.title}`);
        lines.push(`作者：${entry.authors.slice(0, 2).join(', ')}${entry.authors.length > 2 ? ' 等' : ''}`);
        lines.push(`相关度：${(entry.relevanceScore * 100).toFixed(0)}%  |  发布：${entry.publishedAt.split('T')[0]}`);
        lines.push(`链接：https://arxiv.org/abs/${entry.id}`);
      }
    }

    lines.push('');
    lines.push(`生成时间：${report.generatedAt}`);
    lines.push(`========================`);

    return lines.join('\n');
  }
}
