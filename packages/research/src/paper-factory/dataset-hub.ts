import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Dataset {
  name: string;
  description: string;
  url: string;
  field: string;
  tags: string[];
  source: string;
}

export interface DataCollection {
  datasets: Dataset[];
  manifestPath: string;
  evidencePath: string;
  totalFound: number;
  field: string;
  topic: string;
}

interface DatasetCache {
  fetchedAt: string;
  datasets: Dataset[];
}

const FIELD_KEYWORDS: Record<string, string[]> = {
  economics: ['gdp', 'inflation', 'trade', 'market', 'stock', 'financial', 'economic', 'fiscal', 'monetary', 'currency'],
  finance: ['stock', 'price', 'return', 'portfolio', 'risk', 'bond', 'equity', 'fund', 'financial', 'market'],
  healthcare: ['health', 'medical', 'clinical', 'patient', 'disease', 'hospital', 'drug', 'treatment', 'genomic', 'cancer'],
  social: ['social', 'demographic', 'survey', 'population', 'crime', 'education', 'politics', 'voting', 'sentiment', 'network'],
  ai: ['machine learning', 'deep learning', 'nlp', 'vision', 'image', 'text', 'speech', 'benchmark', 'classification', 'detection'],
  environment: ['climate', 'weather', 'temperature', 'pollution', 'emission', 'energy', 'solar', 'land', 'ocean', 'ecological'],
  biology: ['protein', 'gene', 'dna', 'rna', 'sequence', 'cell', 'organism', 'species', 'genome', 'molecular'],
  physics: ['particle', 'quantum', 'astronomical', 'galaxy', 'satellite', 'seismic', 'atmosphere', 'material', 'sensor'],
  government: ['government', 'census', 'public', 'policy', 'spending', 'budget', 'tax', 'election', 'legislation', 'federal'],
};

export class DatasetHub {
  private datasets: Dataset[] = [];
  private readonly cacheFile: string;
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private initializing: Promise<void> | null = null;

  constructor() {
    const tzukwanDir = path.join(os.homedir(), '.tzukwan');
    try { fs.mkdirSync(tzukwanDir, { recursive: true }); } catch { /* non-fatal */ }
    this.cacheFile = path.join(tzukwanDir, 'dataset-cache.json');
  }

