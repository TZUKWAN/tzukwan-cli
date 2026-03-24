import { httpRequestWithRetry } from './shared/http-utils.js';

export interface OpenAlexAuthor {
  id: string;
  displayName: string;
  orcid?: string;
}

export interface OpenAlexConcept {
  id: string;
  displayName: string;
  score: number;
  level: number;
}

export interface OpenAlexWork {
  id: string;
  title: string;
  authors: OpenAlexAuthor[];
  year: number | null;
  citations: number;
  doi: string | null;
  concepts: OpenAlexConcept[];
  abstract: string | null;
  openAccessUrl: string | null;
  type: string;
  venue: string | null;
  isOpenAccess: boolean;
}

/** Raw author object as returned by the OpenAlex API */
interface RawOpenAlexAuthor {
  id?: string;
  display_name?: string;
  orcid?: string;
}

/** Raw authorship object as returned by the OpenAlex API */
interface RawOpenAlexAuthorship {
  author?: RawOpenAlexAuthor;
}

/** Raw concept object as returned by the OpenAlex API */
interface RawOpenAlexConcept {
  id?: string;
  display_name?: string;
  score?: number;
  level?: number;
}

/** Raw work object as returned by the OpenAlex API */
interface RawOpenAlexWork {
  id?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  authorships?: RawOpenAlexAuthorship[];
  concepts?: RawOpenAlexConcept[];
  abstract_inverted_index?: Record<string, number[]>;
  open_access?: { oa_url?: string; is_oa?: boolean };
  type?: string;
  /** Legacy field, superseded by primary_location */
  host_venue?: { display_name?: string };
  primary_location?: { source?: { display_name?: string } };
  best_oa_location?: { pdf_url?: string };
}

interface OpenAlexSearchOptions {
  limit?: number;
  filter?: string;
  sortBy?: 'cited_by_count' | 'publication_date' | 'relevance_score';
  cursor?: string;
}

interface OpenAlexSearchResponse {
  results: OpenAlexWork[];
  meta?: {
    count?: number;
    db_response_time_ms?: number;
    page?: number;
    per_page?: number;
  };
  nextCursor?: string;
}

const BASE_URL = 'https://api.openalex.org';

export class OpenAlexClient {
  private readonly email: string;

  constructor(email: string = 'research@tzukwan.io') {
    this.email = email;
  }

  async search(query: string, options: OpenAlexSearchOptions = {}): Promise<OpenAlexSearchResponse> {
    const { limit = 20, filter, sortBy = 'relevance_score', cursor } = options;

    const params = new URLSearchParams({
      search: query,
      per_page: String(Math.min(limit, 200)),
      mailto: this.email,
    });
    if (sortBy !== 'relevance_score') {
      params.set('sort', `${sortBy}:desc`);
    }
    if (filter) params.set('filter', filter);
    if (cursor) params.set('cursor', cursor);

    try {
      const response = await httpRequestWithRetry({
        method: 'GET',
        url: `${BASE_URL}/works?${params.toString()}`,
        timeout: 30000,
        headers: { 'User-Agent': `tzukwan-cli/1.0 (mailto:${this.email})` },
      });
      const data = response.data as {
        results?: RawOpenAlexWork[];
        meta?: { count?: number; db_response_time_ms?: number; page?: number; per_page?: number };
        next_cursor?: string;
      };
      const results: RawOpenAlexWork[] = data?.results ?? [];
      return {
        results: results.map((item) => this.normalizeWork(item)),
        meta: data?.meta,
        nextCursor: data?.next_cursor,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAlex search failed for query "${query}": ${msg}`);
    }
  }

  /**
   * Search for works with automatic pagination to retrieve large result sets.
   * Handles pagination internally and returns all results up to maxResults.
   */
  async searchAll(query: string, options: Omit<OpenAlexSearchOptions, 'cursor'> & { maxResults?: number } = {}): Promise<OpenAlexWork[]> {
    const { maxResults = 1000, ...searchOptions } = options;
    const allResults: OpenAlexWork[] = [];
    let cursor: string | undefined;
    let prevCursor: string | undefined;
    const maxPages = Math.ceil(maxResults / 25) + 5; // hard stop to prevent infinite loop
    let pages = 0;

    while (allResults.length < maxResults && pages < maxPages) {
      const response = await this.search(query, { ...searchOptions, cursor, limit: Math.min(200, maxResults - allResults.length) });
      allResults.push(...response.results);

      const nextCursor = response.nextCursor;
      // Stop if: no cursor, no results, or cursor didn't advance (API loop guard)
      if (!nextCursor || response.results.length === 0 || nextCursor === prevCursor) {
        break;
      }
      prevCursor = cursor;
      cursor = nextCursor;
      pages++;
    }

    return allResults.slice(0, maxResults);
  }

  async getWork(id: string): Promise<OpenAlexWork> {
    const cleanId = id.replace('https://openalex.org/', '');
    const params = new URLSearchParams({ mailto: this.email });

    try {
      const response = await httpRequestWithRetry({
        method: 'GET',
        url: `${BASE_URL}/works/${encodeURIComponent(cleanId)}?${params.toString()}`,
        timeout: 30000,
        headers: { 'User-Agent': `tzukwan-cli/1.0 (mailto:${this.email})` },
      });
      if (!response.data) {
        throw new Error(`OpenAlex returned empty response for ID "${id}"`);
      }
      return this.normalizeWork(response.data as RawOpenAlexWork);
    } catch (error) {
      // Handle specific HTTP errors
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number; statusText?: string } };
        const status = axiosError.response?.status;
        if (status === 404) {
          throw new Error(`OpenAlex work not found: "${id}"`);
        }
        if (status === 429) {
          throw new Error(`OpenAlex rate limit exceeded. Please try again later.`);
        }
        if (status === 503) {
          throw new Error(`OpenAlex service unavailable. Please try again later.`);
        }
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAlex getWork failed for ID "${id}": ${msg}`);
    }
  }

