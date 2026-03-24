/**
 * @tzukwan/research — Public API
 *
 * Re-exports all research clients, types, and high-level helpers.
 */

const originalResearchEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning?.message;
  if (message?.includes('--localstorage-file')) return;
  return originalResearchEmitWarning(warning as never, ...(args as never[]));
}) as typeof process.emitWarning;

import { ArxivClient } from './arxiv.js';
import { PubMedClient } from './pubmed.js';
import { SemanticScholarClient } from './semantic-scholar.js';
import { OpenAlexClient } from './openallex.js';
import { PaperFactory } from './paper-factory/index.js';
import { ConfigLoader, LLMClient } from '@tzukwan/core';

// ArXiv
export { ArxivClient } from './arxiv.js';
export type { ArxivPaper } from './arxiv.js';

// Semantic Scholar
export { SemanticScholarClient } from './semantic-scholar.js';
export type { ScholarPaper, ScholarAuthor } from './semantic-scholar.js';

// PubMed / ClinicalTrials
export { PubMedClient } from './pubmed.js';
export type { PubMedArticle, ClinicalTrial } from './pubmed.js';

// OpenAlex
export { OpenAlexClient } from './openallex.js';
export type { OpenAlexWork, OpenAlexAuthor, OpenAlexConcept } from './openallex.js';

// PDF Parser
export { PdfParser } from './pdf.js';
export type { ParsedPaper, Section, Reference } from './pdf.js';

// Citation Verifier
export { CitationVerifier } from './citation.js';
export type { Citation, VerificationResult } from './citation.js';

// Workspace Exporter
export { exportPaperWorkspace } from './export.js';
export type {
  FigureSpec,
  SourceCodeArtifact,
  WorkspaceExportInput,
  WorkspaceExportResult,
  ExportedFigure,
} from './export.js';

// Strict execution / evidence
export {
  buildWorkspaceEvidenceManifest,
  checkDatasetReachability,
  runReproductionProjectValidation,
  writeWorkspaceEvidenceManifest,
  runSourceCodeValidation,
} from './strict-execution.js';
export type {
  StrictChecklistItem,
  DatasetEvidenceRecord,
  DatasetReachabilityRecord,
  ExperimentExecutionRun,
  WorkspaceEvidenceManifest,
} from './strict-execution.js';

// Research Pipeline (8-stage)
export { ResearchPipeline } from './pipeline.js';
export type {
  PipelineOptions,
  PipelineResult,
  PipelineState,
  ResearchQuestion,
  LiteratureResult,
  SynthesisResult,
  ExperimentDesign,
  ExecutionResult,
  AnalysisResult,
  WritingResult,
  FinalizationResult,
} from './pipeline.js';

// Paper Factory
export { PaperFactory } from './paper-factory/index.js';
export type {
  PaperOptions,
  GeneratedPaper,
  PaperAnalysis,
  ReproductionResult,
  LiteratureReview,
} from './paper-factory/index.js';

// LaTeX Compiler
export { LaTeXCompiler } from './paper-factory/latex-compiler.js';
export type { LaTeXCompileOptions, LaTeXCompileResult } from './paper-factory/latex-compiler.js';

// Dataset Hub
export { DatasetHub } from './paper-factory/dataset-hub.js';
export type { Dataset, DataCollection } from './paper-factory/dataset-hub.js';

// ArXiv Monitor
export { ArxivMonitor } from './paper-factory/arxiv-monitor.js';
export type { MonitorOptions } from './paper-factory/arxiv-monitor.js';

// ─────────────────────────────────────────────────────────────────────────────
// High-level helper functions used by @tzukwan/cli
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  source: string;
  url: string;
  citationCount?: number;
  pdfUrl?: string;
  journal?: string;
  doi?: string;
}

export interface DatasetResult {
  name: string;
  description: string;
  category: string;
  url: string;
  format?: string;
  size?: string;
  license?: string;
}

export interface SearchOptions {
  source?: 'arxiv' | 'pubmed' | 'semantic-scholar' | 'openalex' | 'all';
  limit?: number;
  year?: number;
  sort?: 'relevance' | 'date' | 'citations';
}

