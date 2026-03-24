import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { displayError, displaySuccess, displayResult, displayTable } from '../ui/display.js';

// Interface for paper results from @tzukwan/research
export interface PaperResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  url: string;
  pdfUrl?: string;
  categories?: string[];
  citationCount?: number;
}

export interface GeneratedPaper {
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

export interface ReviewResult {
  topic: string;
  papers: PaperResult[];
  synthesis: string;
  gaps: string[];
  outputPath?: string;
}

interface PaperCommandOptions {
  output?: string;
  topic?: string;
  limit?: number;
  format?: string;
  field?: string;
  type?: 'journal' | 'master' | 'phd';
  categories?: string[];
  resume?: string;
  checkpointInterval?: number;
}

type ResearchModule = {
  generatePaper: (opts: unknown) => Promise<GeneratedPaper>;
  analyzePaper: (id: string, outputDir?: string) => Promise<unknown>;
  reproducePaper: (id: string, outputDir?: string) => Promise<unknown>;
  monitorArxiv: (opts: unknown) => Promise<PaperResult[]>;
  generateReview: (topic: string, opts: unknown) => Promise<ReviewResult>;
};

/**
 * Load the research module dynamically, falling back to a stub if unavailable.
 */
async function loadResearch(): Promise<ResearchModule> {
  try {
    const research = await import('@tzukwan/research') as unknown as ResearchModule;
    return research;
  } catch {
    // Return stub when @tzukwan/research is not yet implemented
    const notAvailable = (name: string) => {
      throw new Error(`@tzukwan/research module not yet available (${name}). Please build the research package first.`);
    };
    return {
      generatePaper: async () => notAvailable('generatePaper'),
      analyzePaper: async () => notAvailable('analyzePaper'),
      reproducePaper: async () => notAvailable('reproducePaper'),
      monitorArxiv: async () => notAvailable('monitorArxiv'),
      generateReview: async () => notAvailable('generateReview'),
    };
  }
}

/**
 * Validate arXiv ID format (supports: 2301.00001, arXiv:2301.00001, etc.)
 */
function validateArxivId(id: string): { valid: boolean; normalized: string; error?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, normalized: '', error: 'Paper ID is required' };
  }

  // Remove 'arxiv:' or 'arXiv:' prefix if present
  const normalized = id.replace(/^arxiv:/i, '').trim();

  // arXiv ID patterns:
  // - Old format: hep-th/9901001 (category/YYnumber)
  // - New format: 2301.00001 (YYMM.number)
  const newFormatPattern = /^\d{4}\.\d{4,5}(v\d+)?$/;
  const oldFormatPattern = /^[a-z\-]+\/\d{7}$/;

  if (!newFormatPattern.test(normalized) && !oldFormatPattern.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: `Invalid arXiv ID format: "${id}". Expected format: 2301.00001 or arXiv:2301.00001`,
    };
  }

  return { valid: true, normalized };
}

/**
 * Sanitize output directory path to prevent directory traversal attacks.
 */