  async initialize(): Promise<void> {
    // Return existing initialization promise if already in progress
    if (this.initializing) {
      return this.initializing;
    }

    // Create new initialization promise
    this.initializing = this.doInitialize();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInitialize(): Promise<void> {
    if (await this.loadFromCache()) {
      return;
    }

    await this.fetchFromGitHub();
    this.saveToCache();
  }

  searchDatasets(query: string): Dataset[] {
    const q = query.toLowerCase();
    const scored: Array<{ ds: Dataset; score: number }> = [];

    for (const ds of this.datasets) {
      const nameMatch = ds.name.toLowerCase().includes(q) ? 3 : 0;
      const descMatch = ds.description.toLowerCase().includes(q) ? 2 : 0;
      const tagMatch = ds.tags.some((t) => t.toLowerCase().includes(q)) ? 1 : 0;
      const fieldMatch = ds.field.toLowerCase().includes(q) ? 1 : 0;
      const score = nameMatch + descMatch + tagMatch + fieldMatch;
      if (score > 0) {
        scored.push({ ds, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((s) => s.ds);
  }

  getDatasetsByField(field: string): Dataset[] {
    const normalField = field.toLowerCase();
    return this.datasets.filter((ds) => ds.field.toLowerCase() === normalField).slice(0, 30);
  }

  getPopularDatasets(): Dataset[] {
    const popular = [
      'UCI Machine Learning Repository',
      'Kaggle',
      'MNIST',
      'ImageNet',
      'CIFAR',
      'Common Crawl',
      'Wikipedia',
      'WorldBank',
      'IMF',
      'OpenStreetMap',
    ];

    const results = this.datasets.filter((ds) =>
      popular.some((p) => ds.name.toLowerCase().includes(p.toLowerCase()) || ds.description.toLowerCase().includes(p.toLowerCase()))
    );

    return results.length > 0 ? results.slice(0, 10) : this.datasets.slice(0, 10);
  }

  async collectResearchData(
    topic: string,
    field: string,
    outputDir: string
  ): Promise<DataCollection> {
    try { fs.mkdirSync(outputDir, { recursive: true }); } catch { /* non-fatal */ }

    const byField = this.getDatasetsByField(field);
    const byTopic = this.searchDatasets(topic);

    const seen = new Set<string>();
    const combined: Dataset[] = [];
    for (const ds of [...byTopic, ...byField]) {
      if (!seen.has(ds.name)) {
        seen.add(ds.name);
        combined.push(ds);
      }
    }

    const datasets = combined.slice(0, 15);

    const manifest = {
      topic,
      field,
      generatedAt: new Date().toISOString(),
      totalDatasets: datasets.length,
      datasets: datasets.map((ds) => ({
        name: ds.name,
        description: ds.description,
        url: ds.url,
        field: ds.field,
        tags: ds.tags,
        source: ds.source,
        suggestedUsage: this.suggestUsage(ds, topic),
      })),
    };

    const manifestPath = path.join(outputDir, 'dataset-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const evidence = {
      topic,
      field,
      generatedAt: new Date().toISOString(),
      query: {
        topic,
        field,
      },
      selectedDatasetCount: datasets.length,
      candidateCounts: {
        byField: byField.length,
        byTopic: byTopic.length,
        combinedUnique: combined.length,
      },
      selectedDatasets: datasets.map((ds) => ({
        name: ds.name,
        source: ds.source,
        url: ds.url,
        field: ds.field,
      })),
      manifestPath,
    };
    const evidencePath = path.join(outputDir, 'dataset-evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');

    return {
      datasets,
      manifestPath,
      evidencePath,
      totalFound: datasets.length,
      field,
      topic,
    };
  }

  private suggestUsage(dataset: Dataset, topic: string): string {
    const topicWords = topic.toLowerCase().split(' ');
    if (topicWords.some((w) => dataset.description.toLowerCase().includes(w))) {
      return `Directly relevant to "${topic}" - use for primary analysis`;
    }
    return `Potentially useful for background analysis and comparison`;
  }

  private async loadFromCache(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.cacheFile)) return false;

      const content = fs.readFileSync(this.cacheFile, 'utf-8');
      const cache: DatasetCache = JSON.parse(content);

      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age > this.cacheTtlMs) return false;

      this.datasets = cache.datasets;
      return this.datasets.length > 0;
    } catch (err) {
      console.warn(`[DatasetHub] Failed to load cache: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private saveToCache(): void {
    try {
      const cache: DatasetCache = {
        fetchedAt: new Date().toISOString(),
        datasets: this.datasets,
      };
      fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
    } catch (err) {
      console.warn(`[DatasetHub] Failed to save cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async fetchFromGitHub(): Promise<void> {
    try {
      const response = await axios.get(
        'https://raw.githubusercontent.com/awesomedata/awesome-public-datasets/master/README.rst',
        {
          timeout: 600000, // 10 minutes
          headers: {
            'User-Agent': 'tzukwan-cli/1.0 (research tool)',
          },
        }
      );

      // Validate response data
      if (typeof response.data !== 'string') {
        console.warn('[DatasetHub] GitHub returned non-string data, using built-in datasets');
        this.datasets = this.getBuiltinDatasets();
        return;
      }

      const parsed = this.parseRst(response.data);

      // Validate parsed results
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn('[DatasetHub] Parsed empty dataset list, using built-in datasets');
        this.datasets = this.getBuiltinDatasets();
        return;
      }

      this.datasets = parsed;
    } catch (err) {
      console.warn(`[DatasetHub] GitHub fetch failed, using built-in datasets: ${err instanceof Error ? err.message : String(err)}`);
      this.datasets = this.getBuiltinDatasets();
    }
  }

  private parseRst(rst: string): Dataset[] {
    const datasets: Dataset[] = [];
    const lines = rst.split('\n');

    let currentSection = 'general';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect section headers (RST underlines)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && /^[-=~^]+$/.test(nextLine.trim()) && nextLine.trim().length > 3) {
          currentSection = line.trim().toLowerCase().replace(/[^a-z ]/g, '');
          continue;
        }
      }

      // Detect dataset entries: `* \`Name <url>\`_ - description`
      const datasetMatch = line.match(/^\s*[*-]\s+`([^`<]+)\s+<(https?:\/\/[^>]+)>`_?\s*[-–]?\s*(.*)/);
      if (datasetMatch) {
        // Validate all required capture groups exist
        const name = datasetMatch[1]?.trim();
        const url = datasetMatch[2]?.trim();
        const description = datasetMatch[3]?.trim() ?? '';

        // Skip entries with missing required fields
        if (!name || !url) {
          console.warn(`[DatasetHub] Skipping malformed dataset entry at line ${i + 1}`);
          continue;
        }

        // Validate URL format
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          console.warn(`[DatasetHub] Skipping dataset with invalid URL at line ${i + 1}: ${name}`);
          continue;
        }

        const field = this.inferField(currentSection + ' ' + name + ' ' + description);

        datasets.push({
          name,
          description: description || `Dataset: ${name}`,
          url,
          field,
          tags: this.extractTags(currentSection + ' ' + name + ' ' + description),
          source: 'awesome-public-datasets',
        });
      }
    }

    // Supplement with builtin if parsing yielded too little
    if (datasets.length < 30) {
      const builtin = this.getBuiltinDatasets();
      const existing = new Set(datasets.map((d) => d.name));
      for (const b of builtin) {
        if (!existing.has(b.name)) datasets.push(b);
      }
    }

    return datasets;
  }

  private inferField(text: string): string {
    const lower = text.toLowerCase();
    let bestField = 'general';
    let bestScore = 0;

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      const score = keywords.filter((kw) => lower.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }

    return bestField;
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];

    const allKeywords = Object.values(FIELD_KEYWORDS).flat();
    for (const kw of allKeywords) {
      if (lower.includes(kw) && !tags.includes(kw)) {
        tags.push(kw);
      }
    }

    return tags.slice(0, 6);
  }

  private getBuiltinDatasets(): Dataset[] {
    return [
      {
        name: 'UCI Machine Learning Repository',
        description: 'Large collection of machine learning datasets for benchmarking algorithms',
        url: 'https://archive.ics.uci.edu/ml/index.php',
        field: 'ai',
        tags: ['machine learning', 'classification', 'benchmark'],
        source: 'builtin',
      },
      {
        name: 'ImageNet',
        description: 'Large-scale visual recognition dataset with 14M+ images across 21K categories',
        url: 'https://www.image-net.org/',
        field: 'ai',
        tags: ['image', 'classification', 'deep learning', 'vision'],
        source: 'builtin',
      },
      {
        name: 'MNIST Handwritten Digits',
        description: 'Database of handwritten digits for machine learning benchmarks',
        url: 'http://yann.lecun.com/exdb/mnist/',
        field: 'ai',
        tags: ['image', 'classification', 'benchmark'],
        source: 'builtin',
      },
      {
        name: 'Common Crawl',
        description: 'Open repository of web crawl data including petabytes of raw web pages',
        url: 'https://commoncrawl.org/',
        field: 'ai',
        tags: ['text', 'nlp', 'web'],
        source: 'builtin',
      },
      {
        name: 'World Bank Open Data',
        description: 'Free and open access to global development data',
        url: 'https://data.worldbank.org/',
        field: 'economics',
        tags: ['gdp', 'economic', 'development', 'government'],
        source: 'builtin',
      },
      {
        name: 'IMF Data',
        description: 'International Monetary Fund economic and financial data',
        url: 'https://www.imf.org/en/Data',
        field: 'economics',
        tags: ['financial', 'monetary', 'economic'],
        source: 'builtin',
      },
      {
        name: 'Yahoo Finance',
        description: 'Historical stock prices and financial market data',
        url: 'https://finance.yahoo.com/',
        field: 'finance',
        tags: ['stock', 'price', 'market', 'financial'],
        source: 'builtin',
      },
      {
        name: 'MIMIC-III Clinical Database',
        description: 'Freely accessible critical care database with de-identified EHR data',
        url: 'https://physionet.org/content/mimiciii/',
        field: 'healthcare',
        tags: ['clinical', 'patient', 'medical', 'health'],
        source: 'builtin',
      },
      {
        name: 'PhysioNet',
        description: 'Repository of physiological data and software',
        url: 'https://physionet.org/',
        field: 'healthcare',
        tags: ['medical', 'clinical', 'health', 'genomic'],
        source: 'builtin',
      },
      {
        name: 'NOAA Climate Data',
        description: 'National Oceanic and Atmospheric Administration climate and weather data',
        url: 'https://www.ncei.noaa.gov/',
        field: 'environment',
        tags: ['climate', 'weather', 'temperature', 'atmosphere'],
        source: 'builtin',
      },
      {
        name: 'NASA Earthdata',
        description: 'NASA Earth observation data and imagery',
        url: 'https://earthdata.nasa.gov/',
        field: 'environment',
        tags: ['satellite', 'climate', 'land', 'ocean'],
        source: 'builtin',
      },
      {
        name: 'NCBI Gene Expression Omnibus',
        description: 'Public repository for gene expression data',
        url: 'https://www.ncbi.nlm.nih.gov/geo/',
        field: 'biology',
        tags: ['gene', 'dna', 'genomic', 'sequence'],
        source: 'builtin',
      },
      {
        name: 'Protein Data Bank',
        description: 'Global repository for 3D structural data of biological molecules',
        url: 'https://www.rcsb.org/',
        field: 'biology',
        tags: ['protein', 'molecular', 'sequence', 'cell'],
        source: 'builtin',
      },
      {
        name: 'U.S. Census Bureau',
        description: 'United States demographic and economic data',
        url: 'https://www.census.gov/data.html',
        field: 'government',
        tags: ['census', 'demographic', 'population', 'government'],
        source: 'builtin',
      },
      {
        name: 'European Social Survey',
        description: 'Academic survey measuring attitudes across Europe',
        url: 'https://www.europeansocialsurvey.org/',
        field: 'social',
        tags: ['social', 'survey', 'demographic', 'politics'],
        source: 'builtin',
      },
      {
        name: 'CERN Open Data',
        description: 'Particle physics data from CERN experiments',
        url: 'http://opendata.cern.ch/',
        field: 'physics',
        tags: ['particle', 'quantum', 'physics'],
        source: 'builtin',
      },
      {
        name: 'Stanford Large Network Dataset Collection',
        description: 'Network datasets from social, collaboration, and citation networks',
        url: 'http://snap.stanford.edu/data/',
        field: 'social',
        tags: ['network', 'social', 'graph'],
        source: 'builtin',
      },
      {
        name: 'Google Dataset Search',
        description: 'Search engine for datasets across the web',
        url: 'https://datasetsearch.research.google.com/',
        field: 'general',
        tags: ['search', 'general'],
        source: 'builtin',
      },
      {
        name: 'Zenodo',
        description: 'Open research data repository for scientific data',
        url: 'https://zenodo.org/',
        field: 'general',
        tags: ['scientific', 'research', 'open access'],
        source: 'builtin',
      },
      {
        name: 'Kaggle Datasets',
        description: 'Community-published datasets for data science competitions and projects',
        url: 'https://www.kaggle.com/datasets',
        field: 'ai',
        tags: ['machine learning', 'competition', 'benchmark'],
        source: 'builtin',
      },
    ];
  }
}
