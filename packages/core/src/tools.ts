import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import type { Tool, ToolResult } from './types.js';
import type { PermissionManager } from './permissions.js';
import type { HookManager } from './hooks.js';

/**
 * Local ArxivClient implementation to avoid circular dependency with @tzukwan/research
 */
class ArxivClient {
  private readonly baseUrl = 'https://export.arxiv.org/api/query';
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: false,
    });
  }

  async search(query: string, options?: { maxResults?: number; sortBy?: string; sortOrder?: string }): Promise<any[]> {
    const maxResults = options?.maxResults ?? 10;
    const url = `${this.baseUrl}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=${options?.sortBy ?? 'relevance'}&sortOrder=${options?.sortOrder ?? 'descending'}`;
    const response = await axios.get(url, { timeout: 30000 });
    return this.parseFeed(response.data);
  }

  async getPaper(arxivId: string): Promise<any | null> {
    const cleanId = arxivId.replace(/^arxiv:/, '');
    const url = `${this.baseUrl}?id_list=${cleanId}`;
    const response = await axios.get(url, { timeout: 30000 });
    const papers = this.parseFeed(response.data);
    return papers.length > 0 ? papers[0] : null;
  }

  private parseFeed(xmlData: string): any[] {
    const parsed = this.parser.parse(xmlData);
    const entries = parsed.feed?.entry || [];
    const entryArray = Array.isArray(entries) ? entries : [entries].filter(Boolean);

    return entryArray.map((entry: any) => ({
      id: entry.id?.replace('http://arxiv.org/abs/', '') || '',
      title: this.cleanText(entry.title),
      authors: this.extractAuthors(entry.author),
      abstract: this.cleanText(entry.summary),
      categories: Array.isArray(entry.category) ? entry.category.map((c: any) => c['@_term']) : entry.category ? [entry.category['@_term']] : [],
      published: entry.published || '',
      pdfUrl: `https://arxiv.org/pdf/${entry.id?.replace('http://arxiv.org/abs/', '')}.pdf`,
      arxivUrl: entry.id || '',
    }));
  }

  private extractAuthors(authorData: any): string[] {
    if (!authorData) return [];
    if (Array.isArray(authorData)) {
      return authorData.map((a: any) => a.name).filter(Boolean);
    }
    return [authorData.name].filter(Boolean);
  }

  private cleanText(text: string): string {
    return text?.replace(/\s+/g, ' ').trim() || '';
  }
}

const execFileAsync = promisify(execFile);

/**
 * Maps tool names to the permission names they require.
 */
const TOOL_PERMISSION_MAP: Record<string, string> = {
  run_shell: 'shell-execute',
  execute_python: 'shell-execute',
  write_file: 'file-write',
  read_file: 'file-read',
  web_fetch: 'web-fetch',
  search_web: 'web-fetch',
  search_arxiv: 'arxiv-search',
  fetch_paper: 'arxiv-search',
  search_semantic_scholar: 'web-fetch',
  search_pubmed: 'pubmed-search',
  search_openalex: 'web-fetch',
  analyze_paper: 'arxiv-search',
  generate_paper: 'paper-generate',
  install_skill: 'shell-execute',
  update_skill: 'shell-execute',
  install_mcp_server: 'file-write',
  update_mcp_server: 'file-write',
};

/**
 * Registry for tools that can be invoked by the agent.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private permissionManager: PermissionManager | null = null;
  private hookManager: HookManager | null = null;

  /**
   * Attaches a PermissionManager so that executeTool() will enforce permissions.
   * @param pm - PermissionManager instance
   */
  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm;
  }

  /**
   * Attaches a HookManager so that executeTool() will fire pre-tool/post-tool events.
   * @param hm - HookManager instance
   */
  setHookManager(hm: HookManager): void {
    this.hookManager = hm;
  }

  /**
   * Registers a tool so it can be looked up and executed later.
   * @param tool - Tool definition
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool by name.
   * @param name - Tool name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Checks if a tool is registered.
   * @param name - Tool name
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Lists all registered tools.
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Executes a tool by name with the provided arguments.
   * Checks permissions if a PermissionManager is attached.
   * @param name - Tool name
   * @param args - Arguments to pass to the tool
   * @returns Result of the tool execution wrapped in ToolResult
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not found` };
    }

    // Enforce permissions when a PermissionManager is available
    if (this.permissionManager !== null) {
      const requiredPermission = TOOL_PERMISSION_MAP[name];
      if (requiredPermission !== undefined && !this.permissionManager.check(requiredPermission)) {
        return {
          success: false,
          error: `Permission denied: "${requiredPermission}" is required to use tool "${name}". Use the permissions command to allow it.`,
        };
      }
    }

    const timestamp = new Date().toISOString();
    if (this.hookManager) {
      try {
        await this.hookManager.trigger('pre-tool', { toolName: name, timestamp });
      } catch (hookErr) {
        console.warn('[ToolRegistry] pre-tool hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
      }
    }

    let toolResult: ToolResult;
    try {
      const result = await tool.execute(args);
      toolResult = { success: true, result };
    } catch (error) {
      toolResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (this.hookManager) {
      try {
        await this.hookManager.trigger('post-tool', {
          toolName: name,
          timestamp: new Date().toISOString(),
          error: toolResult.success ? undefined : toolResult.error,
        });
      } catch (hookErr) {
        console.warn('[ToolRegistry] post-tool hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
      }
    }

    return toolResult;
  }

  /**
   * Registers all built-in tools into this registry.
   */
  registerBuiltins(): void {
    for (const tool of builtInTools) {
      this.registerTool(tool);
    }
  }
}

