import axios from 'axios';
import { ArxivClient } from './arxiv.js';
import { PubMedClient } from './pubmed.js';
import { SemanticScholarClient } from './semantic-scholar.js';
import { OpenAlexClient } from './openallex.js';

export interface Citation {
  title: string;
  authors?: string[];
  year?: string | number;
  arxivId?: string;
  doi?: string;
  paperId?: string;
  journal?: string;
}

export interface VerificationResult {
  valid: boolean;
  confidence: number;
  source: string;
  details: string;
  resolvedTitle?: string;
  resolvedAuthors?: string[];
  resolvedYear?: string | number;
  resolvedJournal?: string;
  resolvedUrl?: string;
  resolvedDoi?: string;
  resolvedArxivId?: string;
  bibliographyEntry?: string;
  layers: {
    arxiv?: LayerResult;
    crossref?: LayerResult;
    openAlex?: LayerResult;
    pubmed?: LayerResult;
    semanticScholar?: LayerResult;
    llm?: LayerResult;
  };
}

interface CitationMetadata {
  title?: string;
  authors?: string[];
  year?: string | number;
  journal?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
}

interface LayerResult {
  checked: boolean;
  valid: boolean;
  confidence: number;
  message: string;
  metadata?: CitationMetadata;
}

export class CitationVerifier {
  private readonly arxiv: ArxivClient;
  private readonly pubmed: PubMedClient;
  private readonly scholar: SemanticScholarClient;
  private readonly openalex: OpenAlexClient;

  constructor() {
    this.arxiv = new ArxivClient();
    this.pubmed = new PubMedClient();
    this.scholar = new SemanticScholarClient();
    this.openalex = new OpenAlexClient();
  }

  async verify(citation: Citation): Promise<VerificationResult> {
    const layers: VerificationResult['layers'] = {};
    const validScores: number[] = [];
    const sources: string[] = [];

    if (citation.arxivId) {
      const layer = await this.verifyArxiv(citation.arxivId, citation.title);
      layers.arxiv = layer;
      if (layer.valid) {
        validScores.push(layer.confidence);
        sources.push('arXiv');
      }
    }

    if (citation.doi) {
      const layer = await this.verifyCrossRef(citation.doi, citation.title);
      layers.crossref = layer;
      if (layer.valid) {
        validScores.push(layer.confidence);
        sources.push('CrossRef');
      }

      const openAlexLayer = await this.verifyOpenAlexByDoi(citation.doi, citation.title);
      layers.openAlex = openAlexLayer;
      if (openAlexLayer.valid) {
        validScores.push(openAlexLayer.confidence);
        sources.push('OpenAlex');
      }
    }

    if (!layers.openAlex) {
      const openAlexLayer = await this.verifyOpenAlexByTitle(citation.title, citation.authors);
      layers.openAlex = openAlexLayer;
      if (openAlexLayer.valid) {
        validScores.push(openAlexLayer.confidence);
        sources.push('OpenAlex');
      }
    }

    const pubmedLayer = await this.verifyPubMed(citation.title, citation.authors);
    layers.pubmed = pubmedLayer;
    if (pubmedLayer.valid) {
      validScores.push(pubmedLayer.confidence);
      sources.push('PubMed');
    }

    const scholarLayer = await this.verifySemanticScholar(citation.title, citation.authors);
    layers.semanticScholar = scholarLayer;
    if (scholarLayer.valid) {
      validScores.push(scholarLayer.confidence);
      sources.push('Semantic Scholar');
    }

    // Filter out NaN values to prevent NaN propagation
    const cleanScores = validScores.filter(s => !isNaN(s) && isFinite(s));
    const avgConfidence =
      cleanScores.length > 0 ? cleanScores.reduce((a, b) => a + b, 0) / cleanScores.length : 0;
    const maxConfidence = cleanScores.length > 0 ? Math.max(...cleanScores) : 0;
    const finalConfidence = avgConfidence * 0.4 + maxConfidence * 0.6;
    const valid = sources.length > 0 && finalConfidence >= 0.6;
    const resolved = this.resolveMetadata(citation, layers);

    return {
      valid,
      confidence: Math.round(finalConfidence * 100) / 100,
      source: sources.length > 0 ? sources.join(', ') : 'none',
      details:
        sources.length > 0
          ? `Verified via: ${sources.join(', ')}`
          : 'Could not verify citation from any source',
      resolvedTitle: resolved.title,
      resolvedAuthors: resolved.authors,
      resolvedYear: resolved.year,
      resolvedJournal: resolved.journal,
      resolvedUrl: resolved.url,
      resolvedDoi: resolved.doi,
      resolvedArxivId: resolved.arxivId,
      bibliographyEntry: valid ? this.formatCitation(resolved, 'GB/T 7714') : undefined,
      layers,
    };
  }