function sanitizeOutputPath(outputPath: string | undefined): string {
  if (!outputPath) {
    return './output';
  }

  // Remove null bytes
  let sanitized = outputPath.replace(/\0/g, '');

  // Prevent directory traversal by removing ../ and ./ patterns
  sanitized = sanitized.replace(/\.\.(\/|\\)/g, '');
  sanitized = sanitized.replace(/\.\/+/g, '');

  // Remove any shell special characters
  sanitized = sanitized.replace(/[<>&|;$`]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Reject absolute paths (Unix-style and Windows drive-letter paths)
  if (sanitized.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(sanitized)) {
    return './output';
  }

  // Ensure it's not empty after sanitization
  if (!sanitized) {
    return './output';
  }

  return sanitized;
}

/**
 * paper generate — invoke Paper Factory to generate a paper.
 *
 * Options:
 *   --resume [paperId]          Resume generation from a checkpoint. If a paperId is
 *                               supplied the factory resumes that specific draft; omitting
 *                               the value resumes the most-recent checkpoint.
 *   --checkpoint-interval <n>   Save a checkpoint every <n> minutes (default: 5).
 */
export async function paperGenerate(options: PaperCommandOptions = {}): Promise<void> {
  // When not resuming, a topic is required.
  if (!options.resume && (!options.topic || typeof options.topic !== 'string' || options.topic.trim().length === 0)) {
    displayError('Topic is required for paper generation. Example: tzukwan paper generate --topic "transformer attention mechanisms"');
    process.exitCode = 1;
    return;
  }

  const isResuming = options.resume !== undefined;
  const checkpointInterval = Math.max(1, options.checkpointInterval ?? 5);

  const spinner = ora({
    text: chalk.cyan(isResuming
      ? `Resuming paper generation${options.resume ? ` for ${chalk.bold(options.resume)}` : ' from latest checkpoint'}...`
      : 'Initializing Paper Factory...'),
    color: 'cyan',
  }).start();

  try {
    const research = await loadResearch();

    spinner.text = chalk.cyan(isResuming ? 'Restoring checkpoint...' : 'Generating paper outline...');

    const result = (await research.generatePaper({
      outputDir: sanitizeOutputPath(options.output),
      topic: options.topic?.trim(),
      field: options.field,
      type: options.type,
      resume: options.resume,
      checkpointInterval,
    })) as GeneratedPaper;

    spinner.succeed(chalk.green('Paper generated successfully!'));

    // Display formatted result
    console.log(
      '\n' +
        boxen(
          chalk.bold.white(result.title) + '\n\n' +
            chalk.gray('Abstract:\n') +
            chalk.white(result.abstract),
          {
            padding: 1,
            borderColor: 'cyan',
            borderStyle: 'round',
            title: '📄 Generated Paper',
            titleAlignment: 'center',
          }
        )
    );

    if (result.outputPath) {
      displaySuccess(`Paper saved to: ${result.outputPath}`);
    }
    if (result.strictValidationPath) {
      displaySuccess(`Strict validation: ${result.strictValidationPath}`);
    }
    if (result.evidenceManifestPath) {
      displaySuccess(`Evidence manifest: ${result.evidenceManifestPath}`);
    }
    if (typeof result.ready === 'boolean') {
      if (result.ready) {
        displaySuccess('Strict readiness: PASS');
      } else {
        displayError('Strict readiness: FAIL');
      }
    }
  } catch (err) {
    spinner.fail(chalk.red('Paper generation failed'));
    displayError(String(err));
    process.exitCode = 1;
    return;
  }
}

/**
 * paper analyze <id> — analyze an arXiv paper by ID.
 */
export async function paperAnalyze(id: string, options: PaperCommandOptions = {}): Promise<void> {
  const validation = validateArxivId(id);
  if (!validation.valid) {
    displayError(validation.error || 'Invalid arXiv ID');
    process.exitCode = 1;
    return;
  }

  const normalizedId = validation.normalized;

  const spinner = ora({
    text: chalk.cyan(`Fetching arXiv paper ${chalk.bold(normalizedId)}...`),
    color: 'cyan',
  }).start();

  try {
    const research = await loadResearch();

    spinner.text = chalk.cyan('Analyzing paper structure and content...');

    const result = (await research.analyzePaper(normalizedId, sanitizeOutputPath(options.output))) as {
      paper: PaperResult;
      analysis: string;
      keyContributions: string[];
      methodology: string;
      limitations: string[];
      outputPath?: string;
    };

    spinner.succeed(chalk.green('Analysis complete!'));

    // Display paper info
    console.log(
      '\n' +
        boxen(
          chalk.bold.white(result.paper.title) + '\n' +
            chalk.gray('Authors: ') +
            chalk.cyan((result.paper.authors ?? []).join(', ')) + '\n' +
            chalk.gray('Year: ') +
            chalk.white(result.paper.year) + '\n' +
            chalk.gray('URL: ') +
            chalk.underline.blue(result.paper.url),
          {
            padding: 1,
            borderColor: 'blue',
            borderStyle: 'round',
            title: `📑 arXiv:${normalizedId}`,
            titleAlignment: 'center',
          }
        )
    );

    // Display analysis
    displayResult('## Analysis\n\n' + result.analysis);

    if (result.keyContributions.length > 0) {
      displayResult('## Key Contributions\n\n' + result.keyContributions.map((k) => `- ${k}`).join('\n'));
    }

    if (result.limitations.length > 0) {
      displayResult('## Limitations\n\n' + result.limitations.map((l) => `- ${l}`).join('\n'));
    }

    if (result.outputPath) {
      displaySuccess(`Analysis saved to: ${result.outputPath}`);
    }
  } catch (err) {
    spinner.fail(chalk.red('Analysis failed'));
    displayError(String(err));
    process.exitCode = 1;
    return;
  }
}

/**
 * paper reproduce <id> — reproduce an arXiv paper.
 */
export async function paperReproduce(id: string, options: PaperCommandOptions = {}): Promise<void> {
  const validation = validateArxivId(id);
  if (!validation.valid) {
    displayError(validation.error || 'Invalid arXiv ID');
    process.exitCode = 1;
    return;
  }

  const normalizedId = validation.normalized;

  const spinner = ora({
    text: chalk.cyan(`Starting reproduction of arXiv:${chalk.bold(normalizedId)}...`),
    color: 'cyan',
  }).start();

  try {
    const research = await loadResearch();

    spinner.text = chalk.cyan('Fetching paper and extracting methodology...');

    const result = (await research.reproducePaper(normalizedId, sanitizeOutputPath(options.output))) as {
      paper: PaperResult;
      steps: string[];
      code: string;
      requirements: string[];
      outputPath?: string;
    };

    spinner.succeed(chalk.green('Reproduction plan ready!'));

    // Display reproduction steps
    console.log(
      '\n' +
        boxen(chalk.bold.white('Reproduction Plan: ') + chalk.cyan(result.paper.title), {
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          borderColor: 'yellow',
          borderStyle: 'round',
          title: '🔬 Paper Reproduction',
          titleAlignment: 'center',
        })
    );

    console.log('\n' + chalk.bold.white('Steps:'));
    result.steps.forEach((step, i) => {
      console.log(`  ${chalk.cyan(i + 1 + '.')} ${step}`);
    });

    if (result.requirements.length > 0) {
      console.log('\n' + chalk.bold.white('Requirements:'));
      result.requirements.forEach((req) => {
        console.log(`  ${chalk.gray('•')} ${chalk.white(req)}`);
      });
    }

    if (result.code) {
      console.log('\n' + chalk.bold.white('Generated Code:'));
      displayResult('```python\n' + result.code + '\n```');
    }

    if (result.outputPath) {
      displaySuccess(`Reproduction package saved to: ${result.outputPath}`);
    }
  } catch (err) {
    spinner.fail(chalk.red('Reproduction failed'));
    displayError(String(err));
    process.exitCode = 1;
    return;
  }
}

/**
 * paper monitor — monitor arXiv for new papers.
 */
export async function paperMonitor(options: PaperCommandOptions = {}): Promise<void> {
  const spinner = ora({
    text: chalk.cyan('Starting arXiv monitor...'),
    color: 'cyan',
  }).start();

  try {
    const research = await loadResearch();

    // Validate limit parameter
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);

    const results = (await research.monitorArxiv({
      limit: limit,
      categories: options.categories,
      outputDir: sanitizeOutputPath(options.output),
    })) as PaperResult[];

    spinner.succeed(chalk.green(`Found ${results.length} new paper${results.length === 1 ? '' : 's'}`));

    if (results.length === 0) {
      console.log('\n' + chalk.gray('No new papers found in the specified categories.'));
      return;
    }

    console.log('\n' + chalk.bold.cyan('📡 Latest arXiv Papers') + '\n');

    results.forEach((paper, i) => {
      console.log(
        chalk.bold.white(`${i + 1}. `) +
          chalk.bold.white(paper.title)
      );
      const paperAuthors = paper.authors ?? [];
      console.log(
        chalk.gray('   Authors: ') +
          chalk.cyan(paperAuthors.slice(0, 3).join(', ') + (paperAuthors.length > 3 ? ' et al.' : ''))
      );
      console.log(chalk.gray('   ID: ') + chalk.white(paper.id) + chalk.gray('  Year: ') + chalk.white(paper.year));
      if (paper.abstract) {
        const excerpt = paper.abstract.slice(0, 120) + (paper.abstract.length > 120 ? '...' : '');
        console.log(chalk.gray('   ' + excerpt));
      }
      console.log();
    });
  } catch (err) {
    spinner.fail(chalk.red('Monitor failed'));
    displayError(String(err));
    process.exitCode = 1;
    return;
  }
}

/**
 * paper review <topic> — generate a literature review.
 */
export async function paperReview(topic: string, options: PaperCommandOptions = {}): Promise<void> {
  // Validate topic is provided and not empty
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    displayError('Topic is required. Example: tzukwan paper review "transformer attention mechanisms"');
    process.exitCode = 1;
    return;
  }

  const spinner = ora({
    text: chalk.cyan(`Searching literature on: ${chalk.bold(topic)}`),
    color: 'cyan',
  }).start();

  try {
    const research = await loadResearch();

    spinner.text = chalk.cyan('Gathering and synthesizing papers...');

    const result = (await research.generateReview(topic.trim(), {
      limit: Math.min(Math.max(1, options.limit ?? 30), 100),
      outputDir: sanitizeOutputPath(options.output),
    })) as ReviewResult;

    spinner.succeed(chalk.green(`Literature review complete! ${result.papers.length} paper${result.papers.length === 1 ? '' : 's'} analyzed.`));

    console.log(
      '\n' +
        boxen(chalk.bold.white('Literature Review: ') + chalk.cyan(topic), {
          padding: 1,
          borderColor: 'magenta',
          borderStyle: 'round',
          title: '📚 Literature Review',
          titleAlignment: 'center',
        })
    );

    displayResult(result.synthesis);

    if (result.gaps.length > 0) {
      displayResult('## Research Gaps\n\n' + result.gaps.map((g) => `- ${g}`).join('\n'));
    }

    // Show paper table
    if (result.papers.length > 0) {
      console.log('\n' + chalk.bold.cyan('Referenced Papers:'));
      displayTable(
        ['#', 'Title', 'Year', 'Authors'],
        result.papers.slice(0, 20).map((p, i) => [
          String(i + 1),
          p.title.slice(0, 45) + (p.title.length > 45 ? '...' : ''),
          String(p.year),
          ((p.authors ?? [])[0] ?? '') + ((p.authors ?? []).length > 1 ? ' et al.' : ''),
        ])
      );
    }

    if (result.outputPath) {
      displaySuccess(`Review saved to: ${result.outputPath}`);
    }
  } catch (err) {
    spinner.fail(chalk.red('Review generation failed'));
    displayError(String(err));
    process.exitCode = 1;
    return;
  }
}

/**
 * paper compile <tex-file> — compile LaTeX file to PDF using system TeX Live.
 *
 * Options:
 *   --engine <xelatex|pdflatex|lualatex>  LaTeX engine to use (default: xelatex)
 *   --output <dir>                        Output directory (default: same as input)
 *   --times <n>                           Compile times for cross-references (default: 2)
 *   --bibtex                              Enable bibtex/biber for bibliography
 */
export async function paperCompile(texFile: string, options: PaperCommandOptions & { engine?: string; times?: number; bibtex?: boolean } = {}): Promise<void> {
  if (!texFile || typeof texFile !== 'string') {
    displayError('LaTeX file path is required. Example: tzukwan paper compile thesis.tex');
    process.exitCode = 1;
    return;
  }

  const spinner = ora({
    text: chalk.cyan(`Initializing LaTeX compiler...`),
    color: 'cyan',
  }).start();

  try {
    // Dynamic import to avoid load-time dependency on @tzukwan/research
    const { LaTeXCompiler } = await import('@tzukwan/research');
    const compiler = new LaTeXCompiler();

    // Detect engine
    spinner.text = chalk.cyan('Detecting LaTeX installation...');
    const engine = (options.engine as 'xelatex' | 'pdflatex' | 'lualatex') || 'xelatex';
    const enginePath = await compiler.detectEngine(engine);

    if (!enginePath) {
      spinner.fail(chalk.red('LaTeX engine not found'));
      console.log(chalk.yellow('\nPlease install TeX Live:'));
      console.log(chalk.gray('  Windows: https://tug.org/texlive/windows.html'));
      console.log(chalk.gray('  macOS:   brew install --cask mactex'));
      console.log(chalk.gray('  Linux:   sudo apt-get install texlive-full'));
      process.exitCode = 1;
      return;
    }

    spinner.text = chalk.cyan(`Compiling with ${engine}...`);

    const result = await compiler.compile({
      inputFile: texFile,
      outputDir: options.output,
      engine,
      compileTimes: Math.max(1, options.times ?? 2),
      useBibtex: options.bibtex ?? false,
    });

    if (result.success && result.pdfPath) {
      spinner.succeed(chalk.green('PDF compiled successfully!'));

      console.log(
        '\n' +
          boxen(
            chalk.bold.white('Compilation Summary') + '\n\n' +
              `${chalk.gray('Input:')}  ${chalk.white(texFile)}\n` +
              `${chalk.gray('Output:')} ${chalk.green(result.pdfPath)}\n` +
              `${chalk.gray('Time:')}   ${chalk.white((result.compileTime / 1000).toFixed(2))}s`,
            {
              padding: 1,
              borderColor: 'green',
              borderStyle: 'round',
              title: '📄 LaTeX Compilation',
              titleAlignment: 'center',
            }
          )
      );

      if (result.warnings.length > 0) {
        console.log('\n' + chalk.yellow('Warnings:'));
        result.warnings.slice(0, 5).forEach((w) => console.log(chalk.gray(`  • ${w}`)));
      }

      displaySuccess(`PDF saved to: ${result.pdfPath}`);
    } else {
      spinner.fail(chalk.red('Compilation failed'));

      if (result.errors.length > 0) {
        console.log('\n' + chalk.red('Errors:'));
        result.errors.slice(0, 10).forEach((e) => console.log(chalk.red(`  • ${e}`)));
      }

      process.exitCode = 1;
    }
  } catch (err) {
    spinner.fail(chalk.red('Compilation failed'));
    displayError(String(err));
    process.exitCode = 1;
  }
}
