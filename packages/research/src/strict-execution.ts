import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import axios from 'axios';

export type ChecklistStatus = 'passed' | 'failed' | 'warning';

export interface StrictChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
}

export interface DatasetEvidenceRecord {
  topic: string;
  field: string;
  manifestPath: string;
  evidencePath?: string;
  datasetCount: number;
  generatedAt: string;
}

export interface DatasetReachabilityRecord {
  name: string;
  url: string;
  source?: string;
  checkedAt: string;
  status: 'passed' | 'failed' | 'skipped';
  httpStatus?: number;
  detail: string;
}

export interface ExperimentExecutionRun {
  id: string;
  name: string;
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  exitCode?: number;
  stdoutPath?: string;
  stderrPath?: string;
  detail: string;
}

export interface WorkspaceEvidenceInput {
  workspaceDir: string;
  title: string;
  markdownPath: string;
  docxPath: string;
  bibliographyPath: string;
  citationsJsonPath?: string;
  rawDataDir: string;
  sourceCodeDir: string;
  figures: Array<{ id: string; svgPath: string; tifPath: string; pngPath: string }>;
  formulaDir?: string;
  formulaCount?: number;
  markdown: string;
  bibliography: string[];
  citationRecords?: unknown[];
  datasetEvidence?: DatasetEvidenceRecord[];
  datasetReachability?: DatasetReachabilityRecord[];
  executionRuns?: ExperimentExecutionRun[];
}

export interface WorkspaceEvidenceManifest {
  version: string;
  generatedAt: string;
  workspaceDir: string;
  title: string;
  summary: {
    ready: boolean;
    passed: number;
    failed: number;
    warnings: number;
  };
  outputs: {
    markdownPath: string;
    docxPath: string;
    bibliographyPath: string;
    citationsJsonPath?: string;
    figureCount: number;
    formulaCount: number;
  };
  data: {
    rawDataDir: string;
    sourceCodeDir: string;
    sourceCodeFiles: string[];
    datasetEvidence: DatasetEvidenceRecord[];
    datasetReachability: DatasetReachabilityRecord[];
  };
  execution: {
    runs: ExperimentExecutionRun[];
  };
  checklist: StrictChecklistItem[];
}

function hasFile(filePath: string | undefined): boolean {
  return !!filePath && fs.existsSync(filePath);
}

function hasThinkBlocks(content: string): boolean {
  return /<think(\s[^>]*)?>[\s\S]*?<\/think>/i.test(content)
    || /<thinking(\s[^>]*)?>[\s\S]*?<\/thinking>/i.test(content)
    || /<reasoning(\s[^>]*)?>[\s\S]*?<\/reasoning>/i.test(content);
}

function listSourceCodeFiles(sourceCodeDir: string): string[] {
  if (!fs.existsSync(sourceCodeDir)) return [];
  return fs.readdirSync(sourceCodeDir)
    .filter((entry) => fs.statSync(path.join(sourceCodeDir, entry)).isFile())
    .sort();
}

function listPythonFilesRecursive(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const files: string[] = [];
  const visit = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, entry);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.endsWith('.py')) {
        files.push(fullPath);
      }
    }
  };
  visit(rootDir);
  return files.sort();
}