  async searchByDoi(doi: string): Promise<OpenAlexWork> {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '');
    const params = new URLSearchParams({
      filter: `doi:${cleanDoi}`,
      mailto: this.email,
    });

    try {
      const response = await httpRequestWithRetry({
        method: 'GET',
        url: `${BASE_URL}/works?${params.toString()}`,
        timeout: 30000,
        headers: { 'User-Agent': `tzukwan-cli/1.0 (mailto:${this.email})` },
      });
      const results: RawOpenAlexWork[] = (response.data as { results?: RawOpenAlexWork[] })?.results ?? [];
      if (results.length === 0) {
        throw new Error(`Work not found for DOI: ${doi}`);
      }
      return this.normalizeWork(results[0]!);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Work not found')) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAlex searchByDoi failed for DOI "${doi}": ${msg}`);
    }
  }

  private normalizeWork(raw: RawOpenAlexWork): OpenAlexWork {
    const authors: OpenAlexAuthor[] = [];
    const authorships: RawOpenAlexAuthorship[] = raw.authorships ?? [];
    for (const authorship of authorships) {
      const a = authorship.author;
      if (a) {
        authors.push({
          id: a.id ?? '',
          displayName: a.display_name ?? '',
          orcid: a.orcid ?? undefined,
        });
      }
    }

    const concepts: OpenAlexConcept[] = [];
    const rawConcepts: RawOpenAlexConcept[] = raw.concepts ?? [];
    for (const c of rawConcepts) {
      concepts.push({
        id: c.id ?? '',
        displayName: c.display_name ?? '',
        score: c.score ?? 0,
        level: c.level ?? 0,
      });
    }

    let abstract: string | null = null;
    if (raw.abstract_inverted_index) {
      abstract = this.reconstructAbstract(raw.abstract_inverted_index);
    }

    const doi = raw.doi
      ? raw.doi.replace('https://doi.org/', '')
      : null;

    const venue =
      raw.host_venue?.display_name ??
      raw.primary_location?.source?.display_name ??
      null;

    const openAccessUrl =
      raw.open_access?.oa_url ??
      raw.best_oa_location?.pdf_url ??
      null;

    return {
      id: raw.id ?? '',
      title: raw.title ?? '',
      authors,
      year: raw.publication_year ?? null,
      citations: raw.cited_by_count ?? 0,
      doi,
      concepts,
      abstract,
      openAccessUrl,
      type: raw.type ?? 'unknown',
      venue,
      isOpenAccess: raw.open_access?.is_oa ?? false,
    };
  }

  private reconstructAbstract(invertedIndex: Record<string, number[]>): string {
    const positions: Map<number, string> = new Map();

    for (const [word, wordPositions] of Object.entries(invertedIndex)) {
      for (const pos of wordPositions) {
        positions.set(pos, word);
      }
    }

    // Handle empty positions case
    if (positions.size === 0) {
      return '';
    }

    const maxPos = Math.max(...positions.keys());
    const words: string[] = [];
    for (let i = 0; i <= maxPos; i++) {
      words.push(positions.get(i) ?? '');
    }

    return words.filter(Boolean).join(' ');
  }
}
