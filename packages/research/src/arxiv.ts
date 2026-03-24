import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import { getWithRetry } from './shared/http-utils.js';

const pipeline = promisify(stream.pipeline);

export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  published: string;
  updated: string;
  pdfUrl: string;
  arxivUrl: string;
  doi?: string;
}

export class ArxivClient {
  private readonly baseUrl = 'https://export.arxiv.org/api/query';
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['entry', 'author', 'category', 'link'].includes(name),
    });
  }

  async search(
    query: string,
    options: {
      maxResults?: number;
      categories?: string[];
      sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
      dateFrom?: string;
    } = {}
  ): Promise<ArxivPaper[]> {
    const { maxResults = 10, categories = [], sortBy = 'relevance', dateFrom } = options;

    let searchQuery = query;
    if (categories.length > 0) {
      const catQuery = categories.map((c) => `cat:${c}`).join(' OR ');
      searchQuery = `(${query}) AND (${catQuery})`;
    }

    // Fetch extra results when dateFrom is set so we can post-filter by year
    const fetchCount = dateFrom ? Math.min(maxResults * 3, 100) : maxResults;

    const params = new URLSearchParams({
      search_query: searchQuery,
      start: '0',
      max_results: String(fetchCount),
      sortBy,
      sortOrder: 'descending',
    });

    try {
      const response = await getWithRetry(`${this.baseUrl}?${params.toString()}`, {
        timeout: 600000, // 10 minutes
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });
      let results = this.parseAtomResponse(response.data as string);

      // Post-filter by year when dateFrom is provided (API date filter unreliable with text queries)
      if (dateFrom) {
        const fromYear = parseInt(dateFrom.slice(0, 4), 10);
        results = results.filter(p => new Date(p.published).getFullYear() >= fromYear);
      }

      return results.slice(0, maxResults);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`ArXiv search failed for query "${query}": ${msg}`);
    }
  }

  async getPaper(arxivId: string): Promise<ArxivPaper> {
    const cleanId = arxivId.replace(/^arxiv:/i, '').replace(/v\d+$/, '');
    const params = new URLSearchParams({
      id_list: cleanId,
    });

    try {
      const response = await getWithRetry(`${this.baseUrl}?${params.toString()}`, {
        timeout: 600000, // 10 minutes
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });

      const papers = this.parseAtomResponse(response.data as string);
      if (papers.length === 0) {
        throw new Error(`Paper not found: ${arxivId}`);
      }
      return papers[0];
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Paper not found')) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`ArXiv getPaper failed for ID "${arxivId}": ${msg}`);
    }
  }

  async downloadPdf(arxivId: string, outputDir: string): Promise<string> {
    const cleanId = arxivId.replace(/^arxiv:/i, '').replace(/v\d+$/, '').replace(/\.\.[\\/]/g, '');
    if (!/^\d{4}\.\d{4,6}$/.test(cleanId)) {
      throw new Error(`Invalid arXiv ID format: ${arxivId}`);
    }
    const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
    const fileName = `${cleanId.replace('/', '_')}.pdf`;
    const outputPath = path.join(outputDir, fileName);

    try {
      try { fs.mkdirSync(outputDir, { recursive: true }); } catch { /* non-fatal */ }

      if (fs.existsSync(outputPath)) {
        return outputPath;
      }

      const response = await axios.get(pdfUrl, {
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: 100 * 1024 * 1024, // 100 MB limit to prevent runaway downloads
        maxBodyLength: 100 * 1024 * 1024,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });

      await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(outputPath));
      return outputPath;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download PDF for "${arxivId}" from ${pdfUrl}: ${msg}`);
    }
  }

  async getRecent(categories: string[], days: number = 7, signal?: AbortSignal): Promise<ArxivPaper[]> {
    const now = new Date();
    const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const dateFrom = fromDate.toISOString().split('T')[0] ?? '';

    const catQuery = categories.map((c) => `cat:${c}`).join(' OR ');

    // Check if aborted before making request
    if (signal?.aborted) {
      throw new Error('AbortError');
    }

    const params = new URLSearchParams({
      search_query: catQuery,
      start: '0',
      max_results: '50',
      sortBy: 'submittedDate',
      sortOrder: 'descending',
    });

    try {
      const response = await getWithRetry(`${this.baseUrl}?${params.toString()}`, {
        timeout: 600000, // 10 minutes
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
        signal,
      });

      let results = this.parseAtomResponse(response.data as string);

      // Post-filter by date
      if (dateFrom) {
        const fromYear = parseInt(dateFrom.slice(0, 4), 10);
        results = results.filter(p => new Date(p.published).getFullYear() >= fromYear);
      }

      return results.slice(0, 50);
    } catch (error) {
      // Check if it's an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`ArXiv getRecent failed: ${msg}`);
    }
  }

  private parseAtomResponse(xml: string): ArxivPaper[] {
    try {
      // Check for empty or malformed XML
      if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
        console.warn('[arXiv] Empty XML response received');
        return [];
      }

      // Check for arXiv error response (HTML error page or text)
      if (xml.trim().startsWith('<!DOCTYPE html') || xml.trim().startsWith('<html')) {
        console.warn('[arXiv] Received HTML error page instead of XML');
        return [];
      }

      const parsed = this.parser.parse(xml) as { feed?: { entry?: Record<string, unknown> | Record<string, unknown>[] } };

      // Handle parser returning null/undefined
      if (!parsed) {
        console.warn('[arXiv] XML parser returned null');
        return [];
      }

      const feed = parsed?.feed;
      if (!feed) {
        // Check if it's an error response from arXiv API
        if ('error' in parsed && parsed.error) {
          console.warn(`[arXiv] API error: ${JSON.stringify(parsed.error)}`);
        }
        return [];
      }

      const entries: Record<string, unknown>[] = Array.isArray(feed.entry)
        ? feed.entry
        : feed.entry
        ? [feed.entry]
        : [];

      return entries.map((entry) => this.parseEntry(entry));
    } catch (error) {
      console.warn(`[arXiv] Failed to parse XML response: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private parseEntry(entry: Record<string, unknown>): ArxivPaper {
    const id: string = (typeof entry['id'] === 'string' ? (entry['id'] as string).trim() : '');
    const arxivId = id.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');

    const rawTitle = entry['title'];
    const title: string = (typeof rawTitle === 'string' ? rawTitle.trim() : '').replace(/\s+/g, ' ');
    const rawSummary = entry['summary'];
    const abstract: string = (typeof rawSummary === 'string' ? rawSummary.trim() : '').replace(/\s+/g, ' ');
    const rawPublished = entry['published'];
    const published: string = typeof rawPublished === 'string' ? rawPublished.trim() : '';
    const rawUpdated = entry['updated'];
    const updated: string = typeof rawUpdated === 'string' ? rawUpdated.trim() : '';

    const authors: string[] = [];
    const rawAuthor = entry['author'];
    if (Array.isArray(rawAuthor)) {
      for (const a of rawAuthor as Record<string, unknown>[]) {
        if (typeof a['name'] === 'string') authors.push((a['name'] as string).trim());
      }
    } else if (rawAuthor && typeof rawAuthor === 'object') {
      const authorObj = rawAuthor as Record<string, unknown>;
      if (typeof authorObj['name'] === 'string') authors.push((authorObj['name'] as string).trim());
    }

    const categories: string[] = [];
    const rawCategory = entry['category'];
    const rawCats: Record<string, unknown>[] = Array.isArray(rawCategory)
      ? rawCategory as Record<string, unknown>[]
      : rawCategory
      ? [rawCategory as Record<string, unknown>]
      : [];
    for (const cat of rawCats) {
      const term = (cat['@_term'] ?? cat['term'] ?? '') as string;
      if (term) categories.push(term);
    }

    let pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    let doi: string | undefined;

    const rawLink = entry['link'];
    const links: Record<string, unknown>[] = Array.isArray(rawLink)
      ? rawLink as Record<string, unknown>[]
      : rawLink
      ? [rawLink as Record<string, unknown>]
      : [];
    for (const link of links) {
      const rel = (link['@_rel'] ?? link['rel'] ?? '') as string;
      const href = (link['@_href'] ?? link['href'] ?? '') as string;
      const linkTitle = (link['@_title'] ?? link['title'] ?? '') as string;
      if (rel === 'related' && linkTitle === 'pdf') {
        if (href.startsWith('https://arxiv.org/pdf/')) {
          pdfUrl = href;
        }
      }
    }

    const rawDoi = entry['arxiv:doi'];
    const doiLink = typeof rawDoi === 'string' ? rawDoi.trim() : '';
    if (doiLink) doi = doiLink;

    return {
      id: arxivId,
      title,
      authors,
      abstract,
      categories,
      published,
      updated,
      pdfUrl,
      arxivUrl: `https://arxiv.org/abs/${arxivId}`,
      doi: doi || undefined,
    };
  }
}
