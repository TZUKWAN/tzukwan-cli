import * as fs from 'fs';
import * as path from 'path';
import { ArxivClient, ArxivPaper } from './arxiv.js';
import { SemanticScholarClient, ScholarPaper } from './semantic-scholar.js';
import { PubMedClient } from './pubmed.js';
import { CitationVerifier, Citation, VerificationResult } from './citation.js';
import { exportPaperWorkspace } from './export.js';
import { runSourceCodeValidation, writeWorkspaceEvidenceManifest } from './strict-execution.js';

/**
 * Strip reasoning blocks from LLM responses.
 * Handles: <think>, <thinking>, <reasoning>, <reflection>, <scratchpad>
 * (case-insensitive, allows attributes in opening tags, dotall matching)
 */
function stripReasoningBlocks(text: string): string {
  return text
    .replace(/<think(\s[^>]*)?>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking(\s[^>]*)?>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning(\s[^>]*)?>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<reflection(\s[^>]*)?>[\s\S]*?<\/reflection>/gi, '')
    .replace(/<scratchpad(\s[^>]*)?>[\s\S]*?<\/scratchpad>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isResearchDebugEnabled(): boolean {
  return process.env.TZUKWAN_DEBUG_RESEARCH === '1';
}

function researchInfo(message: string): void {
  if (isResearchDebugEnabled()) {
    console.log(message);
  }
}

function researchWarn(message: string, always = false): void {
  if (always || isResearchDebugEnabled()) {
    console.warn(message);
  }
}

function researchError(message: string): void {
  console.error(message);
}

export interface PipelineOptions {
  autoApprove: boolean;
  maxPapers: number;
  outputDir: string;
  language: 'zh' | 'en';
  /**
   * Optional LLM callback for generating content in phases 3-7.
   * If not provided, phases will use template-based generation.
   */
  llmCallback?: (prompt: string) => Promise<string>;
  /**
   * When true, forces template mode even if llmCallback is provided.
   * Default: false
   */
  useTemplateFallback?: boolean;
}

export interface ResearchQuestion {
  question: string;
  subQuestions: string[];
  keywords: string[];
  hypotheses: string[];
}

export interface LiteratureResult {
  arxivPapers: ArxivPaper[];
  scholarPapers: ScholarPaper[];
  pubmedCount: number;
  totalFound: number;
}

export interface SynthesisResult {
  gaps: string[];
  hypotheses: string[];
  themes: string[];
  contradictions: string[];
}

export interface ExperimentDesign {
  methodology: string;
  variables: { independent: string[]; dependent: string[]; controlled: string[] };
  dataCollection: string;
  analysisMethod: string;
  expectedOutcomes: string[];
}

export interface ExecutionResult {
  codeSnippets: Array<{ language: string; description: string; code: string }>;
  dataAnalysis: string;
  statisticalTests: string[];
}

export interface AnalysisResult {
  findings: string[];
  limitations: string[];
  decision: 'CONTINUE' | 'PIVOT' | 'REFINE';
  pivotReason?: string;
}

export interface WritingResult {
  outline: string[];
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
  discussion: string;
  conclusion: string;
  wordCount: number;
}

export interface FinalizationResult {
  qualityScore: number;
  citationVerifications: VerificationResult[];
  exports: {
    markdown: string;
    bibtex: string;
    bibliography: string[];
    verifiedCitations: Array<{
      title?: string;
      authors?: string[];
      year?: string | number;
      journal?: string;
      doi?: string;
      arxivId?: string;
      url?: string;
      bibliographyEntry?: string;
      confidence: number;
      source: string;
    }>;
  };
  warnings: string[];
}

export interface PipelineState {
  topic: string;
  options: PipelineOptions;
  startedAt: string;
  currentPhase: number;
  phases: {
    scoping?: ResearchQuestion;
    literature?: LiteratureResult;
    synthesis?: SynthesisResult;
    design?: ExperimentDesign;
    execution?: ExecutionResult;
    analysis?: AnalysisResult;
    writing?: WritingResult;
    finalization?: FinalizationResult;
  };
  completedAt?: string;
  errors?: PhaseError[];
}

export interface PipelineResult {
  success: boolean;
  topic: string;
  state: PipelineState;
  outputDir: string;
  files: string[];
  error?: string;
  failedPhase?: number;
  warnings?: string[];
}

export interface PhaseError {
  phase: number;
  phaseName: string;
  error: string;
  timestamp: string;
}

interface CitationProfile {
  index: number;
  title: string;
  journal: string;
  authors: string[];
  keywords: string[];
  authorHints: string[];
}

export class ResearchPipeline {
  private readonly arxiv: ArxivClient;
  private readonly scholar: SemanticScholarClient;
  private readonly pubmed: PubMedClient;
  private readonly verifier: CitationVerifier;

  constructor() {
    this.arxiv = new ArxivClient();
    this.scholar = new SemanticScholarClient();
    this.pubmed = new PubMedClient();
    this.verifier = new CitationVerifier();
  }

  private async canUseLLMCallback(llmCallback?: (prompt: string) => Promise<string>): Promise<boolean> {
    if (!llmCallback) return false;
    try {
      const result = await llmCallback('Reply with exactly OK.');
      return stripReasoningBlocks(result || '').toUpperCase().includes('OK');
    } catch {
      return false;
    }
  }

  async run(topic: string, options: Partial<PipelineOptions> = {}): Promise<PipelineResult> {
    if (!topic || !topic.trim()) {
      throw new Error('Pipeline topic cannot be empty');
    }
    const resolvedOptions: PipelineOptions = {
      autoApprove: options.autoApprove ?? true,
      maxPapers: options.maxPapers ?? 20,
      outputDir: options.outputDir ?? path.join(process.cwd(), 'output', 'pipeline'),
      language: options.language ?? 'en',
      llmCallback: options.llmCallback,
      useTemplateFallback: options.useTemplateFallback ?? false,
    };

    const warnings: string[] = [];
    const llmHealthy = !resolvedOptions.useTemplateFallback && await this.canUseLLMCallback(resolvedOptions.llmCallback);
    const effectiveLlmCallback = llmHealthy ? resolvedOptions.llmCallback : undefined;
    if (resolvedOptions.llmCallback && !resolvedOptions.useTemplateFallback && !llmHealthy) {
      warnings.push('LLM preflight failed; pipeline ran in template fallback mode.');
    }
    const useLLM = !!effectiveLlmCallback && !resolvedOptions.useTemplateFallback;
    if (useLLM) {
      researchInfo('[ResearchPipeline] Mode: LLM-assisted (phases 3-7 will use AI generation)');
    } else {
      researchInfo('[ResearchPipeline] Mode: TEMPLATE (phases 3-7 use structured templates, NOT AI-generated content)');
      researchInfo('[ResearchPipeline] To enable AI generation, provide options.llmCallback');
    }

    fs.mkdirSync(resolvedOptions.outputDir, { recursive: true });

    const stateFile = path.join(resolvedOptions.outputDir, 'pipeline-state.json');

    let state: PipelineState = {
      topic,
      options: resolvedOptions,
      startedAt: new Date().toISOString(),
      currentPhase: 0,
      phases: {},
    };

    try {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const saved = JSON.parse(raw) as PipelineState;
      if (saved.topic === topic) {
        state = saved;
        researchInfo(`Resuming pipeline from phase ${state.currentPhase}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        researchWarn(`Failed to load saved state: ${error}. Starting fresh.`, true);
      }
    }

    const saveState = () => {
      try {
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      } catch (err) {
        researchError(`[ResearchPipeline] Failed to save state: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const MAX_ERROR_HISTORY = 50;
    const recordError = (phase: number, phaseName: string, error: unknown) => {
      const errorEntry: PhaseError = {
        phase,
        phaseName,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
      if (!state.errors) {
        state.errors = [];
      }
      state.errors.push(errorEntry);
      // Limit error history to prevent unbounded growth
      if (state.errors.length > MAX_ERROR_HISTORY) {
        state.errors = state.errors.slice(-MAX_ERROR_HISTORY);
      }
      saveState();
      researchError(`[ResearchPipeline] Phase ${phase} (${phaseName}) failed: ${errorEntry.error}`);
    };

    const files: string[] = [stateFile];

    // Phase 1: Scoping
    if (state.currentPhase <= 1) {
      researchInfo('[Phase 1/8] Scoping: Decomposing research topic...');
      try {
        state.phases.scoping = await this.phaseScoping(topic, resolvedOptions.language);
        state.currentPhase = 2;
        saveState();
      } catch (error) {
        recordError(1, 'Scoping', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 1 (Scoping) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 1,
        };
      }
    }

    // Phase 2: Literature
    if (state.currentPhase <= 2) {
      researchInfo('[Phase 2/8] Literature: Collecting papers from multiple sources...');
      try {
        const scoping = state.phases.scoping;
        if (!scoping) throw new Error('State corrupted: scoping data missing. Delete state file to restart.');
        state.phases.literature = await this.phaseLiterature(
          topic,
          scoping.keywords,
          resolvedOptions.maxPapers
        );
        state.currentPhase = 3;
        saveState();
      } catch (error) {
        recordError(2, 'Literature', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 2 (Literature) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 2,
        };
      }
    }

    // Phase 3: Synthesis
    if (state.currentPhase <= 3) {
      researchInfo(`[Phase 3/8] Synthesis: Identifying gaps and generating hypotheses... [${useLLM ? 'LLM mode' : 'TEMPLATE mode'}]`);
      try {
        const lit = state.phases.literature;
        if (!lit) throw new Error('State corrupted: literature data missing. Delete state file to restart.');
        state.phases.synthesis = await this.phaseSynthesis(
          topic,
          lit.arxivPapers,
          resolvedOptions.language,
          useLLM ? effectiveLlmCallback : undefined
        );
        state.currentPhase = 4;
        saveState();
      } catch (error) {
        recordError(3, 'Synthesis', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 3 (Synthesis) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 3,
          warnings,
        };
      }
    }

    // Phase 4: Design
    if (state.currentPhase <= 4) {
      researchInfo(`[Phase 4/8] Design: Creating experiment design... [${useLLM ? 'LLM mode' : 'TEMPLATE mode'}]`);
      try {
        const scoping4 = state.phases.scoping;
        const synthesis4 = state.phases.synthesis;
        if (!scoping4 || !synthesis4) throw new Error('State corrupted: scoping or synthesis data missing. Delete state file to restart.');
        state.phases.design = await this.phaseDesign(
          topic,
          scoping4,
          synthesis4,
          resolvedOptions.language,
          useLLM ? effectiveLlmCallback : undefined
        );
        state.currentPhase = 5;
        saveState();
      } catch (error) {
        recordError(4, 'Design', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 4 (Design) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 4,
          warnings,
        };
      }
    }

    // Phase 5: Execution
    if (state.currentPhase <= 5) {
      researchInfo(`[Phase 5/8] Execution: Generating analysis code and methods... [${useLLM ? 'LLM mode' : 'TEMPLATE mode'}]`);
      try {
        const design5 = state.phases.design;
        if (!design5) throw new Error('State corrupted: design data missing. Delete state file to restart.');
        state.phases.execution = await this.phaseExecution(
          topic,
          design5,
          resolvedOptions.language,
          useLLM ? effectiveLlmCallback : undefined
        );
        state.currentPhase = 6;
        saveState();
      } catch (error) {
        recordError(5, 'Execution', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 5 (Execution) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 5,
          warnings,
        };
      }
    }

    // Phase 6: Analysis
    if (state.currentPhase <= 6) {
      researchInfo(`[Phase 6/8] Analysis: Evaluating results and making PIVOT/REFINE decision... [${useLLM ? 'LLM mode' : 'TEMPLATE mode'}]`);
      try {
        const execution6 = state.phases.execution;
        const synthesis6 = state.phases.synthesis;
        if (!execution6 || !synthesis6) throw new Error('State corrupted: execution or synthesis data missing. Delete state file to restart.');
        state.phases.analysis = await this.phaseAnalysis(
          topic,
          execution6,
          synthesis6,
          useLLM ? effectiveLlmCallback : undefined
        );
        state.currentPhase = 7;
        saveState();
      } catch (error) {
        recordError(6, 'Analysis', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 6 (Analysis) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 6,
          warnings,
        };
      }
    }

    // Phase 7: Writing
    if (state.currentPhase <= 7) {
      researchInfo(`[Phase 7/8] Writing: Generating paper outline, draft, and peer review... [${useLLM ? 'LLM mode' : 'TEMPLATE mode'}]`);
      try {
        state.phases.writing = await this.phaseWriting(
          topic,
          state.phases,
          resolvedOptions.language,
          useLLM ? effectiveLlmCallback : undefined
        );
        state.currentPhase = 8;
        saveState();
      } catch (error) {
        recordError(7, 'Writing', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 7 (Writing) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 7,
          warnings,
        };
      }
    }

    // Phase 8: Finalization
    if (state.currentPhase <= 8) {
      researchInfo('[Phase 8/8] Finalization: Quality check, citation verification, export...');
      try {
        state.phases.finalization = await this.phaseFinalization(
          topic,
          state.phases,
          resolvedOptions.outputDir,
          resolvedOptions.language
        );
        state.completedAt = new Date().toISOString();
        state.currentPhase = 9;
        saveState();
      } catch (error) {
        recordError(8, 'Finalization', error);
        return {
          success: false,
          topic,
          state,
          outputDir: resolvedOptions.outputDir,
          files: [stateFile],
          error: `Phase 8 (Finalization) failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: 8,
          warnings,
        };
      }
    }

    // Write final outputs (single write point — phaseFinalization no longer writes files)
    const fin = state.phases.finalization;
    if (!fin) throw new Error('Internal error: finalization phase data missing after successful completion.');

    const markdownPath = path.join(resolvedOptions.outputDir, 'paper-draft.md');
    fs.writeFileSync(markdownPath, fin.exports.markdown);
    files.push(markdownPath);

    const bibtexPath = path.join(resolvedOptions.outputDir, 'references.bib');
    fs.writeFileSync(bibtexPath, fin.exports.bibtex);
    files.push(bibtexPath);

    const bibliographyPath = path.join(resolvedOptions.outputDir, 'references-gbt.txt');
    fs.writeFileSync(bibliographyPath, fin.exports.bibliography.join('\n'), 'utf-8');
    files.push(bibliographyPath);

    const verifiedCitationsPath = path.join(resolvedOptions.outputDir, 'verified-citations.json');
    fs.writeFileSync(verifiedCitationsPath, JSON.stringify(fin.exports.verifiedCitations, null, 2), 'utf-8');
    files.push(verifiedCitationsPath);

    const reportPath = path.join(resolvedOptions.outputDir, 'pipeline-report.md');
    fs.writeFileSync(reportPath, this.generateReport(state));
    files.push(reportPath);

    const workspaceExport = await exportPaperWorkspace({
      workspaceDir: resolvedOptions.outputDir,
      title: topic,
      markdown: fin.exports.markdown,
      bibliography: fin.exports.bibliography,
      citationRecords: fin.exports.verifiedCitations,
      rawData: {
        topic,
        scoping: state.phases.scoping,
        literature: state.phases.literature,
        synthesis: state.phases.synthesis,
        design: state.phases.design,
        execution: state.phases.execution,
        analysis: state.phases.analysis,
      },
      sourceCode: (state.phases.execution?.codeSnippets ?? []).map((snippet, index) => ({
        filename: `snippet_${index + 1}.${snippet.language === 'python' ? 'py' : snippet.language === 'typescript' ? 'ts' : 'txt'}`,
        content: `# ${snippet.description}\n\n${snippet.code}`,
      })),
      metadata: {
        qualityScore: fin.qualityScore,
        warnings: fin.warnings,
        citationVerificationCount: fin.citationVerifications.length,
      },
    });
    const executionRuns = runSourceCodeValidation(workspaceExport.sourceCodeDir, resolvedOptions.outputDir);
    const evidence = writeWorkspaceEvidenceManifest({
      workspaceDir: resolvedOptions.outputDir,
      title: topic,
      markdownPath: workspaceExport.markdownPath,
      docxPath: workspaceExport.docxPath,
      bibliographyPath: workspaceExport.bibliographyPath,
      citationsJsonPath: workspaceExport.citationsJsonPath,
      rawDataDir: workspaceExport.rawDataDir,
      sourceCodeDir: workspaceExport.sourceCodeDir,
      figures: workspaceExport.figures,
      formulaDir: workspaceExport.formulaDir,
      formulaCount: workspaceExport.formulaCount,
      markdown: fin.exports.markdown,
      bibliography: fin.exports.bibliography,
      citationRecords: fin.exports.verifiedCitations,
      executionRuns,
    });
    files.push(
      workspaceExport.docxPath,
      workspaceExport.markdownPath,
      workspaceExport.bibliographyPath,
      workspaceExport.manifestPath,
      workspaceExport.evidenceManifestPath,
      workspaceExport.strictValidationPath,
      evidence.evidenceManifestPath,
      evidence.validationReportPath,
      ...workspaceExport.figures.flatMap((figure) => [figure.svgPath, figure.tifPath]),
    );
    if (workspaceExport.citationsJsonPath) {
      files.push(workspaceExport.citationsJsonPath);
    }

    return {
      success: true,
      topic,
      state,
      outputDir: resolvedOptions.outputDir,
      files,
      warnings,
    };
  }

  private async phaseScoping(topic: string, language: 'zh' | 'en'): Promise<ResearchQuestion> {
    const words = topic
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const uniqueKeywords = [...new Set(words)].slice(0, 8);

    const question: ResearchQuestion = {
      question: language === 'zh' ? `关于"${topic}"的研究问题` : `Research questions about "${topic}"`,
      subQuestions: [
        language === 'zh' ? `${topic}的现有方法有哪些局限性？` : `What are the limitations of existing approaches to ${topic}?`,
        language === 'zh' ? `${topic}中有哪些未解决的挑战？` : `What unresolved challenges exist in ${topic}?`,
        language === 'zh' ? `如何改进${topic}的性能指标？` : `How can performance metrics in ${topic} be improved?`,
        language === 'zh' ? `${topic}有哪些实际应用场景？` : `What are the practical applications of ${topic}?`,
      ],
      keywords: uniqueKeywords,
      hypotheses: [
        language === 'zh' ? `假设：现有的${topic}方法可以通过新的优化策略得到改进` : `Hypothesis: Existing ${topic} methods can be improved through novel optimization strategies`,
        language === 'zh' ? `假设：结合多源数据可以提升${topic}的准确性` : `Hypothesis: Combining multi-source data can improve accuracy in ${topic}`,
      ],
    };

    return question;
  }

  private async phaseLiterature(
    topic: string,
    keywords: string[],
    maxPapers: number
  ): Promise<LiteratureResult> {
    const searchQuery = keywords.slice(0, 4).join(' ');

    // Use Promise.allSettled to gracefully handle individual source failures
    const [arxivPapers, scholarPapers] = await Promise.allSettled([
      this.arxiv.search(topic, { maxResults: Math.ceil(maxPapers * 0.6) }).catch(err => {
        researchWarn(`[ResearchPipeline] arXiv search failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
      this.scholar.search(searchQuery, { limit: Math.ceil(maxPapers * 0.4) }).catch(err => {
        researchWarn(`[ResearchPipeline] Semantic Scholar search failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
    ]);

    const resolvedArxiv = arxivPapers.status === 'fulfilled' ? arxivPapers.value : [];
    const resolvedScholar = scholarPapers.status === 'fulfilled' ? scholarPapers.value : [];

    let pubmedCount = 0;
    try {
      const pubmedResults = await this.pubmed.search(topic, { maxResults: 10 });
      pubmedCount = pubmedResults.length;
    } catch (err) {
      researchWarn(`[ResearchPipeline] PubMed search failed: ${err instanceof Error ? err.message : String(err)}`);
      pubmedCount = 0;
    }

    // Warn if no papers found from any source
    if (resolvedArxiv.length === 0 && resolvedScholar.length === 0) {
      researchWarn('[ResearchPipeline] Warning: No papers found from any source. Check network connectivity and API availability.', true);
    }

    return {
      arxivPapers: resolvedArxiv,
      scholarPapers: resolvedScholar,
      pubmedCount,
      totalFound: resolvedArxiv.length + resolvedScholar.length + pubmedCount,
    };
  }

  private async phaseSynthesis(
    topic: string,
    papers: ArxivPaper[],
    language: 'zh' | 'en',
    llmCallback?: (prompt: string) => Promise<string>
  ): Promise<SynthesisResult> {
    const categories = new Map<string, number>();
    for (const paper of papers) {
      for (const cat of paper.categories) {
        categories.set(cat, (categories.get(cat) ?? 0) + 1);
      }
    }

    const topCategories = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    const themes = topCategories.length > 0 ? topCategories : [`core ${topic}`, `applied ${topic}`];

    // If LLM callback provided, use it to generate synthesis content
    if (llmCallback) {
      const paperSummaries = papers.slice(0, 10).map((p, i) =>
        `${i + 1}. "${p.title ?? ''}" (${(p.authors ?? []).slice(0, 2).join(', ')}, ${(p.published ?? '').slice(0, 4)})\n   ${(p.abstract ?? '').slice(0, 200)}`
      ).join('\n\n');

      const prompt = [
        `You are a research synthesis expert. Analyze the following papers on "${topic}" and provide a structured synthesis.`,
        language === 'zh'
          ? `Please respond in Chinese with the following JSON structure (no markdown code fences, raw JSON only):`
          : `Please respond in English with the following JSON structure (no markdown code fences, raw JSON only):`,
        `{
  "gaps": ["gap1", "gap2", "gap3", "gap4"],
  "hypotheses": ["hypothesis1", "hypothesis2"],
  "contradictions": ["contradiction1", "contradiction2"]
}`,
        `\nPapers to analyze:\n${paperSummaries}`,
      ].join('\n');

      try {
        const raw = stripReasoningBlocks(await llmCallback(prompt));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<{ gaps: string[]; hypotheses: string[]; contradictions: string[] }>;
          return {
            gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
            hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
            themes,
            contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
          };
        }
      } catch (err) {
        researchWarn(`[ResearchPipeline] LLM synthesis failed, falling back to template: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }

    // Template fallback (clearly labeled as template output)
    researchInfo('[Phase 3/8] Using structured template for synthesis (no LLM available)');
    return {
      gaps: [
        `[TEMPLATE] Limited work on scalability of ${topic} to large-scale datasets`,
        `[TEMPLATE] Insufficient cross-domain evaluation of ${topic} methods`,
        `[TEMPLATE] Lack of interpretability in ${topic} models`,
        `[TEMPLATE] Few studies addressing real-world deployment challenges for ${topic}`,
      ],
      hypotheses: [
        `[TEMPLATE] Improved ${topic} performance through ensemble methods`,
        `[TEMPLATE] Cross-modal fusion can address current ${topic} limitations`,
      ],
      themes,
      contradictions: [
        `[TEMPLATE] Conflicting results on optimal hyperparameter settings for ${topic}`,
        `[TEMPLATE] Disagreement on evaluation metrics for ${topic} benchmarks`,
      ],
    };
  }

  private async phaseDesign(
    topic: string,
    scoping: ResearchQuestion,
    synthesis: SynthesisResult,
    language: 'zh' | 'en',
    llmCallback?: (prompt: string) => Promise<string>
  ): Promise<ExperimentDesign> {
    if (llmCallback) {
      const prompt = [
        `You are a research methodology expert. Design an experiment for a study on "${topic}".`,
        `Research gaps identified: ${synthesis.gaps.join('; ')}`,
        `Research hypotheses: ${synthesis.hypotheses.join('; ')}`,
        `Research questions: ${scoping.subQuestions.join('; ')}`,
        language === 'zh'
          ? 'Please respond in Chinese with the following JSON structure (raw JSON, no markdown fences):'
          : 'Please respond in English with the following JSON structure (raw JSON, no markdown fences):',
        `{
  "methodology": "...",
  "variables": {
    "independent": ["var1", "var2"],
    "dependent": ["var1", "var2"],
    "controlled": ["var1", "var2"]
  },
  "dataCollection": "...",
  "analysisMethod": "...",
  "expectedOutcomes": ["outcome1", "outcome2"]
}`,
      ].join('\n');

      try {
        const raw = stripReasoningBlocks(await llmCallback(prompt));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<ExperimentDesign>;
          if (parsed.methodology && parsed.variables) {
            return {
              methodology: parsed.methodology,
              variables: {
                independent: parsed.variables.independent ?? [],
                dependent: parsed.variables.dependent ?? [],
                controlled: parsed.variables.controlled ?? [],
              },
              dataCollection: parsed.dataCollection ?? '',
              analysisMethod: parsed.analysisMethod ?? '',
              expectedOutcomes: parsed.expectedOutcomes ?? [],
            };
          }
        }
      } catch (err) {
        researchWarn(`[ResearchPipeline] LLM design failed, falling back to template: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }

    // Template fallback
    researchInfo('[Phase 4/8] Using structured template for experiment design (no LLM available)');
    return {
      methodology: `[TEMPLATE] Experimental study using controlled comparisons on standard benchmarks for ${topic}`,
      variables: {
        independent: [`[TEMPLATE] Model architecture`, `[TEMPLATE] Training strategy`, `[TEMPLATE] Data preprocessing`],
        dependent: [`[TEMPLATE] Accuracy`, `[TEMPLATE] F1 score`, `[TEMPLATE] Computational efficiency`],
        controlled: [`[TEMPLATE] Random seed`, `[TEMPLATE] Hardware environment`, `[TEMPLATE] Dataset splits`],
      },
      dataCollection: `[TEMPLATE] Systematic collection from public repositories and benchmark datasets related to ${topic}`,
      analysisMethod: `[TEMPLATE] Statistical significance testing (t-test, Wilcoxon) with Bonferroni correction; ablation studies`,
      expectedOutcomes: [
        `[TEMPLATE] Proposed method outperforms baseline by ≥5% on primary metrics`,
        ...synthesis.hypotheses.map((h) => `Validation: ${h}`),
        ...scoping.subQuestions.slice(0, 2).map((q) => `Answer to: ${q}`),
      ],
    };
  }

  private async phaseExecution(
    topic: string,
    design: ExperimentDesign,
    language: 'zh' | 'en',
    llmCallback?: (prompt: string) => Promise<string>
  ): Promise<ExecutionResult> {
    if (llmCallback) {
      const prompt = [
        `You are a research engineer. Generate analysis code and execution plan for a study on "${topic}".`,
        `Methodology: ${design.methodology}`,
        `Independent variables: ${design.variables.independent.join(', ')}`,
        `Dependent variables: ${design.variables.dependent.join(', ')}`,
        `Analysis method: ${design.analysisMethod}`,
        language === 'zh'
          ? 'Respond in English for code, Chinese for descriptions. Provide raw JSON (no markdown fences):'
          : 'Respond in English. Provide raw JSON (no markdown fences):',
        `{
  "codeSnippets": [
    {"language": "python", "description": "...", "code": "..."},
    {"language": "python", "description": "...", "code": "..."}
  ],
  "dataAnalysis": "...",
  "statisticalTests": ["test1", "test2"]
}`,
      ].join('\n');

      try {
        const raw = stripReasoningBlocks(await llmCallback(prompt));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<ExecutionResult>;
          if (parsed.codeSnippets && parsed.dataAnalysis) {
            return {
              codeSnippets: parsed.codeSnippets,
              dataAnalysis: parsed.dataAnalysis,
              statisticalTests: parsed.statisticalTests ?? [],
            };
          }
        }
      } catch (err) {
        researchWarn(`[ResearchPipeline] LLM execution failed, falling back to template: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }

    // Template fallback
    researchInfo('[Phase 5/8] Using structured template for execution (no LLM available)');
    return {
      codeSnippets: [
        {
          language: 'python',
          description: `[TEMPLATE] Data loading and preprocessing for ${topic}`,
          code: `import numpy as np\nimport pandas as pd\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.preprocessing import StandardScaler\n\ndef load_dataset(path: str):\n    """Load and preprocess ${topic} dataset."""\n    df = pd.read_csv(path)\n    X = df.drop('target', axis=1).values\n    y = df['target'].values\n    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n    scaler = StandardScaler()\n    X_train = scaler.fit_transform(X_train)\n    X_test = scaler.transform(X_test)\n    return X_train, X_test, y_train, y_test`,
        },
        {
          language: 'python',
          description: `[TEMPLATE] Baseline model for ${topic}`,
          code: `from sklearn.metrics import accuracy_score, f1_score, classification_report\nfrom sklearn.ensemble import RandomForestClassifier\n\ndef train_baseline(X_train, y_train, X_test, y_test):\n    """Train and evaluate baseline model."""\n    model = RandomForestClassifier(n_estimators=100, random_state=42)\n    model.fit(X_train, y_train)\n    y_pred = model.predict(X_test)\n    metrics = {\n        'accuracy': accuracy_score(y_test, y_pred),\n        'f1_macro': f1_score(y_test, y_pred, average='macro'),\n        'report': classification_report(y_test, y_pred)\n    }\n    return model, metrics`,
        },
        {
          language: 'python',
          description: `[TEMPLATE] Statistical significance testing for ${topic} results`,
          code: `from scipy import stats\nfrom statsmodels.stats.multitest import multipletests\n\ndef significance_test(baseline_scores: list, proposed_scores: list, alpha: float = 0.05):\n    """Perform paired t-test with Bonferroni correction."""\n    t_stat, p_value = stats.ttest_rel(proposed_scores, baseline_scores)\n    significant = p_value < alpha\n    effect_size = (np.mean(proposed_scores) - np.mean(baseline_scores)) / np.std(baseline_scores)\n    return {'t_statistic': t_stat, 'p_value': p_value, 'significant': significant, 'cohens_d': effect_size}`,
        },
      ],
      dataAnalysis: `[TEMPLATE] Analysis will compare proposed method against ${design.variables.independent.join(', ')} variations across ${design.variables.dependent.join(', ')} metrics.`,
      statisticalTests: ['Paired t-test', 'Wilcoxon signed-rank test', 'Bonferroni correction', 'Effect size (Cohen\'s d)'],
    };
  }

  private async phaseAnalysis(
    topic: string,
    execution: ExecutionResult,
    synthesis: SynthesisResult,
    llmCallback?: (prompt: string) => Promise<string>
  ): Promise<AnalysisResult> {
    const hasEnoughData = execution.codeSnippets.length > 0 && synthesis.gaps.length > 0;

    if (llmCallback) {
      const prompt = [
        `You are a research analyst. Evaluate the research plan and results for a study on "${topic}".`,
        `Code components implemented: ${execution.codeSnippets.length}`,
        `Research gaps identified: ${synthesis.gaps.join('; ')}`,
        `Thematic areas covered: ${synthesis.themes.join(', ')}`,
        `Statistical tests prepared: ${execution.statisticalTests.join(', ')}`,
        `Data analysis: ${execution.dataAnalysis}`,
        'Provide raw JSON (no markdown fences):',
        `{
  "findings": ["finding1", "finding2", "finding3"],
  "limitations": ["limitation1", "limitation2"],
  "decision": "CONTINUE",
  "pivotReason": null
}`,
        'Note: decision must be one of: CONTINUE, PIVOT, REFINE',
      ].join('\n');

      try {
        const raw = stripReasoningBlocks(await llmCallback(prompt));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalysisResult>;
          if (parsed.findings && parsed.limitations && parsed.decision) {
            return {
              findings: parsed.findings,
              limitations: parsed.limitations,
              decision: ['CONTINUE', 'PIVOT', 'REFINE'].includes(parsed.decision) ? parsed.decision : 'CONTINUE',
              pivotReason: parsed.pivotReason ?? undefined,
            };
          }
        }
      } catch (err) {
        researchWarn(`[ResearchPipeline] LLM analysis failed, falling back to template: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }

    // Template fallback
    researchInfo('[Phase 6/8] Using structured template for analysis (no LLM available)');
    return {
      findings: [
        `[TEMPLATE] Implemented ${execution.codeSnippets.length} analysis components`,
        `[TEMPLATE] Identified ${synthesis.gaps.length} research gaps to address`,
        `[TEMPLATE] Proposed solutions cover ${synthesis.themes.length} thematic areas`,
        `[TEMPLATE] Statistical tests prepared: ${execution.statisticalTests.join(', ')}`,
      ],
      limitations: [
        '[TEMPLATE] Results depend on dataset quality and representativeness',
        '[TEMPLATE] Computational budget may limit hyperparameter search',
        '[TEMPLATE] Generalization to out-of-distribution data requires further investigation',
      ],
      decision: hasEnoughData ? 'CONTINUE' : 'REFINE',
      pivotReason: hasEnoughData ? undefined : 'Insufficient data coverage detected, refining methodology',
    };
  }

  private async phaseWriting(
    topic: string,
    phases: PipelineState['phases'],
    language: 'zh' | 'en',
    llmCallback?: (prompt: string) => Promise<string>
  ): Promise<WritingResult> {
    const lit = phases.literature;
    const synthesis = phases.synthesis;
    const design = phases.design;
    const analysis = phases.analysis;
    if (!lit || !synthesis || !design || !analysis) {
      throw new Error('State corrupted: missing phase data for writing. Delete state file to restart.');
    }

    const isZh = language === 'zh';

    if (llmCallback) {
      const contextSummary = [
        `Topic: ${topic}`,
        `Papers reviewed: ${lit.totalFound} (arXiv: ${lit.arxivPapers.length}, Scholar: ${lit.scholarPapers.length}, PubMed: ${lit.pubmedCount})`,
        `Research gaps: ${synthesis.gaps.join('; ')}`,
        `Hypotheses: ${synthesis.hypotheses.join('; ')}`,
        `Methodology: ${design.methodology}`,
        `Key findings: ${analysis.findings.join('; ')}`,
        `Decision: ${analysis.decision}`,
      ].join('\n');

      const topPapers = lit.arxivPapers.slice(0, 5).map(p => `- "${p.title ?? ''}" (${(p.authors ?? []).slice(0, 2).join(', ')}, ${(p.published ?? '').slice(0, 4)})`).join('\n');

      const prompt = [
        `You are an expert academic writer. Write a complete research paper in ${isZh ? 'Chinese' : 'English'}.`,
        `Based on the following research context:\n${contextSummary}`,
        `Top related papers:\n${topPapers}`,
        `Write the paper in Markdown with clear section headings. Include: Abstract, Introduction, Methodology, Results, Discussion, Conclusion.`,
        `Respond with raw JSON (no markdown fences):`,
        `{
  "abstract": "...",
  "introduction": "## 1. Introduction\n\n...",
  "methodology": "## 2. Methodology\n\n...",
  "results": "## 3. Results\n\n...",
  "discussion": "## 4. Discussion\n\n...",
  "conclusion": "## 5. Conclusion\n\n..."
}`,
      ].join('\n');

      try {
        const raw = stripReasoningBlocks(await llmCallback(prompt));
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<{ abstract: string; introduction: string; methodology: string; results: string; discussion: string; conclusion: string }>;
          if (parsed.abstract && parsed.introduction) {
            const wordCount = Object.values(parsed).join(' ').split(/\s+/).length;
            return {
              outline: [
                isZh ? '1. 引言' : '1. Introduction',
                isZh ? '2. 相关工作' : '2. Related Work',
                isZh ? '3. 研究方法' : '3. Methodology',
                isZh ? '4. 实验结果' : '4. Results',
                isZh ? '5. 讨论' : '5. Discussion',
                isZh ? '6. 结论' : '6. Conclusion',
              ],
              abstract: parsed.abstract,
              introduction: parsed.introduction ?? '',
              methodology: parsed.methodology ?? '',
              results: parsed.results ?? '',
              discussion: parsed.discussion ?? '',
              conclusion: parsed.conclusion ?? '',
              wordCount,
            };
          }
        }
      } catch (err) {
        researchWarn(`[ResearchPipeline] LLM writing failed, falling back to template: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }

    // Template fallback
    researchInfo('[Phase 7/8] Using structured template for writing (no LLM available)');
    const TMPL = '[TEMPLATE] ';

    const abstract = isZh
      ? `${TMPL}本研究针对${topic}领域中的核心挑战，通过系统性文献综述（共检索${lit.totalFound}篇相关文献）识别出${synthesis.gaps.length}个主要研究缺口。` +
        `我们提出了一种基于${design.methodology}的新方法，实验设计涵盖${design.variables.independent.join('、')}等关键变量。` +
        `研究结果表明，所提方法在${design.variables.dependent.join('、')}等指标上具有显著优势。`
      : `${TMPL}This study addresses core challenges in ${topic} through systematic literature review of ${lit.totalFound} papers, ` +
        `identifying ${synthesis.gaps.length} key research gaps. We propose a novel approach based on ${design.methodology}, ` +
        `with experimental design covering ${design.variables.independent.join(', ')}. ` +
        `Results demonstrate significant improvements in ${design.variables.dependent.join(', ')}.`;

    const introduction = isZh
      ? `## 1. 引言\n\n${TMPL}${topic}是当前学术界研究的热点领域之一。随着相关技术的快速发展，该领域已取得了丰硕的研究成果，但同时也面临诸多挑战。\n\n通过对${lit.totalFound}篇相关文献的系统分析，我们识别出以下主要研究缺口：\n\n${synthesis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n\n本文的主要贡献包括：\n\n1. 系统梳理了${topic}领域的研究现状\n2. 提出了${synthesis.hypotheses[0]}\n3. 通过严格的实验验证了所提方法的有效性`
      : `## 1. Introduction\n\n${TMPL}${topic} is an active research area with significant recent progress. Despite advances, key challenges remain unaddressed.\n\nThrough analysis of ${lit.totalFound} papers, we identify the following research gaps:\n\n${synthesis.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n\n**Contributions:**\n1. Systematic review of ${topic} research\n2. Novel approach: ${synthesis.hypotheses[0]}\n3. Rigorous experimental validation`;

    const methodology = isZh
      ? `## 2. 研究方法\n\n### 2.1 研究设计\n\n${TMPL}本研究采用${design.methodology}。\n\n### 2.2 变量定义\n\n**自变量：** ${design.variables.independent.join('、')}\n\n**因变量：** ${design.variables.dependent.join('、')}\n\n**控制变量：** ${design.variables.controlled.join('、')}\n\n### 2.3 数据收集\n\n${design.dataCollection}\n\n### 2.4 分析方法\n\n${design.analysisMethod}`
      : `## 2. Methodology\n\n### 2.1 Research Design\n\n${TMPL}${design.methodology}\n\n### 2.2 Variables\n\n**Independent:** ${design.variables.independent.join(', ')}\n\n**Dependent:** ${design.variables.dependent.join(', ')}\n\n**Controlled:** ${design.variables.controlled.join(', ')}\n\n### 2.3 Data Collection\n\n${design.dataCollection}\n\n### 2.4 Analysis\n\n${design.analysisMethod}`;

    const results = isZh
      ? `## 3. 实验结果\n\n### 3.1 主要发现\n\n${analysis.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n### 3.2 统计检验\n\n${TMPL}采用${design.analysisMethod.split(';')[0]}进行显著性检验，结果显示所提方法具有统计显著性（p < 0.05）。`
      : `## 3. Results\n\n### 3.1 Main Findings\n\n${analysis.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n### 3.2 Statistical Analysis\n\n${TMPL}Using ${design.analysisMethod.split(';')[0]}, results show statistical significance (p < 0.05).`;

    const discussion = isZh
      ? `## 4. 讨论\n\n### 4.1 结果解读\n\n${TMPL}本研究的实验结果支持我们提出的研究假设。具体而言，${synthesis.hypotheses.map((h) => h).join('；')}。\n\n### 4.2 研究局限\n\n${analysis.limitations.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n### 4.3 与现有工作的比较\n\n${TMPL}通过与${lit.arxivPapers.slice(0, 3).map((p) => `"${p.title}"`).join('、')}等工作的对比分析，本研究的方法展现出明显优势。`
      : `## 4. Discussion\n\n### 4.1 Interpretation\n\n${TMPL}Results support our hypotheses: ${synthesis.hypotheses.join('; ')}.\n\n### 4.2 Limitations\n\n${analysis.limitations.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n### 4.3 Comparison with Prior Work\n\n${TMPL}Compared to ${lit.arxivPapers.slice(0, 3).map((p) => `"${p.title}"`).join(', ')}, our approach demonstrates clear advantages.`;

    const conclusion = isZh
      ? `## 5. 结论\n\n${TMPL}本文系统研究了${topic}领域的核心问题，通过对${lit.totalFound}篇文献的分析，识别了关键研究缺口，并提出了创新性的解决方案。实验结果验证了所提方法的有效性和优越性。\n\n未来工作将重点关注：\n1. 扩大实验规模，验证方法的可扩展性\n2. 探索跨域应用场景\n3. 进一步提升模型的可解释性`
      : `## 5. Conclusion\n\n${TMPL}This paper systematically studied ${topic}, analyzing ${lit.totalFound} papers to identify research gaps and proposing novel solutions. Experimental results validate the effectiveness of our approach.\n\nFuture work will focus on:\n1. Scaling experiments to validate scalability\n2. Exploring cross-domain applications\n3. Improving model interpretability`;

    const wordCount = (abstract + introduction + methodology + results + discussion + conclusion).split(/\s+/).length;

    return {
      outline: [
        isZh ? '1. 引言' : '1. Introduction',
        isZh ? '2. 相关工作' : '2. Related Work',
        isZh ? '3. 研究方法' : '3. Methodology',
        isZh ? '4. 实验结果' : '4. Results',
        isZh ? '5. 讨论' : '5. Discussion',
        isZh ? '6. 结论' : '6. Conclusion',
      ],
      abstract,
      introduction,
      methodology,
      results,
      discussion,
      conclusion,
      wordCount,
    };
  }

  private async phaseFinalization(
    topic: string,
    phases: PipelineState['phases'],
    outputDir: string,
    language: 'zh' | 'en' = 'en'
  ): Promise<FinalizationResult> {
    const lit = phases.literature!;
    const writing = phases.writing!;
    const warnings: string[] = [];

    const citations = this.collectCandidateCitations(lit);

    const verifications: VerificationResult[] = [];
    const verifiedCitations: FinalizationResult['exports']['verifiedCitations'] = [];
    for (const citation of citations) {
      try {
        const result = await this.verifier.verify(citation);
        verifications.push(result);
        if (result.valid) {
          verifiedCitations.push({
            title: result.resolvedTitle ?? citation.title,
            authors: result.resolvedAuthors ?? citation.authors,
            year: result.resolvedYear ?? citation.year,
            journal: result.resolvedJournal ?? citation.journal,
            doi: result.resolvedDoi ?? citation.doi,
            arxivId: result.resolvedArxivId ?? citation.arxivId,
            url: result.resolvedUrl,
            bibliographyEntry: result.bibliographyEntry,
            confidence: result.confidence,
            source: result.source,
          });
        } else {
          warnings.push(`Low confidence citation: "${citation.title}" (${(result.confidence * 100).toFixed(0)}%)`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        researchWarn(`[ResearchPipeline] Citation verification failed for "${citation.title}": ${errMsg}`);
        warnings.push(`Could not verify citation: "${citation.title}"`);
      }
    }

    const avgVerificationScore =
      verifications.length > 0
        ? verifications.reduce((s, v) => s + v.confidence, 0) / verifications.length
        : 0.5;

    const wordCount = writing.wordCount;
    const wordScore = Math.min(wordCount / 5000, 1);
    const sectionScore = writing.outline.length >= 5 ? 1 : writing.outline.length / 5;
    const qualityScore = Math.round((avgVerificationScore * 0.3 + wordScore * 0.4 + sectionScore * 0.3) * 100);

    const bibtexEntries = verifiedCitations.map((citation) =>
      this.verifier.generateBibtex({
        arxivId: citation.arxivId,
        doi: citation.doi,
        title: citation.title,
        authors: citation.authors,
        year: citation.year,
        journal: citation.journal,
      })
    );
    const bibliography = verifiedCitations.map((citation, index) =>
      this.verifier.formatCitation(citation, 'GB/T 7714', index + 1)
    );
    const citedWriting = this.applyVerifiedCitationsToWriting(writing, verifiedCitations);

    // Assemble markdown content but do NOT write to disk here.
    // run() is solely responsible for writing output files to avoid duplicate writes.
    const markdownExport = this.assemblePaper(topic, citedWriting, bibliography, language);

    return {
      qualityScore,
      citationVerifications: verifications,
      exports: {
        markdown: markdownExport,
        bibtex: bibtexEntries.join('\n\n'),
        bibliography,
        verifiedCitations,
      },
      warnings,
    };
  }

  private assemblePaper(
    topic: string,
    writing: WritingResult,
    bibliography: string[],
    language: 'zh' | 'en'
  ): string {
    const title = language === 'zh' ? `# ${topic}：综合研究报告` : `# ${topic}: A Comprehensive Research Paper`;
    const abstractHeader = language === 'zh' ? '## 摘要' : '## Abstract';

    return [
      title,
      '',
      abstractHeader,
      '',
      writing.abstract,
      '',
      writing.introduction,
      '',
      writing.methodology,
      '',
      writing.results,
      '',
      writing.discussion,
      '',
      writing.conclusion,
      '',
      '## References',
      '',
      ...(bibliography.length > 0 ? bibliography : ['[No verified references available]']),
      '',
      `---`,
      language === 'zh' ? `*字数统计：约${writing.wordCount}词*` : `*Word count: ~${writing.wordCount} words*`,
    ].join('\n');
  }

  private collectCandidateCitations(lit: LiteratureResult): Citation[] {
    const seen = new Set<string>();
    const citations: Citation[] = [];

    const push = (citation: Citation): void => {
      const key = `${citation.doi ?? ''}::${citation.arxivId ?? ''}::${citation.title.toLowerCase().trim()}`;
      if (seen.has(key)) return;
      seen.add(key);
      citations.push(citation);
    };

    for (const paper of lit.arxivPapers.slice(0, 12)) {
      push({
        title: paper.title,
        authors: paper.authors,
        year: paper.published ? paper.published.substring(0, 4) : undefined,
        arxivId: paper.id,
        doi: paper.doi,
      });
    }

    for (const paper of lit.scholarPapers.slice(0, 12)) {
      push({
        title: paper.title,
        authors: (paper.authors ?? []).map((author) => author.name),
        year: paper.year ?? undefined,
        doi: paper.externalIds?.DOI,
        journal: paper.venue,
        paperId: paper.paperId,
      });
    }

    return citations;
  }

  private applyVerifiedCitationsToWriting(
    writing: WritingResult,
    verifiedCitations: FinalizationResult['exports']['verifiedCitations'],
  ): WritingResult {
    if (verifiedCitations.length === 0) {
      return writing;
    }

    const profiles = this.buildCitationProfiles(verifiedCitations);

    return {
      ...writing,
      introduction: this.bindCitationsInSection(writing.introduction, 'introduction', profiles),
      methodology: this.bindCitationsInSection(writing.methodology, 'methodology', profiles),
      results: this.bindCitationsInSection(writing.results, 'results', profiles),
      discussion: this.bindCitationsInSection(writing.discussion, 'discussion', profiles),
      conclusion: this.bindCitationsInSection(writing.conclusion, 'conclusion', profiles),
    };
  }

  private buildCitationProfiles(
    verifiedCitations: FinalizationResult['exports']['verifiedCitations'],
  ): CitationProfile[] {
    return verifiedCitations.map((citation, index) => {
      const title = citation.title ?? '';
      const journal = citation.journal ?? '';
      const authors = citation.authors ?? [];
      return {
        index: index + 1,
        title,
        journal,
        authors,
        keywords: this.extractCitationKeywords(`${title} ${journal}`),
        authorHints: authors.map((author) => this.extractAuthorHint(author)).filter(Boolean),
      };
    });
  }

  private bindCitationsInSection(
    section: string,
    sectionName: 'introduction' | 'methodology' | 'results' | 'discussion' | 'conclusion',
    profiles: CitationProfile[],
  ): string {
    if (!section.trim() || profiles.length === 0) {
      return section;
    }

    const blocks = section.replace(/\r/g, '').split(/\n\s*\n/);
    const sectionPool = this.selectSectionCitationPool(section, sectionName, profiles);
    let fallbackCursor = 0;

    return blocks.map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return block;
      if (/^#{1,6}\s/.test(trimmed)) return block;
      if (/^(?:[-*]\s+|\d+\.\s+)/.test(trimmed)) return block;

      const sentences = this.splitIntoSentences(trimmed);
      const paragraphText = sentences.join(' ').trim();
      const paragraphUsed = new Set<number>();
      let boundAnySentence = false;

      const boundSentences = sentences.map((sentence) => {
        if (/\[\d+\]/.test(sentence)) {
          return sentence;
        }

        const matches = this.rankCitationMatches(sentence, sectionName, profiles, sectionPool)
          .filter((match) => match.score >= 0.18);
        const selected = matches
          .filter((match) => !paragraphUsed.has(match.profile.index))
          .slice(0, matches.length > 1 && matches[1].score >= 0.42 ? 2 : 1)
          .map((match) => match.profile.index);

        if (selected.length === 0) {
          return sentence;
        }

        boundAnySentence = true;
        selected.forEach((index) => paragraphUsed.add(index));
        return this.injectCitationMarkers(sentence, selected);
      });

      if (boundAnySentence) {
        return boundSentences.join(' ');
      }

      if (paragraphText.length < 80 || sectionPool.length === 0) {
        return block;
      }

      const fallback = sectionPool[fallbackCursor % sectionPool.length];
      fallbackCursor += 1;
      if (!fallback) {
        return block;
      }
      return this.injectCitationMarkers(paragraphText, [fallback.index]);
    }).join('\n\n');
  }

  private selectSectionCitationPool(
    section: string,
    sectionName: 'introduction' | 'methodology' | 'results' | 'discussion' | 'conclusion',
    profiles: CitationProfile[],
  ): CitationProfile[] {
    const ranked = this.rankCitationMatches(section, sectionName, profiles, profiles)
      .filter((entry) => entry.score > 0)
      .slice(0, 4)
      .map((entry) => entry.profile);

    if (ranked.length > 0) {
      return ranked;
    }

    switch (sectionName) {
      case 'introduction':
        return profiles.slice(0, 4);
      case 'methodology':
        return profiles.slice(1, 5);
      case 'results':
        return profiles.slice(2, 6);
      case 'discussion':
        return [...profiles.slice(0, 2), ...profiles.slice(4, 6)].slice(0, 4);
      case 'conclusion':
        return profiles.slice(0, 3);
      default:
        return profiles.slice(0, 4);
    }
  }

  private rankCitationMatches(
    text: string,
    sectionName: string,
    profiles: CitationProfile[],
    pool: CitationProfile[],
  ): Array<{ profile: CitationProfile; score: number }> {
    const poolSet = new Set(pool.map((profile) => profile.index));
    return profiles
      .map((profile) => {
        let score = this.scoreCitationAgainstText(text, sectionName, profile);
        if (poolSet.has(profile.index)) {
          score += 0.05;
        }
        return { profile, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  private scoreCitationAgainstText(
    text: string,
    sectionName: string,
    profile: CitationProfile,
  ): number {
    const normalizedText = this.normalizeCitationText(text);
    if (!normalizedText) return 0;

    const tokens = new Set(this.extractCitationKeywords(text));
    const keywordMatches = profile.keywords.filter((keyword) =>
      tokens.has(keyword) || normalizedText.includes(keyword),
    ).length;
    const authorMatches = profile.authorHints.filter((hint) =>
      hint.length >= 4 && normalizedText.includes(hint),
    ).length;

    let score = 0;
    if (profile.title && normalizedText.includes(this.normalizeCitationText(profile.title))) {
      score += 0.7;
    }
    score += keywordMatches * 0.16;
    score += authorMatches * 0.18;

    const sectionBoostKeywords: Record<string, string[]> = {
      introduction: ['survey', 'review', 'background', 'previous', 'related', 'literature', 'prior'],
      methodology: ['method', 'model', 'framework', 'approach', 'algorithm', 'pipeline'],
      results: ['result', 'performance', 'benchmark', 'evaluation', 'experiment', 'ablation'],
      discussion: ['limitation', 'discussion', 'interpretation', 'comparison', 'implication'],
      conclusion: ['conclusion', 'future', 'summary', 'prospect'],
    };
    const boosts = sectionBoostKeywords[sectionName] ?? [];
    if (boosts.some((keyword) => normalizedText.includes(keyword) && profile.keywords.includes(keyword))) {
      score += 0.12;
    }

    return Math.min(score, 1);
  }

  private splitIntoSentences(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const matches = normalized.match(/[^。！？.!?]+[。！？.!?]?/g);
    return matches?.map((sentence) => sentence.trim()).filter(Boolean) ?? [normalized];
  }

  private injectCitationMarkers(text: string, indices: number[]): string {
    const unique = [...new Set(indices)].filter((index) => index > 0);
    if (unique.length === 0) {
      return text;
    }

    const markers = unique.map((index) => `[${index}]`).join('');
    if (/\[\d+\]\s*$/.test(text.trim())) {
      return text;
    }

    return text.replace(/([。！？.!?])$/, `${markers}$1`) === text
      ? `${text} ${markers}`.trim()
      : text.replace(/([。！？.!?])$/, `${markers}$1`);
  }

  private extractCitationKeywords(text: string): string[] {
    const normalized = this.normalizeCitationText(text);
    if (!normalized) {
      return [];
    }

    const latinTokens = normalized
      .split(/\s+/)
      .filter((token) => token.length >= 3);
    const cjkTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
    return [...new Set([...latinTokens, ...cjkTokens])];
  }

  private normalizeCitationText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractAuthorHint(author: string): string {
    const parts = author
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length >= 3);
    return (parts[parts.length - 1] ?? parts[0] ?? '').trim();
  }

  private generateReport(state: PipelineState): string {
    const fin = state.phases.finalization;
    const lit = state.phases.literature;
    const writing = state.phases.writing;

    const lines = [
      `# Pipeline Report: ${state.topic}`,
      ``,
      `**Started:** ${state.startedAt}`,
      `**Completed:** ${state.completedAt ?? 'In progress'}`,
      ``,
      `## Summary`,
      `- Papers collected: ${lit?.totalFound ?? 0}`,
      `- arXiv papers: ${lit?.arxivPapers.length ?? 0}`,
      `- Semantic Scholar papers: ${lit?.scholarPapers.length ?? 0}`,
      `- PubMed articles: ${lit?.pubmedCount ?? 0}`,
      `- Paper word count: ${writing?.wordCount ?? 0}`,
      `- Quality score: ${fin?.qualityScore ?? 'N/A'}/100`,
      ``,
    ];

    if (state.errors && state.errors.length > 0) {
      lines.push(`## Errors`);
      for (const err of state.errors) {
        lines.push(`- **Phase ${err.phase} (${err.phaseName})**: ${err.error} (${err.timestamp})`);
      }
      lines.push(``);
    }

    lines.push(`## Warnings`);
    if (fin?.warnings.length) {
      fin.warnings.forEach((w) => lines.push(`- ${w}`));
    } else {
      lines.push('None');
    }
    lines.push(``);

    lines.push(`## Citation Verification`);
    if (fin?.citationVerifications.length) {
      fin.citationVerifications.forEach((v) => lines.push(`- [${v.valid ? 'OK' : 'WARN'}] ${v.source} (${(v.confidence * 100).toFixed(0)}%): ${v.details}`));
    } else {
      lines.push('No citations verified');
    }

    return lines.join('\n');
  }
}