export function buildWorkspaceEvidenceManifest(input: WorkspaceEvidenceInput): WorkspaceEvidenceManifest {
  const sourceCodeFiles = listSourceCodeFiles(input.sourceCodeDir);
  const checklist: StrictChecklistItem[] = [];

  const push = (id: string, label: string, status: ChecklistStatus, detail: string): void => {
    checklist.push({ id, label, status, detail });
  };

  push(
    'exports-markdown-docx',
    'Markdown and DOCX exports exist',
    hasFile(input.markdownPath) && hasFile(input.docxPath) ? 'passed' : 'failed',
    `${hasFile(input.markdownPath) ? 'markdown ok' : 'markdown missing'}; ${hasFile(input.docxPath) ? 'docx ok' : 'docx missing'}`,
  );

  push(
    'citations-bibliography',
    'Bibliography exists and is non-empty',
    hasFile(input.bibliographyPath) && input.bibliography.length > 0 ? 'passed' : 'failed',
    `bibliography entries: ${input.bibliography.length}`,
  );

  push(
    'no-thinking-blocks',
    'Final markdown contains no hidden reasoning blocks',
    hasThinkBlocks(input.markdown) ? 'failed' : 'passed',
    hasThinkBlocks(input.markdown) ? 'Detected <think>/<reasoning> blocks in final markdown' : 'No hidden reasoning blocks detected',
  );

  push(
    'figures-exported',
    'Figure assets exported as SVG/TIF/PNG',
    input.figures.length > 0 && input.figures.every((figure) => hasFile(figure.svgPath) && hasFile(figure.tifPath) && hasFile(figure.pngPath))
      ? 'passed'
      : input.figures.length > 0
        ? 'failed'
        : 'warning',
    `figures: ${input.figures.length}`,
  );

  push(
    'source-code-present',
    'Source code artifacts are preserved',
    sourceCodeFiles.length > 0 ? 'passed' : 'warning',
    `source files: ${sourceCodeFiles.length}`,
  );

  push(
    'raw-data-present',
    'Raw data artifacts are preserved',
    hasFile(path.join(input.rawDataDir, 'research-artifacts.json')) ? 'passed' : 'warning',
    hasFile(path.join(input.rawDataDir, 'research-artifacts.json')) ? 'research-artifacts.json present' : 'No research-artifacts.json found',
  );

  push(
    'dataset-evidence',
    'Dataset collection evidence is recorded',
    input.datasetEvidence && input.datasetEvidence.length > 0 ? 'passed' : 'warning',
    `dataset evidence entries: ${input.datasetEvidence?.length ?? 0}`,
  );

  const reachability = input.datasetReachability ?? [];
  const reachableCount = reachability.filter((record) => record.status === 'passed').length;
  push(
    'dataset-reachability',
    'Selected dataset sources were probed for real network reachability',
    reachability.length === 0
      ? 'warning'
      : reachableCount > 0
        ? 'passed'
        : 'failed',
    `reachable datasets: ${reachableCount}/${reachability.length}`,
  );

  const executionRuns = input.executionRuns ?? [];
  const passedExecutionRuns = executionRuns.filter((run) => run.status === 'passed').length;
  push(
    'execution-evidence',
    'At least one experiment/code execution evidence record passed',
    passedExecutionRuns > 0 ? 'passed' : executionRuns.length > 0 ? 'failed' : 'warning',
    `execution runs: ${executionRuns.length}, passed: ${passedExecutionRuns}`,
  );

  push(
    'citation-records',
    'Verified citation records are present',
    (input.citationRecords?.length ?? 0) > 0 && hasFile(input.citationsJsonPath) ? 'passed' : 'warning',
    `citation records: ${input.citationRecords?.length ?? 0}`,
  );

  const failed = checklist.filter((item) => item.status === 'failed').length;
  const warnings = checklist.filter((item) => item.status === 'warning').length;
  const passed = checklist.filter((item) => item.status === 'passed').length;
  const requiredPassedIds = new Set([
    'exports-markdown-docx',
    'citations-bibliography',
    'no-thinking-blocks',
    'source-code-present',
    'execution-evidence',
  ]);
  const requiredPassed = checklist
    .filter((item) => requiredPassedIds.has(item.id))
    .every((item) => item.status === 'passed');

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    workspaceDir: input.workspaceDir,
    title: input.title,
    summary: {
      ready: failed === 0 && requiredPassed,
      passed,
      failed,
      warnings,
    },
    outputs: {
      markdownPath: input.markdownPath,
      docxPath: input.docxPath,
      bibliographyPath: input.bibliographyPath,
      citationsJsonPath: input.citationsJsonPath,
      figureCount: input.figures.length,
      formulaCount: input.formulaCount ?? 0,
    },
    data: {
      rawDataDir: input.rawDataDir,
      sourceCodeDir: input.sourceCodeDir,
      sourceCodeFiles,
      datasetEvidence: input.datasetEvidence ?? [],
      datasetReachability: input.datasetReachability ?? [],
    },
    execution: {
      runs: executionRuns,
    },
    checklist,
  };
}

export function writeWorkspaceEvidenceManifest(
  input: WorkspaceEvidenceInput,
): { evidenceManifestPath: string; validationReportPath: string; manifest: WorkspaceEvidenceManifest } {
  const manifest = buildWorkspaceEvidenceManifest(input);
  const evidenceManifestPath = path.join(input.workspaceDir, 'evidence-manifest.json');
  const validationReportPath = path.join(input.workspaceDir, 'strict-validation.json');
  fs.writeFileSync(evidenceManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  fs.writeFileSync(validationReportPath, JSON.stringify({
    ready: manifest.summary.ready,
    checklist: manifest.checklist,
    summary: manifest.summary,
  }, null, 2), 'utf-8');
  return { evidenceManifestPath, validationReportPath, manifest };
}

export function runSourceCodeValidation(
  sourceCodeDir: string,
  outputDir: string,
): ExperimentExecutionRun[] {
  const resolvedSourceCodeDir = path.resolve(sourceCodeDir);
  const resolvedOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedSourceCodeDir)) {
    return [];
  }

  const pythonFiles = listPythonFilesRecursive(resolvedSourceCodeDir);

  if (pythonFiles.length === 0) {
    return [];
  }

  const startedAt = new Date().toISOString();
  const result = spawnSync('python', ['-m', 'py_compile', ...pythonFiles], {
    cwd: resolvedSourceCodeDir,
    encoding: 'utf-8',
    timeout: 120000,
  });
  const finishedAt = new Date().toISOString();
  const stdoutPath = path.join(resolvedOutputDir, 'source-validation.stdout.txt');
  const stderrPath = path.join(resolvedOutputDir, 'source-validation.stderr.txt');
  fs.writeFileSync(stdoutPath, result.stdout ?? '', 'utf-8');
  fs.writeFileSync(stderrPath, result.stderr ?? '', 'utf-8');

  return [{
    id: `run_${Date.now()}_py_compile`,
    name: 'Python syntax validation',
    command: `python -m py_compile ${pythonFiles.map((file) => path.basename(file)).join(' ')}`,
    status: result.error ? 'skipped' : result.status === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt,
    exitCode: result.status ?? undefined,
    stdoutPath,
    stderrPath,
    detail: result.error
      ? `Python validation skipped: ${result.error.message}`
      : result.status === 0
      ? `Validated ${pythonFiles.length} Python file(s)`
      : (result.stderr || result.stdout || 'Python validation failed').trim(),
  }];
}

