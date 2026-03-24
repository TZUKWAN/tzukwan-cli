import { XMLParser } from 'fast-xml-parser';
import { httpRequestWithRetry } from './shared/http-utils.js';

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: { lastName: string; foreName: string }[];
  journal: string;
  year: number | null;
  abstract: string;
  doi: string | null;
  pmcid: string | null;
  publicationTypes: string[];
}

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  conditions: string[];
  interventions: string[];
  sponsor: string;
  url: string;
}

interface PubMedSearchOptions {
  maxResults?: number;
  dateRange?: [string, string];
  sortBy?: 'relevance' | 'date';
}

/** Raw study shape from ClinicalTrials.gov v2 API */
interface RawCtStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string };
    designModule?: { phases?: string[] };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: Array<{ name?: string }> };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
  };
}

export class PubMedClient {
  private readonly parser: XMLParser;
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['Author', 'PublicationType', 'ArticleId'].includes(name),
    });
  }

  async search(query: string, options: PubMedSearchOptions = {}): Promise<PubMedArticle[]> {
    const { maxResults = 20, dateRange, sortBy = 'relevance' } = options;

    let searchQuery = query;
    if (dateRange) {
      const [start, end] = dateRange;
      searchQuery = `${query} AND ("${start}"[Date - Publication] : "${end}"[Date - Publication])`;
    }

    const searchParams = new URLSearchParams({
      db: 'pubmed',
      term: searchQuery,
      retmax: String(Math.min(maxResults, 10000)),
      sort: sortBy === 'date' ? 'date' : 'relevance',
      retmode: 'json',
    });
    if (this.apiKey) searchParams.set('api_key', this.apiKey);

    try {
      const searchResponse = await httpRequestWithRetry({
        method: 'GET',
        url: `${this.baseUrl}/esearch.fcgi?${searchParams.toString()}`,
        timeout: 60000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });
      const idList: string[] = (searchResponse.data as { esearchresult?: { idlist?: string[] } })?.esearchresult?.idlist ?? [];

      if (idList.length === 0) return [];

      return this.fetchArticles(idList);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`PubMed search failed for query "${query}": ${msg}`);
    }
  }

  async getArticle(pmid: string): Promise<PubMedArticle> {
    const articles = await this.fetchArticles([pmid]);
    if (articles.length === 0) {
      throw new Error(`Article not found: ${pmid}`);
    }
    return articles[0];
  }

  /**
   * Search ClinicalTrials.gov using the official v2 REST API.
   * https://clinicaltrials.gov/api/v2/studies
   */
  async searchClinicalTrials(condition: string, maxResults: number = 50): Promise<ClinicalTrial[]> {
    const params = new URLSearchParams({
      'query.cond': condition,
      pageSize: String(Math.min(maxResults, 1000)),
      format: 'json',
    });

    try {
      const response = await httpRequestWithRetry({
        method: 'GET',
        url: `https://clinicaltrials.gov/api/v2/studies?${params.toString()}`,
        timeout: 30000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });

      const data = response.data as { studies?: RawCtStudy[] };
      const studies: RawCtStudy[] = data?.studies ?? [];

      return studies.map((study) => {
        const proto = study.protocolSection ?? {};
        const id = proto.identificationModule ?? {};
        const status = proto.statusModule ?? {};
        const design = proto.designModule ?? {};
        const cond = proto.conditionsModule ?? {};
        const arms = proto.armsInterventionsModule ?? {};
        const sponsor = proto.sponsorCollaboratorsModule ?? {};

        const nctId = id.nctId ?? '';
        return {
          nctId,
          title: id.briefTitle ?? id.officialTitle ?? '',
          status: status.overallStatus ?? '',
          phase: (design.phases ?? []).join(', '),
          conditions: cond.conditions ?? [],
          interventions: (arms.interventions ?? []).map((i) => i.name ?? '').filter(Boolean),
          sponsor: sponsor.leadSponsor?.name ?? '',
          url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : '',
        };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`ClinicalTrials.gov search failed for condition "${condition}": ${msg}`);
    }
  }

  private async fetchArticles(pmids: string[]): Promise<PubMedArticle[]> {
    const fetchParams = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'xml',
    });
    if (this.apiKey) fetchParams.set('api_key', this.apiKey);

    let response: { data: unknown };
    try {
      response = await httpRequestWithRetry({
        method: 'GET',
        url: `${this.baseUrl}/efetch.fcgi?${fetchParams.toString()}`,
        timeout: 60000,
        headers: { 'User-Agent': 'tzukwan-cli/1.0 (research tool)' },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`PubMed fetchArticles failed for PMIDs [${pmids.slice(0, 5).join(',')}]: ${msg}`);
    }

    // Validate XML response
    const xmlData = response.data;
    if (!xmlData || typeof xmlData !== 'string') {
      console.warn('[PubMed] Empty or invalid XML response');
      return [];
    }

    // Check for PubMed error response
    if (xmlData.includes('<ERROR>') || xmlData.includes('<Error>')) {
      const errorMatch = xmlData.match(/<ERROR>([^<]+)<\/ERROR>/i);
      const errorMsg = errorMatch ? errorMatch[1] : 'Unknown API error';
      console.warn(`[PubMed] API error: ${errorMsg}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parser.parse(xmlData) as Record<string, unknown>;
    } catch (parseError) {
      console.warn(`[PubMed] Failed to parse XML: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      return [];
    }

    const articles: PubMedArticle[] = [];
    const parsedData = parsed as { PubmedArticleSet?: { PubmedArticle?: unknown } };
    const pubmedArticles = parsedData?.PubmedArticleSet?.PubmedArticle ?? [];
    const articleList = Array.isArray(pubmedArticles) ? pubmedArticles : [pubmedArticles];

    for (const article of articleList) {
      if (!article?.MedlineCitation) continue;

      const citation = article.MedlineCitation;
      const pmid = citation.PMID?.['#text'] ?? citation.PMID ?? '';

      const articleData = citation.Article ?? {};
      const title = articleData.ArticleTitle ?? '';

      const authors: { lastName: string; foreName: string }[] = [];
      const authorList = articleData.AuthorList?.Author ?? [];
      const authorArray = Array.isArray(authorList) ? authorList : [authorList];
      for (const a of authorArray) {
        if (a.LastName || a.ForeName) {
          authors.push({
            lastName: a.LastName ?? '',
            foreName: a.ForeName ?? a.Initials ?? '',
          });
        }
      }

      const journal = articleData.Journal?.Title ?? '';

      let year: number | null = null;
      const journalIssue = articleData.Journal?.JournalIssue ?? {};
      if (journalIssue.PubDate?.Year) {
        year = parseInt(journalIssue.PubDate.Year, 10) || null;
      } else if (journalIssue.PubDate?.MedlineDate) {
        const match = journalIssue.PubDate.MedlineDate.match(/\d{4}/);
        if (match) year = parseInt(match[0], 10);
      }

      // Handle abstract - can be missing, empty, or have nested structure
      let abstract = '';
      const abstractData = articleData.Abstract;
      if (abstractData) {
        const abstractParts = abstractData.AbstractText;
        if (Array.isArray(abstractParts)) {
          abstract = abstractParts.map((p) => (typeof p === 'string' ? p : p?.['#text'] ?? '')).filter(Boolean).join(' ');
        } else if (typeof abstractParts === 'string') {
          abstract = abstractParts;
        } else if (typeof abstractParts === 'object' && abstractParts !== null) {
          // Handle case where AbstractText is an object with #text property
          abstract = abstractParts['#text'] ?? '';
        }
      }
      // Normalize whitespace and handle truly empty abstracts
      abstract = abstract.replace(/\s+/g, ' ').trim();

      const pubTypes = articleData.PublicationTypeList?.PublicationType ?? [];
      const publicationTypes = Array.isArray(pubTypes)
        ? pubTypes.map((t) => (typeof t === 'string' ? t : t['#text'] ?? ''))
        : typeof pubTypes === 'string'
        ? [pubTypes]
        : [];

      let doi: string | null = null;
      let pmcid: string | null = null;
      const articleIds = article.PubmedData?.ArticleIdList?.ArticleId ?? [];
      for (const id of articleIds) {
        const idType = id['@_IdType'] ?? '';
        const idValue = typeof id === 'string' ? id : id['#text'] ?? '';
        if (idType === 'doi') doi = idValue;
        if (idType === 'pmc') pmcid = idValue;
      }

      articles.push({
        pmid: String(pmid),
        title,
        authors,
        journal,
        year,
        abstract,
        doi,
        pmcid,
        publicationTypes,
      });
    }

    return articles;
  }
}