function interleaveSearchResults(results: SearchResult[], limit: number): SearchResult[] {
  const buckets = new Map<string, SearchResult[]>();
  for (const result of results) {
    const bucket = buckets.get(result.source) ?? [];
    bucket.push(result);
    buckets.set(result.source, bucket);
  }
  const orderedSources = [...buckets.keys()];
  const output: SearchResult[] = [];
  let progressed = true;
  while (output.length < limit && progressed) {
    progressed = false;
    for (const source of orderedSources) {
      const bucket = buckets.get(source);
      if (bucket && bucket.length > 0) {
        output.push(bucket.shift()!);
        progressed = true;
        if (output.length >= limit) break;
      }
    }
  }
  return output;
}

async function createConfiguredPaperFactory(outputDir: string): Promise<PaperFactory> {
  try {
    const loader = new ConfigLoader();
    const config = await loader.loadConfig();
    const llmConfig = config.llm;
    const provider = llmConfig.provider === 'openai' || llmConfig.provider === 'gemini'
      ? llmConfig.provider
      : 'custom';
    const llmClient = new LLMClient({
      provider,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      timeout: llmConfig.timeout,
    });
    return new PaperFactory(outputDir, llmClient, {
      provider,
      model: llmConfig.model,
      apiKey: llmConfig.apiKey,
      research: {
        enabled: true,
        defaultLanguage: config.research.defaultLanguage,
      },
    });
  } catch {
    return new PaperFactory(outputDir);
  }
}

/**
 * Unified literature search across multiple sources.
 */