function runCommandEvidence(params: {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  outputDir: string;
  idSuffix: string;
  timeout?: number;
}): ExperimentExecutionRun {
  const startedAt = new Date().toISOString();
  const result = spawnSync(params.command, params.args, {
    cwd: params.cwd,
    encoding: 'utf-8',
    timeout: params.timeout ?? 120000,
  });
  const finishedAt = new Date().toISOString();
  const stdoutPath = path.join(params.outputDir, `${params.idSuffix}.stdout.txt`);
  const stderrPath = path.join(params.outputDir, `${params.idSuffix}.stderr.txt`);
  fs.writeFileSync(stdoutPath, result.stdout ?? '', 'utf-8');
  fs.writeFileSync(stderrPath, result.stderr ?? '', 'utf-8');

  return {
    id: `run_${Date.now()}_${params.idSuffix}`,
    name: params.name,
    command: [params.command, ...params.args].join(' '),
    status: result.error ? 'skipped' : result.status === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt,
    exitCode: result.status ?? undefined,
    stdoutPath,
    stderrPath,
    detail: result.error
      ? `${params.name} skipped: ${result.error.message}`
      : result.status === 0
        ? `${params.name} completed successfully`
        : (result.stderr || result.stdout || `${params.name} failed`).trim(),
  };
}

export function runReproductionProjectValidation(
  projectDir: string,
  outputDir: string,
): ExperimentExecutionRun[] {
  const resolvedProjectDir = path.resolve(projectDir);
  const resolvedOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedProjectDir)) {
    return [];
  }

  const runs: ExperimentExecutionRun[] = [];
  const srcDir = path.join(resolvedProjectDir, 'src');
  if (fs.existsSync(srcDir)) {
    runs.push(...runSourceCodeValidation(srcDir, resolvedOutputDir));
  }

  const trainScript = path.join(srcDir, 'train.py');
  if (fs.existsSync(trainScript)) {
    runs.push(runCommandEvidence({
      name: 'Training entrypoint help check',
      command: 'python',
      args: ['src/train.py', '--help'],
      cwd: resolvedProjectDir,
      outputDir: resolvedOutputDir,
      idSuffix: 'train-help',
      timeout: 60000,
    }));
  }

  const evalScript = path.join(srcDir, 'evaluate.py');
  if (fs.existsSync(evalScript)) {
    runs.push(runCommandEvidence({
      name: 'Evaluation entrypoint help check',
      command: 'python',
      args: ['src/evaluate.py', '--help'],
      cwd: resolvedProjectDir,
      outputDir: resolvedOutputDir,
      idSuffix: 'evaluate-help',
      timeout: 60000,
    }));
  }

  return runs;
}

export async function checkDatasetReachability(
  datasets: Array<{ name: string; url: string; source?: string }>,
  outputDir: string,
): Promise<{ records: DatasetReachabilityRecord[]; reportPath: string }> {
  const limit = 4;
  const worker = async (dataset: { name: string; url: string; source?: string }): Promise<DatasetReachabilityRecord> => {
    const checkedAt = new Date().toISOString();
    try {
      const response = await axios.get(dataset.url, {
        maxRedirects: 5,
        timeout: 5000,
        responseType: 'stream',
        validateStatus: () => true,
        headers: {
          Range: 'bytes=0-0',
          'User-Agent': 'tzukwan-cli/1.0 (research validation)',
        },
      });
      const status = response.status >= 200 && response.status < 400 ? 'passed' : 'failed';
      response.data?.destroy?.();
      return {
        name: dataset.name,
        url: dataset.url,
        source: dataset.source,
        checkedAt,
        status,
        httpStatus: response.status,
        detail: status === 'passed'
          ? `HTTP ${response.status}`
          : `Dataset endpoint returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        name: dataset.name,
        url: dataset.url,
        source: dataset.source,
        checkedAt,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const records: DatasetReachabilityRecord[] = [];
  for (let index = 0; index < datasets.length; index += limit) {
    const batch = datasets.slice(index, index + limit);
    const batchRecords = await Promise.all(batch.map((dataset) => worker(dataset)));
    records.push(...batchRecords);
  }

  const reportPath = path.join(outputDir, 'dataset-reachability.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: records.length,
    passed: records.filter((record) => record.status === 'passed').length,
    failed: records.filter((record) => record.status === 'failed').length,
    records,
  }, null, 2), 'utf-8');

  return { records, reportPath };
}