  async verifyBatch(citations: Citation[]): Promise<VerificationResult[]> {
    if (!Array.isArray(citations) || citations.length === 0) {
      return [];
    }
    const results: VerificationResult[] = [];
    for (const citation of citations) {
      results.push(await this.verify(citation));
    }
    return results;
  }

  generateBibtex(paper: {
    arxivId?: string;
    doi?: string;
    title?: string;
    authors?: string[];
    year?: string | number;
    journal?: string;
    abstract?: string;
  }): string {
    const key = this.generateBibtexKey(paper);
    const type = paper.journal ? 'article' : 'misc';
    const fields: string[] = [];

    if (paper.title) fields.push(`  title     = {${paper.title}}`);
    if (paper.authors && paper.authors.length > 0) {
      fields.push(`  author    = {${paper.authors.join(' and ')}}`);
    }
    if (paper.year) fields.push(`  year      = {${paper.year}}`);
    if (paper.journal) fields.push(`  journal   = {${paper.journal}}`);
    if (paper.doi) fields.push(`  doi       = {${paper.doi}}`);
    if (paper.arxivId) {
      fields.push(`  eprint    = {${paper.arxivId}}`);
      fields.push(`  archivePrefix = {arXiv}`);
      fields.push(`  url       = {https://arxiv.org/abs/${paper.arxivId}}`);
    }

    return `@${type}{${key},\n${fields.join(',\n')}\n}`;
  }

  formatCitation(
    paper: {
      title?: string;
      authors?: string[];
      year?: string | number;
      journal?: string;
      doi?: string;
      arxivId?: string;
    },
    style: 'APA' | 'MLA' | 'Chicago' | 'GB/T7714' | 'GB/T 7714',
    index?: number,
  ): string {
    const title = paper.title ?? 'Untitled';
    const authors = paper.authors ?? [];
    const year = paper.year ? String(paper.year) : 'n.d.';
    const journal = paper.journal ?? '';
    const doi = paper.doi ?? '';
    const prefix = typeof index === 'number' ? `[${index}] ` : '';

    switch (style) {
      case 'APA': {
        const authorStr =
          authors.length > 0
            ? authors
                .slice(0, 6)
                .map((a) => {
                  const parts = a.split(' ');
                  const lastName = parts[parts.length - 1];
                  const initials = parts
                    .slice(0, -1)
                    .map((part) => part.length > 0 ? part[0] + '.' : '')
                    .join(' ');
                  return `${lastName}, ${initials}`;
                })
                .join(', ') + (authors.length > 6 ? ', ...' : '')
            : 'Unknown';
        const journalPart = journal ? ` *${journal}*.` : '';
        const doiPart = doi ? ` https://doi.org/${doi}` : '';
        return `${authorStr} (${year}). ${title}.${journalPart}${doiPart}`;
      }
      case 'MLA': {
        const authorStr =
          authors.length === 0
            ? 'Unknown'
            : authors.length === 1
              ? authors[0]
              : `${authors[0]}, et al.`;
        const journalPart = journal ? ` *${journal}*,` : '';
        return `${authorStr}. "${title}."${journalPart} ${year}.`;
      }
      case 'Chicago': {
        const authorStr =
          authors.length > 0
            ? authors
                .map((a, idx) => (idx === 0 ? a : a.split(' ').reverse().join(', ')))
                .join(', ')
            : 'Unknown';
        const journalPart = journal ? ` *${journal}*` : '';
        const doiPart = doi ? `. https://doi.org/${doi}` : '';
        return `${authorStr}. "${title}."${journalPart} (${year})${doiPart}.`;
      }
      case 'GB/T7714':
      case 'GB/T 7714': {
        const authorStr =
          authors.length > 0
            ? authors
                .slice(0, 3)
                .map((author) => this.formatGbtAuthor(author))
                .join(', ') + (authors.length > 3 ? ', et al' : '')
            : 'Unknown';
        if (journal) {
          return `${prefix}${authorStr}. ${title}[J]. ${journal}, ${year}.${doi ? ` DOI: ${doi}.` : ''}`.trim();
        }
        if (paper.arxivId || doi) {
          const url = paper.arxivId ? `https://arxiv.org/abs/${paper.arxivId}` : '';
          return `${prefix}${authorStr}. ${title}[EB/OL]. (${year})${url ? `[${url}]` : ''}${doi ? ` DOI: ${doi}.` : ''}`.trim();
        }
        return `${prefix}${authorStr}. ${title}[M]. ${year}.`;
      }
      default:
        return `${authors.join(', ')} (${year}). ${title}.`;
    }
  }