export async function searchLiterature(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { source = 'all', limit = 10, year, sort = 'relevance' } = options;
  const results: SearchResult[] = [];

  if (source === 'arxiv' || source === 'all') {
    try {
      const client = new ArxivClient();
      const papers = await client.search(query, {
        maxResults: limit,
        sortBy: sort === 'date' ? 'submittedDate' : 'relevance',
        dateFrom: year ? `${year}-01-01` : undefined,
      });
      for (const p of papers) {
        results.push({
          id: p.id,
          title: p.title,
          authors: p.authors,
          abstract: p.abstract,
          year: new Date(p.published).getFullYear() || 0,
          source: 'arXiv',
          url: p.arxivUrl,
          pdfUrl: p.pdfUrl,
          doi: p.doi,
        });
      }
    } catch (err) {
      console.warn(`[searchLiterature] arXiv search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (source === 'pubmed' || source === 'all') {
    try {
      const client = new PubMedClient();
      const articles = await client.search(query, { maxResults: limit });
      for (const a of articles) {
        results.push({
          id: a.pmid,
          title: a.title,
          authors: a.authors.map((au) => `${au.lastName} ${au.foreName}`.trim()),
          abstract: a.abstract,
          year: a.year ?? 0,
          source: 'PubMed',
          url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
          journal: a.journal,
          doi: a.doi ?? undefined,
        });
      }
    } catch (err) {
      console.warn(`[searchLiterature] PubMed search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (source === 'semantic-scholar' || source === 'all') {
    try {
      const client = new SemanticScholarClient();
      const papers = await client.search(query, { limit });
      for (const p of papers) {
        results.push({
          id: p.paperId,
          title: p.title ?? '',
          authors: (p.authors ?? []).map((a) => a.name),
          abstract: p.abstract ?? '',
          year: p.year ?? 0,
          source: 'Semantic Scholar',
          url: p.url,
          citationCount: p.citationCount,
          journal: p.venue,
          doi: p.externalIds?.DOI,
        });
      }
    } catch (err) {
      console.warn(`[searchLiterature] Semantic Scholar search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (source === 'openalex' || source === 'all') {
    try {
      const client = new OpenAlexClient();
      const response = await client.search(query, {
        limit,
        sortBy: sort === 'citations' ? 'cited_by_count' : sort === 'date' ? 'publication_date' : 'relevance_score',
      });
      for (const work of response.results) {
        results.push({
          id: work.id,
          title: work.title,
          authors: work.authors.map((author) => author.displayName),
          abstract: work.abstract ?? '',
          year: work.year ?? 0,
          source: 'OpenAlex',
          url: work.openAccessUrl ?? `https://openalex.org/${work.id.replace('https://openalex.org/', '')}`,
          citationCount: work.citations,
          journal: work.venue ?? undefined,
          doi: work.doi ?? undefined,
        });
      }
    } catch (err) {
      console.warn(`[searchLiterature] OpenAlex search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Deduplicate by title similarity and apply sort
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    const key = (r.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (sort === 'citations') {
    unique.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  } else if (sort === 'date') {
    unique.sort((a, b) => b.year - a.year);
  }

  if (source === 'all') {
    return interleaveSearchResults(unique, limit);
  }

  return unique.slice(0, limit);
}

/**
 * Search for public datasets (powered by Semantic Scholar concept search
 * plus a curated list of well-known dataset repositories).
 */
export async function searchDatasets(
  query: string,
  options: { limit?: number } = {}
): Promise<DatasetResult[]> {
  const { limit = 20 } = options;

  // Curated well-known datasets catalogue
  const catalogue: DatasetResult[] = [
    // Computer Vision
    { name: 'ImageNet', description: 'Large-scale image database for visual recognition', category: 'Computer Vision', url: 'https://www.image-net.org/', format: 'JPEG', license: 'Research' },
    { name: 'COCO', description: 'Common Objects in Context — detection, segmentation, captioning', category: 'Computer Vision', url: 'https://cocodataset.org/', format: 'JSON/JPEG', license: 'CC BY 4.0' },
    { name: 'MNIST', description: 'Handwritten digit classification benchmark', category: 'Computer Vision', url: 'http://yann.lecun.com/exdb/mnist/', format: 'IDX', license: 'Public Domain' },
    { name: 'CIFAR-10 / CIFAR-100', description: '60k 32x32 colour images in 10/100 classes', category: 'Computer Vision', url: 'https://www.cs.toronto.edu/~kriz/cifar.html', format: 'Binary', license: 'MIT' },
    { name: 'Pascal VOC', description: 'Visual Object Classes challenge dataset for detection and segmentation', category: 'Computer Vision', url: 'http://host.robots.ox.ac.uk/pascal/VOC/', format: 'XML/JPEG', license: 'Research' },
    { name: 'Open Images', description: 'Google dataset with 9M images and 600 object categories', category: 'Computer Vision', url: 'https://storage.googleapis.com/openimages/web/index.html', format: 'JPEG/CSV', license: 'CC BY 4.0' },
    // NLP
    { name: 'SQuAD 2.0', description: 'Stanford Q&A dataset for reading comprehension', category: 'NLP', url: 'https://rajpurkar.github.io/SQuAD-explorer/', format: 'JSON', license: 'CC BY-SA 4.0' },
    { name: 'Common Crawl', description: 'Petabyte-scale web crawl corpus', category: 'NLP', url: 'https://commoncrawl.org/', format: 'WARC', license: 'Open' },
    { name: 'Wikipedia Dump', description: 'Full text of Wikipedia in multiple languages', category: 'NLP', url: 'https://dumps.wikimedia.org/', format: 'XML', license: 'CC BY-SA' },
    { name: 'The Pile', description: '825 GB diverse English text for LLM training', category: 'NLP', url: 'https://pile.eleuther.ai/', format: 'JSONL', license: 'Various' },
    { name: 'OpenWebText', description: 'Open replication of the WebText dataset', category: 'NLP', url: 'https://skylion007.github.io/OpenWebTextCorpus/', format: 'Text', license: 'CC0' },
    { name: 'MS MARCO', description: 'Microsoft Machine Reading Comprehension Q&A', category: 'NLP', url: 'https://microsoft.github.io/msmarco/', format: 'JSON', license: 'Research' },
    { name: 'GLUE', description: 'General Language Understanding Evaluation benchmark', category: 'NLP', url: 'https://gluebenchmark.com/', format: 'TSV', license: 'Various' },
    { name: 'SuperGLUE', description: 'Harder version of GLUE with more challenging NLU tasks', category: 'NLP', url: 'https://super.gluebenchmark.com/', format: 'JSON', license: 'Various' },
    // Speech
    { name: 'LibriSpeech', description: '1000 hours of audiobook speech for ASR', category: 'Speech', url: 'https://www.openslr.org/12/', format: 'FLAC', license: 'CC BY 4.0' },
    { name: 'VoxCeleb', description: 'Large-scale speaker recognition dataset', category: 'Speech', url: 'https://www.robots.ox.ac.uk/~vgg/data/voxceleb/', format: 'WAV', license: 'Research' },
    { name: 'CommonVoice', description: 'Mozilla multilingual speech corpus', category: 'Speech', url: 'https://commonvoice.mozilla.org/', format: 'MP3', license: 'CC0' },
    { name: 'LJSpeech', description: 'Single speaker English audiobook dataset for TTS', category: 'Speech', url: 'https://keithito.com/LJ-Speech-Dataset/', format: 'WAV', license: 'Public Domain' },
    { name: 'VCTK', description: 'Multi-speaker English speech dataset from Edinburgh', category: 'Speech', url: 'https://datashare.ed.ac.uk/handle/10283/3443', format: 'WAV', license: 'CC BY 4.0' },
    // Healthcare
    { name: 'MIMIC-III', description: 'De-identified health data from ICU patients', category: 'Healthcare', url: 'https://mimic.mit.edu/', format: 'CSV', license: 'PhysioNet' },
    { name: 'MIMIC-IV', description: 'Updated MIMIC clinical database with 2008-2019 ICU data', category: 'Healthcare', url: 'https://mimic.mit.edu/docs/iv/', format: 'CSV', license: 'PhysioNet' },
    { name: 'PhysioNet', description: 'Physiological data and software for biomedical research', category: 'Healthcare', url: 'https://physionet.org/', format: 'Various', license: 'PhysioNet' },
    { name: 'TCGA', description: 'The Cancer Genome Atlas genomic data collection', category: 'Healthcare', url: 'https://www.cancer.gov/tcga', format: 'BAM/VCF', license: 'Open' },
    { name: 'UK Biobank', description: 'Large-scale biomedical database from 500k participants', category: 'Healthcare', url: 'https://www.ukbiobank.ac.uk/', format: 'Various', license: 'Research' },
    // General ML
    { name: 'UCI ML Repository', description: 'Classic ML datasets repository from UC Irvine', category: 'General ML', url: 'https://archive.ics.uci.edu/', format: 'Various', license: 'Various' },
    { name: 'Kaggle Datasets', description: 'Community data platform with thousands of datasets', category: 'General ML', url: 'https://www.kaggle.com/datasets', format: 'Various', license: 'Various' },
    { name: 'OpenML', description: 'Open machine learning platform with datasets and experiments', category: 'General ML', url: 'https://www.openml.org/', format: 'ARFF', license: 'CC BY 4.0' },
    { name: 'Papers With Code Datasets', description: 'Datasets with state-of-the-art ML benchmarks', category: 'General ML', url: 'https://paperswithcode.com/datasets', format: 'Various', license: 'Various' },
    // 3D / Robotics
    { name: 'ShapeNet', description: 'Large-scale 3D model repository', category: '3D / Robotics', url: 'https://shapenet.org/', format: 'OBJ', license: 'Research' },
    { name: 'Human3.6M', description: '3.6 million 3D human poses for action recognition', category: '3D / Robotics', url: 'http://vision.imar.ro/human3.6m/', format: 'Video/MoCap', license: 'Research' },
    { name: 'ScanNet', description: 'RGB-D video dataset of indoor scenes', category: '3D / Robotics', url: 'http://www.scan-net.org/', format: 'PLY', license: 'Research' },
    { name: 'ModelNet', description: '3D CAD models for object recognition', category: '3D / Robotics', url: 'https://modelnet.cs.princeton.edu/', format: 'OFF', license: 'Research' },
    { name: 'KITTI', description: 'Autonomous driving dataset with LiDAR and camera', category: '3D / Robotics', url: 'http://www.cvlibs.net/datasets/kitti/', format: 'BIN/PNG', license: 'Research' },
    // Social Science
    { name: 'GDELT Project', description: 'Global event database from news media', category: 'Social Science', url: 'https://www.gdeltproject.org/', format: 'CSV', license: 'Open' },
    { name: 'Stanford Large Network Dataset Collection', description: 'Social network graphs and community datasets', category: 'Social Science', url: 'http://snap.stanford.edu/data/', format: 'TXT', license: 'Open' },
    { name: 'Yelp Open Dataset', description: 'Yelp reviews, businesses, users, and check-ins', category: 'Social Science', url: 'https://www.yelp.com/dataset', format: 'JSON', license: 'Research' },
    // Economics
    { name: 'World Bank Open Data', description: 'Global development indicators and statistics', category: 'Economics', url: 'https://data.worldbank.org/', format: 'CSV/JSON', license: 'CC BY 4.0' },
    { name: 'IMF Data', description: 'International Monetary Fund economic and financial statistics', category: 'Economics', url: 'https://www.imf.org/en/Data', format: 'CSV/JSON', license: 'Open' },
    { name: 'FRED Economic Data', description: 'Federal Reserve economic data — 800k+ time series', category: 'Economics', url: 'https://fred.stlouisfed.org/', format: 'CSV/JSON', license: 'Open' },
    { name: 'WRDS', description: 'Wharton Research Data Services — financial research databases', category: 'Economics', url: 'https://wrds-www.wharton.upenn.edu/', format: 'SAS/CSV', license: 'Subscription' },
    // Earth Science / Climate
    { name: 'NASA Earthdata', description: 'Earth science data from NASA Earth observation missions', category: 'Earth Science', url: 'https://earthdata.nasa.gov/', format: 'HDF5/NetCDF', license: 'Open' },
    { name: 'NOAA Climate Data', description: 'National Oceanic and Atmospheric Administration climate and weather datasets', category: 'Earth Science', url: 'https://www.ncei.noaa.gov/', format: 'NetCDF/CSV', license: 'Open' },
    { name: 'Copernicus Open Access Hub', description: 'Copernicus satellite data for climate and environment monitoring', category: 'Earth Science', url: 'https://scihub.copernicus.eu/', format: 'SAFE/NetCDF', license: 'Open' },
    // Genomics / Biology
    { name: 'NCBI GenBank', description: 'Genetic sequence database of all publicly available DNA sequences', category: 'Genomics / Biology', url: 'https://www.ncbi.nlm.nih.gov/genbank/', format: 'FASTA/GenBank', license: 'Open' },
    { name: 'UniProt', description: 'Comprehensive protein sequence and functional information', category: 'Genomics / Biology', url: 'https://www.uniprot.org/', format: 'FASTA/XML', license: 'CC BY 4.0' },
    { name: 'PDB', description: 'Worldwide Protein Data Bank — 3D structural data of molecules', category: 'Genomics / Biology', url: 'https://www.rcsb.org/', format: 'PDB/mmCIF', license: 'Open' },
    { name: 'GTEx', description: 'Genotype-Tissue Expression project — gene expression across tissues', category: 'Genomics / Biology', url: 'https://gtexportal.org/', format: 'GCT/VCF', license: 'Open' },
    { name: 'ENCODE', description: 'Encyclopedia of DNA Elements — genome-wide functional elements', category: 'Genomics / Biology', url: 'https://www.encodeproject.org/', format: 'BAM/BED', license: 'Open' },
  ];

  const q = query.toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);
  const filtered = catalogue.filter((d) => {
    const text = `${d.name} ${d.description} ${d.category}`.toLowerCase();
    // Full phrase match OR all significant words present (AND logic)
    if (text.includes(q)) return true;
    if (qWords.length <= 1) return qWords.every((w) => text.includes(w));
    // For multi-word queries: require all words to be present
    return qWords.every((w) => text.includes(w));
  });

  return filtered.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Paper Factory convenience wrappers used by @tzukwan/cli paper commands
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratedPaperResult {
  title: string;
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
  conclusion: string;
  references: string[];
  outputPath?: string;
  evidenceManifestPath?: string;
  strictValidationPath?: string;
  ready?: boolean;
}

export interface PaperAnalysisResult {
  paper: SearchResult;
  analysis: string;
  keyContributions: string[];
  methodology: string;
  limitations: string[];
  outputPath?: string;
}

export interface ReproductionPlanResult {
  paper: SearchResult;
  steps: string[];
  code: string;
  requirements: string[];
  outputPath?: string;
  validationPath?: string;
  ready?: boolean;
}

export interface ReviewResult {
  topic: string;
  papers: SearchResult[];
  synthesis: string;
  gaps: string[];
  outputPath?: string;
}

/**
 * Generate a research paper via PaperFactory (no-LLM template mode when no config).
 */
export async function generatePaper(opts: {
  topic?: string;
  outputDir?: string;
  type?: 'journal' | 'master' | 'phd';
  field?: string;
  resume?: string;
  checkpointInterval?: number;
}): Promise<GeneratedPaperResult> {
  const factory = await createConfiguredPaperFactory(opts.outputDir ?? './tzukwan-output');
  await factory.initialize();

  const topic = opts.topic ?? 'Research Paper';
  const field = opts.field ?? 'general';
  const type = opts.type ?? 'journal';
  const resumePaperId = opts.resume;

  const result = await factory.generatePaper({ topic, field, type, resumePaperId });

  // Read the generated paper content
  const { readFileSync } = await import('fs');
  let content = '';
  try { content = readFileSync(result.paperPath, 'utf-8'); } catch (err) {
    console.warn(`[generatePaper] Failed to read paper file: ${err instanceof Error ? err.message : String(err)}`);
    content = '';
  }

  // Extract sections by heading markers
  const extractSection = (md: string, heading: string): string => {
    const re = new RegExp(`##\\s+(?:\\d+\\.\\s*)?${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
    const m = md.match(re);
    return m?.[1] ? m[1].trim().slice(0, 1200) : '';
  };

  return {
    title: topic,
    abstract: extractSection(content, 'Abstract') || `This paper investigates ${topic}.`,
    introduction: extractSection(content, 'Introduction') || '',
    methodology: extractSection(content, 'Method') || extractSection(content, 'Methodology') || '',
    results: extractSection(content, 'Results') || '',
    conclusion: extractSection(content, 'Conclusion') || '',
    references: result.datasets.datasets.slice(0, 5).map((d: { name: string; url: string }) => `${d.name}. ${d.url}`),
    outputPath: result.docxPath ?? result.paperPath,
    evidenceManifestPath: result.evidenceManifestPath,
    strictValidationPath: result.strictValidationPath,
    ready: result.ready,
  };
}

/**
 * Analyze an arXiv paper by ID.
 */
export async function analyzePaper(arxivId: string, outputDir?: string): Promise<PaperAnalysisResult> {
  const factory = await createConfiguredPaperFactory(outputDir ?? './tzukwan-output');
  await factory.initialize();

  const analysis = await factory.analyzeArxivPaper(arxivId);

  // Fetch complete metadata from arXiv API for accurate authors, year, and URLs
  let paper: SearchResult;
  try {
    const arxivPaper = await factory.arxivClient.getPaper(arxivId);
    paper = {
      id: arxivPaper.id,
      title: arxivPaper.title || analysis.extraction.title || arxivId,
      authors: arxivPaper.authors,
      abstract: arxivPaper.abstract || analysis.extraction.abstract,
      year: arxivPaper.published ? new Date(arxivPaper.published).getFullYear() : new Date().getFullYear(),
      source: 'arXiv',
      url: arxivPaper.arxivUrl,
      pdfUrl: arxivPaper.pdfUrl,
      doi: arxivPaper.doi,
    };
  } catch (err) {
    // If arXiv API lookup fails, fall back to extraction data (still better than empty/fake fields)
    console.warn(`[analyzePaper] arXiv metadata fetch failed, using extraction data: ${err instanceof Error ? err.message : String(err)}`);
    paper = {
      id: arxivId,
      title: analysis.extraction.title || arxivId,
      authors: [],
      abstract: analysis.extraction.abstract,
      year: new Date().getFullYear(),
      source: 'arXiv',
      url: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    };
  }

  // Extract key contributions from algorithms or abstract sentences
  const contribKeywords = /\b(propose|introduce|present|develop|design|novel|new approach|we show|we demonstrate|achieve)\b/i;
  const abstractSentences = (paper.abstract ?? '').split(/[.!?]+/).filter(s => s.trim().length > 20);

  let keyContributions: string[] = analysis.extraction.algorithms.slice(0, 3);
  for (const sent of abstractSentences) {
    if (contribKeywords.test(sent) && keyContributions.length < 5) {
      keyContributions.push(sent.trim().slice(0, 200));
    }
  }
  if (keyContributions.length === 0) {
    keyContributions = abstractSentences.slice(0, 2).map(s => s.trim());
  }
  keyContributions = keyContributions.slice(0, 5);

  // Extract limitations from abstract
  const limitKeywords = /\b(limitation|future work|cannot|does not support|fail|restrict|assume|constrain|drawback|not yet)\b/i;
  const limitations: string[] = [];
  for (const sent of abstractSentences) {
    if (limitKeywords.test(sent) && limitations.length < 3) {
      limitations.push(sent.trim().slice(0, 200));
    }
  }
  const limitSections = analysis.extraction.sections.filter(s => /limitation|future work|discussion/i.test(s));
  if (limitSections.length > 0) {
    limitations.push(`See section: ${limitSections.join(', ')}`);
  }
  if (limitations.length === 0) {
    limitations.push('Limitations not explicitly stated in abstract — manual review recommended');
  }

  // Build methodology summary
  const methodologySections = analysis.extraction.sections.filter(s =>
    /method|approach|architecture|model|experiment|framework/i.test(s)
  );
  const methodology = methodologySections.length > 0
    ? methodologySections.join('; ')
    : analysis.extraction.sections.slice(0, 3).join('; ') || 'See paper sections';

  return {
    paper,
    analysis: [
      `Sections: ${analysis.extraction.sections.join(', ') || 'N/A'}`,
      analysis.extraction.algorithms.length > 0 ? `Algorithms: ${analysis.extraction.algorithms.join(', ')}` : '',
      `Word count: ~${analysis.extraction.wordCount}`,
    ].filter(Boolean).join(' | '),
    keyContributions,
    methodology,
    limitations,
    outputPath: analysis.markdownPath,
  };
}

/**
 * Generate a reproduction package for an arXiv paper.
 */
export async function reproducePaper(arxivId: string, outputDir?: string): Promise<ReproductionPlanResult> {
  const factory = await createConfiguredPaperFactory(outputDir ?? './tzukwan-output');
  await factory.initialize();

  const result = await factory.reproducePaper(arxivId, { mode: 'auto' });

  // Fetch real metadata from arXiv (same pattern as analyzePaper)
  let paper: SearchResult;
  try {
    const arxivPaper = await factory.arxivClient.getPaper(arxivId);
    paper = {
      id: arxivPaper.id,
      title: arxivPaper.title || arxivId,
      authors: arxivPaper.authors,
      abstract: arxivPaper.abstract || '',
      year: arxivPaper.published ? new Date(arxivPaper.published).getFullYear() : new Date().getFullYear(),
      source: 'arXiv',
      url: arxivPaper.arxivUrl,
      pdfUrl: arxivPaper.pdfUrl,
    };
  } catch {
    paper = {
      id: arxivId,
      title: arxivId,
      authors: [],
      abstract: '',
      year: new Date().getFullYear(),
      source: 'arXiv',
      url: `https://arxiv.org/abs/${arxivId}`,
    };
  }

  let code = '# Generated reproduction scaffold\n# See project directory for full implementation';
  let requirements = ['python>=3.9', 'torch', 'numpy', 'pandas'];

  if (result.projectDir) {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      // Read model.py as the code sample
      const modelPath = join(result.projectDir, 'src', 'model.py');
      if (existsSync(modelPath)) {
        code = readFileSync(modelPath, 'utf-8');
      }
      // Parse pyproject.toml for actual requirements
      const pyprojectPath = join(result.projectDir, 'pyproject.toml');
      if (existsSync(pyprojectPath)) {
        const toml = readFileSync(pyprojectPath, 'utf-8');
        const depsMatch = toml.match(/dependencies\s*=\s*\[([^\]]*)\]/);
        if (depsMatch?.[1]) {
          const parsed = depsMatch[1]
            .split(',')
            .map(d => d.trim().replace(/^["']|["']$/g, '').trim())
            .filter(Boolean);
          if (parsed.length > 0) requirements = ['python>=3.9', ...parsed];
        }
      }
    } catch (err) {
      console.warn(`[reproducePaper] Could not read generated files: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    paper,
    steps: result.nextSteps ?? ['Clone repository', 'Install dependencies', 'Run experiments'],
    code,
    requirements,
    outputPath: result.projectDir,
    validationPath: result.validationPath,
    ready: result.ready,
  };
}

/**
 * Monitor arXiv for recent papers (snapshot of latest).
 */
export async function monitorArxiv(opts: {
  limit?: number;
  categories?: string[];
  outputDir?: string;
}): Promise<SearchResult[]> {
  const client = new ArxivClient();
  const query = (opts.categories ?? ['cs.AI']).join(' OR ');
  const papers = await client.search(query, {
    maxResults: opts.limit ?? 20,
    sortBy: 'submittedDate',
  });

  return papers.map(p => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    year: new Date(p.published).getFullYear(),
    source: 'arXiv',
    url: p.arxivUrl,
    pdfUrl: p.pdfUrl,
  }));
}

/**
 * Generate a literature review via PaperFactory.
 */
export async function generateReview(
  topic: string,
  opts: { limit?: number; outputDir?: string } = {}
): Promise<ReviewResult> {
  const factory = await createConfiguredPaperFactory(opts.outputDir ?? './tzukwan-output');
  await factory.initialize();

  const result = await factory.generateLiteratureReview(topic, { maxPapers: opts.limit ?? 20 });

  // Fetch actual paper list for display
  const client = new ArxivClient();
  const papers = await client.search(topic, { maxResults: Math.min(opts.limit ?? 20, 20) });
  const searchResults: SearchResult[] = papers.map(p => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    year: new Date(p.published).getFullYear(),
    source: 'arXiv',
    url: p.arxivUrl,
  }));

  // Read generated review content
  const { readFileSync } = await import('fs');
  let reviewContent = '';
  try { reviewContent = readFileSync(result.reviewPath, 'utf-8'); } catch (err) {
    console.warn(`[generateReview] Failed to read review file: ${err instanceof Error ? err.message : String(err)}`);
    reviewContent = '';
  }

  // Extract research gaps from review content
  const gapKeywords = /\b(gap|missing|lack|future work|open problem|unexplored|limited|challenge|need)\b/i;
  const reviewSentences = reviewContent.split(/[.!?\n]+/).filter(s => s.trim().length > 20);
  const gaps: string[] = [];
  for (const sent of reviewSentences) {
    if (gapKeywords.test(sent) && gaps.length < 4) {
      gaps.push(sent.trim().slice(0, 180));
    }
  }
  if (gaps.length === 0) {
    gaps.push('Further empirical studies needed', 'Cross-domain validation required');
  }

  return {
    topic,
    papers: searchResults,
    synthesis: reviewContent.slice(0, 2000) || `Literature review on "${topic}" — ${result.paperCount} papers analyzed.`,
    gaps,
    outputPath: result.reviewPath,
  };
}

/**
 * Return a catalogue of dataset categories with representative entries.
 */
export async function listDatasetCategories(): Promise<Record<string, string[]>> {
  return {
    'Computer Vision': ['ImageNet', 'COCO', 'MNIST', 'CIFAR-10', 'CIFAR-100', 'Pascal VOC', 'Open Images'],
    'NLP': ['SQuAD 2.0', 'The Pile', 'Common Crawl', 'Wikipedia Dump', 'OpenWebText', 'MS MARCO', 'GLUE', 'SuperGLUE'],
    'Speech': ['LibriSpeech', 'VoxCeleb', 'CommonVoice', 'LJSpeech', 'VCTK'],
    'Healthcare': ['MIMIC-III', 'MIMIC-IV', 'PhysioNet', 'TCGA', 'UK Biobank'],
    'General ML': ['UCI ML Repository', 'Kaggle Datasets', 'OpenML', 'Papers With Code Datasets'],
    '3D / Robotics': ['ShapeNet', 'Human3.6M', 'ScanNet', 'ModelNet', 'KITTI'],
    'Social Science': ['GDELT Project', 'Stanford Large Network Dataset Collection', 'Yelp Open Dataset'],
    'Economics': ['World Bank Open Data', 'IMF Data', 'FRED Economic Data', 'WRDS'],
    'Earth Science': ['NASA Earthdata', 'NOAA Climate Data', 'Copernicus Open Access Hub'],
    'Genomics / Biology': ['NCBI GenBank', 'UniProt', 'PDB', 'GTEx', 'ENCODE'],
  };
}
