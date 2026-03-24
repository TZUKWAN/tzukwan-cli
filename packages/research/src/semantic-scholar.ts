import { httpRequestWithRetry, RetryConfig } from './shared/http-utils.js';

export interface ScholarAuthor {
  authorId: string;
  name: string;
}

export interface ScholarPaper {
  paperId: string;
  title: string;
  authors: ScholarAuthor[];
  year: number | null;
  citationCount: number;
  abstract: string | null;
  url: string;
  externalIds?: {
    ArXiv?: string;
    DOI?: string;
    PubMed?: string;
  };
  venue?: string;
  referenceCount?: number;
  influentialCitationCount?: number;
}

const DEFAULT_FIELDS = [
  'paperId',
  'title',
  'authors',
  'year',
  'citationCount',
  'abstract',
  'url',
  'externalIds',
  'venue',
  'referenceCount',
  'influentialCitationCount',
];

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

// Default concurrency limit to prevent overwhelming the API
const DEFAULT_CONCURRENCY_LIMIT = 5;

/**
 * Process an array of items with limited concurrency
 */
async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const [index, item] of items.entries()) {
    const p = fn(item).then((result) => {
      results[index] = result;
    });
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((x) => x === p),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}

export class SemanticScholarClient {
  private readonly retryConfig: Partial<RetryConfig>;
  private readonly headers: Record<string, string>;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = retryConfig;
    this.headers = { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' };
  }

  async search(
    query: string,
    options: { limit?: number; fields?: string[] } = {}
  ): Promise<ScholarPaper[]> {
    const { limit = 10, fields = DEFAULT_FIELDS } = options;

    try {
      const params = new URLSearchParams({
        query,
        limit: String(limit),
        fields: fields.join(','),
      });
      const response = await httpRequestWithRetry(
        {
          method: 'GET',
          url: `${BASE_URL}/paper/search?${params.toString()}`,
          timeout: 30000,
          headers: this.headers,
        },
        this.retryConfig
      );

      const data = response.data as { data?: Record<string, unknown>[] };
      const items: Record<string, unknown>[] = data?.data ?? [];
      return items.map((item) => this.normalizePaper(item));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Semantic Scholar search failed for query "${query}": ${msg}`);
    }
  }

  async getPaper(paperId: string, fields: string[] = DEFAULT_FIELDS): Promise<ScholarPaper> {
    try {
      const params = new URLSearchParams({ fields: fields.join(',') });
      const response = await httpRequestWithRetry(
        {
          method: 'GET',
          url: `${BASE_URL}/paper/${encodeURIComponent(paperId)}?${params.toString()}`,
          timeout: 30000,
          headers: this.headers,
        },
        this.retryConfig
      );
      return this.normalizePaper(response.data as Record<string, unknown>);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Semantic Scholar getPaper failed for ID "${paperId}": ${msg}`);
    }
  }

  async getCitations(paperId: string, limit: number = 20): Promise<ScholarPaper[]> {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        fields: DEFAULT_FIELDS.join(','),
      });
      const response = await httpRequestWithRetry(
        {
          method: 'GET',
          url: `${BASE_URL}/paper/${encodeURIComponent(paperId)}/citations?${params.toString()}`,
          timeout: 30000,
          headers: this.headers,
        },
        this.retryConfig
      );
      const data = response.data as { data?: Record<string, unknown>[] };
      const items: Record<string, unknown>[] = data?.data ?? [];
      return items.map((item) => this.normalizePaper((item['citingPaper'] as Record<string, unknown>) ?? item));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Semantic Scholar getCitations failed for paper "${paperId}": ${msg}`);
    }
  }

  async getReferences(paperId: string, limit: number = 50): Promise<ScholarPaper[]> {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        fields: DEFAULT_FIELDS.join(','),
      });
      const response = await httpRequestWithRetry(
        {
          method: 'GET',
          url: `${BASE_URL}/paper/${encodeURIComponent(paperId)}/references?${params.toString()}`,
          timeout: 30000,
          headers: this.headers,
        },
        this.retryConfig
      );
      const data = response.data as { data?: Record<string, unknown>[] };
      const items: Record<string, unknown>[] = data?.data ?? [];
      return items.map((item) => this.normalizePaper((item['citedPaper'] as Record<string, unknown>) ?? item));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Semantic Scholar getReferences failed for paper "${paperId}": ${msg}`);
    }
  }

  async getAuthorPapers(authorId: string, limit: number = 50): Promise<ScholarPaper[]> {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        fields: DEFAULT_FIELDS.join(','),
      });
      const response = await httpRequestWithRetry(
        {
          method: 'GET',
          url: `${BASE_URL}/author/${encodeURIComponent(authorId)}/papers?${params.toString()}`,
          timeout: 30000,
          headers: this.headers,
        },
        this.retryConfig
      );
      const data = response.data as { data?: Record<string, unknown>[] };
      const items: Record<string, unknown>[] = data?.data ?? [];
      return items.map((item) => this.normalizePaper(item));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Semantic Scholar getAuthorPapers failed for author "${authorId}": ${msg}`);
    }
  }

  /**
   * Fetch multiple papers with concurrency limiting to avoid rate limits
   */
  async getPapersBatch(
    paperIds: string[],
    options: { fields?: string[]; concurrency?: number } = {}
  ): Promise<(ScholarPaper | null)[]> {
    const { fields = DEFAULT_FIELDS, concurrency = DEFAULT_CONCURRENCY_LIMIT } = options;

    return withConcurrencyLimit(paperIds, concurrency, async (paperId) => {
      try {
        return await this.getPaper(paperId, fields);
      } catch (error) {
        console.warn(`[Semantic Scholar] Failed to fetch paper ${paperId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
  }

  private normalizePaper(raw: Record<string, unknown>): ScholarPaper {
    const paperId = typeof raw['paperId'] === 'string' ? raw['paperId'] : '';
    return {
      paperId,
      title: typeof raw['title'] === 'string' ? raw['title'] : '',
      authors: Array.isArray(raw['authors'])
        ? (raw['authors'] as Record<string, unknown>[]).map((a) => ({
            authorId: typeof a['authorId'] === 'string' ? a['authorId'] : '',
            name: typeof a['name'] === 'string' ? a['name'] : '',
          }))
        : [],
      year: typeof raw['year'] === 'number' ? raw['year'] : null,
      citationCount: typeof raw['citationCount'] === 'number' ? raw['citationCount'] : 0,
      abstract: typeof raw['abstract'] === 'string' ? raw['abstract'] : null,
      url: typeof raw['url'] === 'string'
        ? raw['url']
        : paperId
        ? `https://www.semanticscholar.org/paper/${paperId}`
        : '',
      externalIds: raw['externalIds'] as ScholarPaper['externalIds'] ?? undefined,
      venue: typeof raw['venue'] === 'string' ? raw['venue'] : undefined,
      referenceCount: typeof raw['referenceCount'] === 'number' ? raw['referenceCount'] : undefined,
      influentialCitationCount: typeof raw['influentialCitationCount'] === 'number' ? raw['influentialCitationCount'] : undefined,
    };
  }
}