  private async verifyArxiv(arxivId: string, expectedTitle: string): Promise<LayerResult> {
    try {
      const paper = await this.arxiv.getPaper(arxivId);
      const titleSimilarity = this.titleSimilarity(paper.title, expectedTitle);
      return {
        checked: true,
        valid: titleSimilarity > 0.5,
        confidence: titleSimilarity,
        message: `arXiv paper found: "${paper.title}" (similarity: ${(titleSimilarity * 100).toFixed(0)}%)`,
        metadata: {
          title: paper.title,
          authors: paper.authors,
          year: paper.published ? paper.published.substring(0, 4) : undefined,
          doi: paper.doi,
          arxivId: paper.id,
          url: paper.arxivUrl,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `arXiv ID "${arxivId}" not found: ${msg}`,
      };
    }
  }

  private async verifyCrossRef(doi: string, expectedTitle: string): Promise<LayerResult> {
    try {
      let response;
      let lastErr: unknown;
      const delays = [0, 2000, 5000]; // 0, 2s, 5s retry delays
      for (const delay of delays) {
        if (delay > 0) await new Promise(res => setTimeout(res, delay));
        try {
          response = await axios.get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
            timeout: 15000,
            headers: {
              'User-Agent': 'tzukwan-cli/1.0 (research tool; mailto:research@tzukwan.io)',
            },
          });
          break; // success
        } catch (err: unknown) {
          lastErr = err;
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 429 || status === 503 || status === 504) continue; // retry
          throw err; // non-retryable
        }
      }
      if (!response) throw lastErr;
      const work = response.data?.message ?? {};
      const foundTitle: string =
        (Array.isArray(work.title) ? work.title[0] : work.title) ?? '';
      const titleSimilarity = this.titleSimilarity(foundTitle, expectedTitle);
      const authors = Array.isArray(work.author)
        ? work.author
            .map((author: { given?: string; family?: string }) =>
              [author.given, author.family].filter(Boolean).join(' ').trim())
            .filter(Boolean)
        : [];
      const year =
        work['published-print']?.['date-parts']?.[0]?.[0]
        ?? work['published-online']?.['date-parts']?.[0]?.[0]
        ?? work.created?.['date-parts']?.[0]?.[0];
      const journal = Array.isArray(work['container-title']) ? work['container-title'][0] : work['container-title'];
      const url = typeof work.URL === 'string'
        ? work.URL
        : `https://doi.org/${doi}`;