/** Internal search result type */
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface OpenAlexWork {
  id?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]>;
  open_access?: { oa_url?: string; is_oa?: boolean };
  primary_location?: { source?: { display_name?: string } };
}

function reconstructOpenAlexAbstract(index?: Record<string, number[]>): string {
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Built-in tool definitions with complete parameter validation and error handling.
 */
export const builtInTools: Tool[] = [
  {
    name: 'read_file',
    description: 'Reads the contents of a file from disk.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8',
        },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const filePath = String(args['path'] ?? '');
      if (!filePath) throw new Error('path is required');

      const encoding = (args['encoding'] as BufferEncoding) ?? 'utf-8';
      const resolvedPath = path.resolve(filePath);

      try {
        const content = await fs.promises.readFile(resolvedPath, encoding);
        const stat = await fs.promises.stat(resolvedPath);
        return {
          content,
          path: resolvedPath,
          size: stat.size,
          encoding,
        };
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') throw new Error(`File not found: ${resolvedPath}`);
        if (e.code === 'EACCES') throw new Error(`Permission denied reading: ${resolvedPath}`);
        throw new Error(`Failed to read file ${resolvedPath}: ${e.message}`);
      }
    },
  },

  {
    name: 'write_file',
    description: 'Writes content to a file on disk. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
        content: { type: 'string', description: 'Content to write' },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8',
        },
        append: {
          type: 'boolean',
          description: 'Append to existing file instead of overwriting (default: false)',
          default: false,
        },
      },
      required: ['path', 'content'],
    },
    execute: async (args) => {
      const filePath = String(args['path'] ?? '');
      const content = String(args['content'] ?? '');
      if (!filePath) throw new Error('path is required');

      const encoding = (args['encoding'] as BufferEncoding) ?? 'utf-8';
      const append = args['append'] === true;
      const resolvedPath = path.resolve(filePath);
      const dir = path.dirname(resolvedPath);

      try {
        await fs.promises.mkdir(dir, { recursive: true });

        if (append) {
          await fs.promises.appendFile(resolvedPath, content, encoding);
        } else {
          await fs.promises.writeFile(resolvedPath, content, encoding);
        }

        const stat = await fs.promises.stat(resolvedPath);
        return {
          path: resolvedPath,
          bytesWritten: Buffer.byteLength(content, encoding),
          totalSize: stat.size,
          append,
        };
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        if (e.code === 'EACCES') throw new Error(`Permission denied writing: ${resolvedPath}`);
        throw new Error(`Failed to write file ${resolvedPath}: ${e.message}`);
      }
    },
  },

  {
    name: 'run_shell',
    description: 'Executes a shell command and returns its output. Enforces a 30-second timeout.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (default: current process cwd)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000, max: 30000)',
          default: 30000,
        },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const command = String(args['command'] ?? '').trim();
      if (!command) throw new Error('command is required');

      const cwd = args['cwd'] ? String(args['cwd']) : process.cwd();
      const rawTimeout = typeof args['timeout'] === 'number' && Number.isFinite(args['timeout']) ? args['timeout'] : 30000;
      const timeout = Math.min(Math.max(1, rawTimeout), 30000);

      // Verify working directory exists
      try {
        await fs.promises.access(cwd, fs.constants.R_OK);
      } catch {
        throw new Error(`Working directory does not exist or is not accessible: ${cwd}`);
      }

      try {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'sh';
        const shellArgs = isWindows ? ['/c', command] : ['-c', command];

        const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
          cwd,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        });

        return {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command,
          cwd,
          exitCode: 0,
        };
      } catch (error) {
        const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };

        if (e.code === 'ETIMEDOUT' || String(e.code).includes('timeout')) {
          throw new Error(`Command timed out after ${timeout}ms: ${command}`);
        }

        // Non-zero exit code – return output rather than throwing so callers
        // can inspect stderr
        return {
          stdout: (e.stdout ?? '').trim(),
          stderr: (e.stderr ?? e.message ?? '').trim(),
          command,
          cwd,
          exitCode: typeof e.code === 'number' ? e.code : 1,
        };
      }
    },
  },

  {
    name: 'web_fetch',
    description: 'Performs an HTTP GET request to fetch a web page or API endpoint.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        headers: {
          type: 'object',
          description: 'Additional HTTP headers',
          additionalProperties: { type: 'string' },
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 30000)',
          default: 30000,
        },
        responseType: {
          type: 'string',
          description: 'Expected response type: "text", "json" (default: "text")',
          default: 'text',
        },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      if (!url) throw new Error('url is required');

      const headers = (args['headers'] as Record<string, string>) ?? {};
      const rawTimeout = typeof args['timeout'] === 'number' && Number.isFinite(args['timeout']) ? args['timeout'] : 30000;
      const timeout = Math.min(Math.max(1, rawTimeout), 120000);
      const responseType = (args['responseType'] as 'text' | 'json') ?? 'text';

      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          Accept: responseType === 'json' ? 'application/json' : 'text/html,*/*',
          ...headers,
        },
        timeout,
        maxRedirects: 5,
        responseType: responseType === 'json' ? 'json' : 'text',
        validateStatus: (status) => status < 500,
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(
          Object.entries(response.headers as Record<string, string>).filter(
            ([k]) => !k.startsWith(':')
          )
        ),
        data: response.data,
        finalUrl: (response.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? url,
      };
    },
  },

  {
    name: 'search_web',
    description: [
      'Searches the web using the DuckDuckGo Instant Answer API and returns structured results.',
      'LIMITATION: This uses the DuckDuckGo Instant Answer API, not a full-text search engine.',
      'It works well for factual/entity queries but returns few or no results for academic/research queries.',
      'For academic literature, prefer search_arxiv, search_pubmed, or search_semantic_scholar instead.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
          default: 10,
        },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '').trim();
      if (!query) throw new Error('query is required');

      const maxResults = typeof args['maxResults'] === 'number' ? args['maxResults'] : 10;

      // Use DuckDuckGo Instant Answer API for structured results
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

      const apiResponse = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'tzukwan-cli/1.0 (academic research tool)',
        },
        timeout: 15000,
      });

      const data = apiResponse.data as DuckDuckGoResponse;
      const results: SearchResult[] = [];

      // Collect results from RelatedTopics
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= maxResults) break;

          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0] ?? topic.Text.substring(0, 80),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          } else if (Array.isArray(topic.Topics)) {
            // Nested topics (category groups)
            for (const subtopic of topic.Topics) {
              if (results.length >= maxResults) break;
              if (subtopic.FirstURL && subtopic.Text) {
                results.push({
                  title: subtopic.Text.split(' - ')[0] ?? subtopic.Text.substring(0, 80),
                  url: subtopic.FirstURL,
                  snippet: subtopic.Text,
                });
              }
            }
          }
        }
      }

      // If Instant Answer is available, prepend it
      if (data.AbstractURL && data.AbstractText && results.length < maxResults) {
        results.unshift({
          title: data.Heading ?? query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      const finalResults = results.slice(0, maxResults);

      // Warn when Instant Answer returns no results — common for academic/research queries
      const emptyHint =
        finalResults.length === 0
          ? 'No results found. The DuckDuckGo Instant Answer API is not a full-text search engine and rarely returns academic/research results. Consider using search_arxiv, search_pubmed, or search_semantic_scholar for academic queries.'
          : undefined;

      return {
        query,
        results: finalResults,
        count: finalResults.length,
        source: 'DuckDuckGo Instant Answer API',
        ...(emptyHint ? { warning: emptyHint } : {}),
      };
    },
  },

  // ─── Academic tools ───────────────────────────────────────────────────────

  {
    name: 'search_arxiv',
    description: 'Search arXiv preprint server for academic papers. Returns title, authors, abstract, and links.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { type: 'number', description: 'Max papers to return (default: 10)', default: 10 },
        sortBy: { type: 'string', description: 'Sort order: relevance | submittedDate | lastUpdatedDate (default: relevance)', default: 'relevance' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '').trim();
      if (!query) throw new Error('query is required');
      const maxResults = typeof args['maxResults'] === 'number' && !isNaN(args['maxResults']) ? Math.min(Math.max(1, Math.floor(args['maxResults'])), 50) : 10;
      const sortBy = String(args['sortBy'] ?? 'relevance') as 'relevance' | 'submittedDate' | 'lastUpdatedDate';

      const client = new ArxivClient();
      const papers = await client.search(query, { maxResults, sortBy });

      return {
        query,
        papers: papers.map((p) => ({
          arxivId: p.id,
          title: p.title,
          authors: p.authors.slice(0, 5),
          abstract: p.abstract.slice(0, 500) + (p.abstract.length > 500 ? '...' : ''),
          published: p.published.split('T')[0] ?? '',
          url: p.arxivUrl,
          pdfUrl: p.pdfUrl,
        })),
        count: papers.length,
        source: 'arXiv',
      };
    },
  },

  {
    name: 'fetch_paper',
    description: 'Fetches metadata and abstract for a specific arXiv paper by its ID (e.g., 2401.12345).',
    parameters: {
      type: 'object',
      properties: {
        arxivId: { type: 'string', description: 'arXiv paper ID, e.g. 2401.12345 or full URL' },
      },
      required: ['arxivId'],
    },
    execute: async (args) => {
      let arxivId = String(args['arxivId'] ?? '').trim();
      arxivId = arxivId.replace(/^.*arxiv\.org\/(?:abs|pdf)\//, '').replace(/\.pdf$/, '').replace(/v\d+$/, '');
      if (!arxivId) throw new Error('arxivId is required');

      const client = new ArxivClient();
      const paper = await client.getPaper(arxivId);
      if (!paper) {
        throw new Error(`Paper not found for arXiv ID: ${arxivId}`);
      }

      return {
        arxivId: paper.id,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        categories: paper.categories,
        published: paper.published.split('T')[0] ?? '',
        url: paper.arxivUrl,
        pdfUrl: paper.pdfUrl,
        doi: paper.doi,
      };
    },
  },

  {
    name: 'search_semantic_scholar',
    description: 'Search Semantic Scholar for peer-reviewed academic papers with citation counts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results to return (default: 10)', default: 10 },
        fields: { type: 'string', description: 'Comma-separated fields (default: title,authors,abstract,year,citationCount,externalIds)', default: 'title,authors,abstract,year,citationCount,externalIds' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '').trim();
      if (!query) throw new Error('query is required');
      const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 100) : 10;
      const fields = String(
        args['fields']
        ?? 'title,authors,abstract,year,citationCount,externalIds,url,venue,influentialCitationCount'
      );

      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;

      interface S2Paper {
        paperId: string;
        title: string;
        abstract?: string;
        year?: number;
        citationCount?: number;
        influentialCitationCount?: number;
        venue?: string;
        url?: string;
        authors?: Array<{ authorId: string; name: string }>;
        externalIds?: { ArXiv?: string; DOI?: string };
      }
      interface S2Response { data: S2Paper[]; total: number }

      try {
        const response = await axios.get<S2Response>(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'tzukwan-cli/1.0 (academic research tool)',
            'Accept': 'application/json',
          },
        });

        const papers = response.data.data.map((p: S2Paper) => ({
          paperId: p.paperId,
          title: p.title,
          abstract: p.abstract ? p.abstract.slice(0, 500) + (p.abstract.length > 500 ? '...' : '') : '',
          year: p.year,
          citationCount: p.citationCount ?? 0,
          influentialCitationCount: p.influentialCitationCount ?? 0,
          venue: p.venue ?? null,
          authors: (p.authors ?? []).slice(0, 5).map((a: { authorId: string; name: string }) => a.name),
          arxivId: p.externalIds?.ArXiv ?? null,
          doi: p.externalIds?.DOI ?? null,
          url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
        }));

        return { query, papers, total: response.data.total, source: 'Semantic Scholar' };
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status !== 429) {
          throw error;
        }

        const params = new URLSearchParams({
          search: query,
          per_page: String(Math.min(limit, 25)),
          mailto: 'research@tzukwan.io',
        });
        const fallback = await axios.get<{ results?: OpenAlexWork[] }>(
          `https://api.openalex.org/works?${params.toString()}`,
          {
            timeout: 30000,
            headers: {
              'User-Agent': 'tzukwan-cli/1.0 (mailto:research@tzukwan.io)',
              Accept: 'application/json',
            },
          },
        );
        const works = Array.isArray(fallback.data?.results) ? fallback.data.results : [];
        const papers = works.map((work) => ({
          paperId: work.id ?? '',
          title: work.title ?? '',
          abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index).slice(0, 500),
          year: work.publication_year ?? null,
          citationCount: work.cited_by_count ?? 0,
          influentialCitationCount: 0,
          venue: work.primary_location?.source?.display_name ?? null,
          authors: (work.authorships ?? [])
            .map((entry) => entry.author?.display_name ?? '')
            .filter(Boolean)
            .slice(0, 5),
          arxivId: null,
          doi: work.doi ? work.doi.replace('https://doi.org/', '') : null,
          url: work.open_access?.oa_url ?? work.id ?? '',
        }));

        return {
          query,
          papers,
          total: papers.length,
          source: 'Semantic Scholar',
          fallbackSource: 'OpenAlex',
          warning: 'Semantic Scholar rate-limited the request, so results were sourced from OpenAlex.',
        };
      }
    },
  },

  {
    name: 'search_pubmed',
    description: 'Search PubMed for biomedical and life science literature.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'PubMed search query (supports MeSH terms and boolean operators)' },
        maxResults: { type: 'number', description: 'Max papers to return (default: 10)', default: 10 },
        sortBy: { type: 'string', description: 'Sort order: relevance | date (default: relevance)', default: 'relevance' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '').trim();
      if (!query) throw new Error('query is required');
      const maxResults = typeof args['maxResults'] === 'number' ? Math.min(args['maxResults'], 100) : 10;
      const sortBy = args['sortBy'] === 'date' ? 'pub+date' : 'relevance';

      // Step 1: esearch to get PMIDs
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=${sortBy}&retmode=json`;

      interface ESearchResult { esearchresult: { idlist: string[] } }
      const searchResponse = await axios.get<ESearchResult>(searchUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (academic research tool)' },
      });

      const pmids = searchResponse.data.esearchresult.idlist;
      if (pmids.length === 0) return { query, papers: [], count: 0, source: 'PubMed' };

      // Step 2: efetch to get details
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&rettype=xml&retmode=xml`;
      const fetchResponse = await axios.get<string>(fetchUrl, {
        timeout: 20000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (academic research tool)' },
        responseType: 'text',
      });

      const xml = fetchResponse.data;
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['PubmedArticle', 'Author', 'PublicationType', 'ArticleId', 'AbstractText'].includes(name),
      });
      const parsed = parser.parse(xml) as {
        PubmedArticleSet?: {
          PubmedArticle?: Array<Record<string, unknown>> | Record<string, unknown>;
        };
      };

      const papers: Array<Record<string, unknown>> = [];
      const articleEntries = parsed.PubmedArticleSet?.PubmedArticle ?? [];
      const articleList = Array.isArray(articleEntries) ? articleEntries : [articleEntries];

      for (const article of articleList) {
        const citation = (article?.['MedlineCitation'] as Record<string, unknown> | undefined) ?? {};
        const articleData = (citation['Article'] as Record<string, unknown> | undefined) ?? {};
        const pubDate = ((articleData['Journal'] as Record<string, unknown> | undefined)?.['JournalIssue'] as Record<string, unknown> | undefined)?.['PubDate'] as Record<string, unknown> | undefined;

        const authorItems = (((articleData['AuthorList'] as Record<string, unknown> | undefined)?.['Author']) ?? []) as Array<Record<string, unknown>> | Record<string, unknown>;
        const authorList = Array.isArray(authorItems) ? authorItems : [authorItems];
        const authors = authorList
          .map((author) => {
            const last = String(author?.['LastName'] ?? '').trim();
            const first = String(author?.['ForeName'] ?? author?.['Initials'] ?? '').trim();
            return [first, last].filter(Boolean).join(' ').trim();
          })
          .filter(Boolean)
          .slice(0, 5);

        const abstractItems = ((articleData['Abstract'] as Record<string, unknown> | undefined)?.['AbstractText'] ?? []) as Array<string | Record<string, unknown>> | string | Record<string, unknown>;
        const abstractList = Array.isArray(abstractItems) ? abstractItems : [abstractItems];
        const abstract = abstractList
          .map((part) => typeof part === 'string' ? part : String(part?.['#text'] ?? ''))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);

        const articleIds = ((((article as Record<string, unknown>)['PubmedData'] as Record<string, unknown> | undefined)?.['ArticleIdList'] as Record<string, unknown> | undefined)?.['ArticleId'] ?? []) as Array<Record<string, unknown> | string> | Record<string, unknown> | string;
        const articleIdList = Array.isArray(articleIds) ? articleIds : [articleIds];
        const doiEntry = articleIdList.find((item) => typeof item === 'object' && item?.['@_IdType'] === 'doi');

        const pmidRaw = citation['PMID'];
        const pmid = typeof pmidRaw === 'string'
          ? pmidRaw.trim()
          : String((pmidRaw as Record<string, unknown> | undefined)?.['#text'] ?? '').trim();

        const year = pubDate?.['Year']
          ? Number(pubDate['Year'])
          : (() => {
              const medlineDate = String(pubDate?.['MedlineDate'] ?? '');
              const match = medlineDate.match(/\d{4}/);
              return match ? Number(match[0]) : null;
            })();

        papers.push({
          pmid,
          title: String(articleData['ArticleTitle'] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
          authors,
          abstract,
          year: Number.isFinite(year) ? year : null,
          doi: typeof doiEntry === 'string' ? doiEntry.trim() : String((doiEntry as Record<string, unknown> | undefined)?.['#text'] ?? '').trim() || null,
          journal: String(((articleData['Journal'] as Record<string, unknown> | undefined)?.['Title']) ?? '').trim(),
          url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '',
        });
      }

      return { query, papers, count: papers.length, source: 'PubMed' };
    },
  },

  {
    name: 'search_openalex',
    description: 'Search OpenAlex for academic papers with strong metadata coverage and citation counts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results to return (default: 10)', default: 10 },
        sortBy: {
          type: 'string',
          description: 'Sort order: relevance | date | citations (default: relevance)',
          default: 'relevance',
        },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = String(args['query'] ?? '').trim();
      if (!query) throw new Error('query is required');
      const limit = typeof args['limit'] === 'number' ? Math.min(Math.max(1, Math.floor(args['limit'])), 50) : 10;
      const sortByArg = String(args['sortBy'] ?? 'relevance');
      const sort = sortByArg === 'citations'
        ? 'cited_by_count:desc'
        : sortByArg === 'date'
        ? 'publication_date:desc'
        : null;

      const params = new URLSearchParams({
        search: query,
        per_page: String(limit),
        mailto: 'research@tzukwan.io',
      });
      if (sort) params.set('sort', sort);

      const response = await axios.get<{ results?: OpenAlexWork[] }>(
        `https://api.openalex.org/works?${params.toString()}`,
        {
          timeout: 30000,
          headers: {
            'User-Agent': 'tzukwan-cli/1.0 (mailto:research@tzukwan.io)',
            Accept: 'application/json',
          },
        },
      );

      const works = Array.isArray(response.data?.results) ? response.data.results : [];
      return {
        query,
        papers: works.map((work) => ({
          id: work.id ?? '',
          title: work.title ?? '',
          authors: (work.authorships ?? [])
            .map((entry) => entry.author?.display_name ?? '')
            .filter(Boolean)
            .slice(0, 5),
          abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index).slice(0, 500),
          year: work.publication_year ?? null,
          citationCount: work.cited_by_count ?? 0,
          doi: work.doi ? work.doi.replace('https://doi.org/', '') : null,
          journal: work.primary_location?.source?.display_name ?? null,
          isOpenAccess: work.open_access?.is_oa ?? false,
          url: work.open_access?.oa_url ?? work.id ?? '',
        })),
        count: works.length,
        source: 'OpenAlex',
      };
    },
  },

  {
    name: 'execute_python',
    description: 'Executes Python code and returns stdout/stderr. Python must be installed on the system.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
        timeout: { type: 'number', description: 'Execution timeout in milliseconds (default: 30000, max: 60000)', default: 30000 },
      },
      required: ['code'],
    },
    execute: async (args) => {
      const code = String(args['code'] ?? '');
      if (!code) throw new Error('code is required');
      const rawPyTimeout = typeof args['timeout'] === 'number' && Number.isFinite(args['timeout']) ? args['timeout'] : 30000;
      const timeout = Math.min(Math.max(1, rawPyTimeout), 60000);

      const tmpFile = path.join(
        os.tmpdir(),
        `tzukwan_py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`
      );

      try {
        await fs.promises.writeFile(tmpFile, code, 'utf-8');

        // Try python3 first, then python
        let pythonBin = 'python3';
        try {
          await execFileAsync(pythonBin, ['--version'], { timeout: 5000 });
        } catch (error) {
          pythonBin = 'python';
        }

        const { stdout, stderr } = await execFileAsync(pythonBin, [tmpFile], {
          timeout,
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024,
        });

        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, pythonBin };
      } catch (error) {
        const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
        return {
          stdout: (e.stdout ?? '').trim(),
          stderr: (e.stderr ?? e.message ?? '').trim(),
          exitCode: typeof e.code === 'number' ? e.code : 1,
        };
      } finally {
        try { await fs.promises.unlink(tmpFile); } catch { /* ignore */ }
      }
    },
  },

  {
    name: 'analyze_paper',
    description: [
      'Fetches raw metadata (title, authors, abstract, URL) for a paper from arXiv or a general URL.',
      'IMPORTANT: This tool does NOT perform LLM-based analysis itself — it returns the raw paper data.',
      'Intended workflow: call this tool to retrieve the paper metadata, then pass the returned abstract',
      'and metadata to an LLM with a prompt asking for structured analysis (contributions, methodology, limitations, related citations).',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'arXiv ID (e.g. 2401.12345) or URL to a paper' },
      },
      required: ['source'],
    },
    execute: async (args) => {
      const source = String(args['source'] ?? '').trim();
      if (!source) throw new Error('source is required');

      // Determine if source is an arXiv ID or URL
      const isArxivId = /^\d{4}\.\d{4,6}(v\d+)?$/.test(source);
      const isArxivUrl = source.includes('arxiv.org');

      let paperData: Record<string, unknown> = {};

      if (isArxivId || isArxivUrl) {
        const arxivId = isArxivId
          ? source.replace(/v\d+$/, '')
          : source.replace(/^.*arxiv\.org\/(?:abs|pdf)\//, '').replace(/\.pdf$/, '').replace(/v\d+$/, '');

        const client = new ArxivClient();
        try {
          const paper = await client.getPaper(arxivId);
          if (!paper) {
            throw new Error(`Paper not found on arXiv: ${arxivId}`);
          }
          paperData = {
            arxivId: paper.id,
            title: paper.title,
            authors: paper.authors,
            abstract: paper.abstract,
            categories: paper.categories,
            published: (paper.published ?? '').split('T')[0],
            url: paper.arxivUrl,
            pdfUrl: paper.pdfUrl,
            doi: paper.doi,
          };
        } catch {
          // Paper not found or fetch failed — paperData stays empty
        }
      } else {
        // Treat as a general URL
        const response = await axios.get<string>(source, {
          timeout: 20000,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' },
          responseType: 'text',
        });
        const html = response.data;
        // Extract title from HTML
        const titleM = /<title[^>]*>(.*?)<\/title>/si.exec(html);
        paperData = {
          url: source,
          title: titleM ? titleM[1]!.replace(/\s+/g, ' ').trim() : source,
          rawHtml: html.slice(0, 3000),
        };
      }

      return {
        source,
        paper: paperData,
        analysisNote: 'Pass the paper abstract and metadata above to an LLM to perform structured analysis: key contributions, methodology, limitations, and related citations to follow up on.',
      };
    },
  },

  {
    name: 'generate_paper',
    description: [
      'Generates a structured academic paper TEMPLATE (skeleton/outline) for a given section or the full paper.',
      'IMPORTANT: This tool produces a Markdown scaffold with placeholder text and TODO comments — it does NOT call an LLM or write prose.',
      'Intended workflow: (1) call this tool to get the template structure, (2) pass the returned content to an LLM to fill each section.',
      'Provide the "context" parameter with your research question, key findings, and methodology so the template',
      'embeds your specifics as structured TODO comments for the LLM to act on.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Paper title' },
        section: {
          type: 'string',
          description: 'Section to generate: abstract | introduction | methodology | results | conclusion | full-outline (default: full-outline)',
          default: 'full-outline',
        },
        context: {
          type: 'string',
          description: 'Research context to embed as TODO comments: research question, key findings, datasets, methods. This text is inserted into the template so an LLM can fill in the actual content.',
        },
        keywords: {
          type: 'string',
          description: 'Comma-separated keywords (used in the abstract template)',
        },
        outputPath: { type: 'string', description: 'Optional file path to save the output (e.g., ~/paper/draft.md)' },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const title = String(args['title'] ?? '').trim();
      const section = String(args['section'] ?? 'full-outline');
      const context = String(args['context'] ?? '').trim();
      const keywords = String(args['keywords'] ?? '').trim();
      const outputPath = args['outputPath'] ? String(args['outputPath']) : null;

      const now = new Date().toISOString().split('T')[0];

      // Build a context comment block that embeds user-provided research context as TODO guidance
      const contextBlock = context
        ? `<!--\nRESEARCH CONTEXT (use this to fill in the sections below):\n${context}\n-->\n\n`
        : '';

      const keywordsLine = keywords
        ? `*Keywords:* ${keywords}`
        : '*Keywords:* [keyword1; keyword2; keyword3; keyword4; keyword5]';

      const templates: Record<string, string> = {
        'full-outline': `${contextBlock}# ${title}

**Date:** ${now}

## Abstract
<!-- TODO: Write ~250 words covering background, objective, methods, key results, and conclusion -->
[Provide a concise summary (~250 words) covering: background, objective, methods, key results, conclusion]

${keywordsLine}

## 1. Introduction
### 1.1 Research Background and Motivation
<!-- TODO: Establish the significance of the research area, progressively narrow to the specific problem -->

### 1.2 Research Problem and Objectives
<!-- TODO: State research questions clearly -->

### 1.3 Research Contributions
<!-- TODO: List 3-5 specific contributions -->

### 1.4 Paper Organisation

## 2. Related Work
### 2.1 [Subtheme 1]
<!-- TODO: Review relevant prior work -->

### 2.2 [Subtheme 2]
<!-- TODO: Review relevant prior work -->

### 2.3 Research Gap
<!-- TODO: Identify what prior work has NOT addressed -->

## 3. Methodology / Model
### 3.1 Problem Formulation
<!-- TODO: Define variables, notation, and problem formally -->

### 3.2 Proposed Approach
<!-- TODO: Describe the method in detail -->

### 3.3 Implementation Details
<!-- TODO: Datasets, hyperparameters, software, hardware -->

## 4. Experiments / Empirical Analysis
### 4.1 Data Description
### 4.2 Experimental Setup
### 4.3 Main Results
<!-- TODO: Present tables/figures and interpret results -->

### 4.4 Robustness Checks / Ablation

## 5. Discussion
### 5.1 Main Findings Interpretation
### 5.2 Theoretical Implications
### 5.3 Practical Implications
### 5.4 Limitations

## 6. Conclusion

## References

---
*Template generated by Tzukwan CLI on ${now} — fill in sections marked with TODO comments*
`,
        abstract: `${contextBlock}## Abstract

<!-- TODO Background: 1-2 sentences establishing the research problem and its importance -->

<!-- TODO Gap: 1 sentence on what previous work has NOT addressed -->

<!-- TODO Objective: 1 sentence stating what this paper does -->

<!-- TODO Methods: 2-3 sentences describing the research design, data, and analytical approach -->

<!-- TODO Results: 2-3 sentences on the key findings with specific numbers where possible -->

<!-- TODO Conclusion: 1-2 sentences on implications -->

${keywordsLine}
`,
        introduction: `${contextBlock}## 1. Introduction

### 1.1 Research Background and Motivation
<!-- TODO: Start broad — establish the real-world or theoretical significance of the research area -->
<!-- TODO: Progressively narrow to the specific problem -->

### 1.2 Research Problem and Questions
<!-- TODO: State research questions -->
**Research Question 1:** [RQ1]
**Research Question 2:** [RQ2]

### 1.3 Contributions of This Paper
This paper makes the following contributions:
1. **[Contribution 1]:** [Brief description]
2. **[Contribution 2]:** [Brief description]
3. **[Contribution 3]:** [Brief description]

### 1.4 Paper Organisation
The remainder of this paper is organised as follows. Section 2 reviews the related literature. Section 3 presents the methodology. Section 4 reports the empirical results. Section 5 discusses the findings and limitations. Section 6 concludes.
`,
        methodology: `${contextBlock}## 3. Methodology / Model

### 3.1 Problem Formulation
<!-- TODO: Define the problem formally with mathematical notation if appropriate -->

### 3.2 Proposed Approach
<!-- TODO: Describe the method, algorithm, or model architecture in detail -->

### 3.3 Implementation Details
<!-- TODO: Datasets used, train/test splits, hyperparameters, software stack, hardware -->
`,
        results: `${contextBlock}## 4. Experiments / Empirical Analysis

### 4.1 Data Description
<!-- TODO: Describe dataset(s), size, source, preprocessing steps -->

### 4.2 Experimental Setup
<!-- TODO: Baselines, evaluation metrics, experimental protocol -->

### 4.3 Main Results
<!-- TODO: Present primary results in tables or figures and interpret them -->

### 4.4 Robustness Checks / Ablation
<!-- TODO: Ablation studies, sensitivity analysis, error analysis -->
`,
        conclusion: `${contextBlock}## 6. Conclusion

<!-- TODO: Summarise the main contributions and findings (2-3 sentences) -->

<!-- TODO: State practical/theoretical implications -->

<!-- TODO: Acknowledge limitations and suggest future research directions -->
`,
      };

      const content = templates[section] ?? templates['full-outline']!;

      let savedPath: string | null = null;
      if (outputPath) {
        const resolvedPath = outputPath.replace('~', os.homedir());
        await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.promises.writeFile(resolvedPath, content, 'utf-8');
        savedPath = resolvedPath;
      }

      return {
        title,
        section,
        content,
        savedTo: savedPath,
        contextEmbedded: context.length > 0,
        note: 'This is a structural template with TODO comments. Pass the content to an LLM to fill in each section based on the embedded research context.',
      };
    },
  },

];

/** DuckDuckGo Instant Answer API response types */
interface DuckDuckGoTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
}

/**
 * Creates a ToolRegistry pre-populated with all built-in tools.
 * @param permissionManager - Optional PermissionManager to enforce tool permissions
 */
export function createToolRegistry(permissionManager?: PermissionManager): ToolRegistry {
  const registry = new ToolRegistry();
  if (permissionManager !== undefined) {
    registry.setPermissionManager(permissionManager);
  }
  registry.registerBuiltins();
  return registry;
}