      return {
        checked: true,
        valid: titleSimilarity > 0.5,
        confidence: titleSimilarity,
        message: `CrossRef DOI verified: "${foundTitle}"`,
        metadata: {
          title: foundTitle,
          authors,
          year,
          journal,
          doi,
          url,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `DOI "${doi}" not found in CrossRef: ${msg}`,
      };
    }
  }

  private async verifySemanticScholar(title: string, authors?: string[]): Promise<LayerResult> {
    try {
      const papers = await this.scholar.search(title, { limit: 5 });
      if (papers.length === 0) {
        return { checked: true, valid: false, confidence: 0, message: 'No results from Semantic Scholar' };
      }

      const best = papers.reduce((prev, cur) => {
        const prevScore = this.titleSimilarity(prev.title, title);
        const curScore = this.titleSimilarity(cur.title, title);
        return curScore > prevScore ? cur : prev;
      });

      const score = this.titleSimilarity(best.title, title);
      let confidence = score;

      if (authors && authors.length > 0 && best.authors.length > 0) {
        const authorMatch = this.checkAuthorOverlap(
          authors,
          best.authors.map((author) => author.name),
        );
        confidence = confidence * 0.7 + authorMatch * 0.3;
      }

      const bestRecord = best as unknown as {
        title: string;
        authors: Array<{ name: string }>;
        year?: string | number;
        venue?: string;
        url?: string;
        externalIds?: { DOI?: string };
      };

      return {
        checked: true,
        valid: score > 0.6,
        confidence,
        message: `Best match: "${best.title}" (similarity: ${(score * 100).toFixed(0)}%)`,
        metadata: {
          title: bestRecord.title,
          authors: bestRecord.authors.map((author) => author.name),
          year: bestRecord.year,
          journal: bestRecord.venue,
          doi: bestRecord.externalIds?.DOI,
          url: bestRecord.url,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `Semantic Scholar search failed: ${msg}`,
      };
    }
  }

  private async verifyOpenAlexByDoi(doi: string, expectedTitle: string): Promise<LayerResult> {
    try {
      const work = await this.openalex.searchByDoi(doi);
      const score = this.titleSimilarity(work.title, expectedTitle);
      return {
        checked: true,
        valid: score > 0.5,
        confidence: score,
        message: `OpenAlex DOI verified: "${work.title}"`,
        metadata: {
          title: work.title,
          authors: work.authors.map((author) => author.displayName),
          year: work.year ?? undefined,
          journal: work.venue ?? undefined,
          doi: work.doi ?? doi,
          url: work.openAccessUrl ?? `https://openalex.org/${work.id.replace('https://openalex.org/', '')}`,
        },
      };
    } catch (err) {
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `OpenAlex DOI lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async verifyOpenAlexByTitle(title: string, authors?: string[]): Promise<LayerResult> {
    try {
      const response = await this.openalex.search(title, { limit: 5, sortBy: 'relevance_score' });
      if (response.results.length === 0) {
        return { checked: true, valid: false, confidence: 0, message: 'No results from OpenAlex' };
      }
      const best = response.results.reduce((prev, cur) => {
        const prevScore = this.titleSimilarity(prev.title, title);
        const curScore = this.titleSimilarity(cur.title, title);
        return curScore > prevScore ? cur : prev;
      });
      let confidence = this.titleSimilarity(best.title, title);
      if (authors && authors.length > 0) {
        const authorMatch = this.checkAuthorOverlap(authors, best.authors.map((author) => author.displayName));
        confidence = confidence * 0.7 + authorMatch * 0.3;
      }
      return {
        checked: true,
        valid: confidence > 0.6,
        confidence,
        message: `OpenAlex match: "${best.title}"`,
        metadata: {
          title: best.title,
          authors: best.authors.map((author) => author.displayName),
          year: best.year ?? undefined,
          journal: best.venue ?? undefined,
          doi: best.doi ?? undefined,
          url: best.openAccessUrl ?? `https://openalex.org/${best.id.replace('https://openalex.org/', '')}`,
        },
      };
    } catch (err) {
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `OpenAlex search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async verifyPubMed(title: string, authors?: string[]): Promise<LayerResult> {
    try {
      const papers = await this.pubmed.search(title, { maxResults: 5, sortBy: 'relevance' });
      if (papers.length === 0) {
        return { checked: true, valid: false, confidence: 0, message: 'No results from PubMed' };
      }
      const best = papers.reduce((prev, cur) => {
        const prevScore = this.titleSimilarity(prev.title, title);
        const curScore = this.titleSimilarity(cur.title, title);
        return curScore > prevScore ? cur : prev;
      });
      let confidence = this.titleSimilarity(best.title, title);
      if (authors && authors.length > 0) {
        const authorMatch = this.checkAuthorOverlap(authors, best.authors.map((author) => `${author.lastName} ${author.foreName}`.trim()));
        confidence = confidence * 0.7 + authorMatch * 0.3;
      }
      return {
        checked: true,
        valid: confidence > 0.6,
        confidence,
        message: `PubMed match: "${best.title}"`,
        metadata: {
          title: best.title,
          authors: best.authors.map((author) => `${author.lastName} ${author.foreName}`.trim()),
          year: best.year ?? undefined,
          journal: best.journal,
          doi: best.doi ?? undefined,
          url: `https://pubmed.ncbi.nlm.nih.gov/${best.pmid}/`,
        },
      };
    } catch (err) {
      return {
        checked: true,
        valid: false,
        confidence: 0,
        message: `PubMed search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private titleSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const na = normalize(a);
    const nb = normalize(b);

    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;

    const wordsA = new Set(na.split(' ').filter((word) => word.length > 3));
    const wordsB = new Set(nb.split(' ').filter((word) => word.length > 3));
    const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private checkAuthorOverlap(expected: string[], found: string[]): number {
    if (expected.length === 0 || found.length === 0) return 0;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
    const normExpected = expected.map(normalize);
    const normFound = found.map(normalize);
    const matches = normExpected.filter((author) =>
      normFound.some((candidate) => candidate.includes(author.slice(0, 6)) || author.includes(candidate.slice(0, 6))),
    );
    return matches.length / Math.max(expected.length, found.length);
  }

  private resolveMetadata(citation: Citation, layers: VerificationResult['layers']): CitationMetadata {
    const preferred = [
      layers.crossref?.valid ? layers.crossref.metadata : undefined,
      layers.openAlex?.valid ? layers.openAlex.metadata : undefined,
      layers.pubmed?.valid ? layers.pubmed.metadata : undefined,
      layers.arxiv?.valid ? layers.arxiv.metadata : undefined,
      layers.semanticScholar?.valid ? layers.semanticScholar.metadata : undefined,
    ].filter((entry): entry is CitationMetadata => !!entry);

    const base = preferred[0] ?? {};
    return {
      title: base.title ?? citation.title,
      authors: base.authors ?? citation.authors,
      year: base.year ?? citation.year,
      journal: base.journal ?? citation.journal,
      doi: base.doi ?? citation.doi,
      arxivId: base.arxivId ?? citation.arxivId,
      url: base.url,
    };
  }

  private formatGbtAuthor(author: string): string {
    const parts = author.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return 'Unknown';
    }
    if (parts.length === 1) {
      return parts[0]?.toUpperCase() ?? '';
    }

    const family = parts[parts.length - 1]?.toUpperCase() ?? '';
    const initials = parts.slice(0, -1).map((part) => part[0]?.toUpperCase() ?? '').join('');
    return `${family} ${initials}`.trim();
  }

  private generateBibtexKey(paper: {
    authors?: string[];
    year?: string | number;
    title?: string;
  }): string {
    const firstAuthor =
      paper.authors && paper.authors.length > 0
        ? paper.authors[0].split(' ').pop() ?? 'unknown'
        : 'unknown';
    const year = paper.year ? String(paper.year) : '????';
    const titleWord =
      paper.title
        ?.toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .split(' ')
        .find((word) => word.length > 3) ?? 'paper';

    return `${firstAuthor.toLowerCase()}${year}${titleWord}`;
  }
}
