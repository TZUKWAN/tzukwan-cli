import * as fs from 'fs';
import * as path from 'path';
import type { ImageRun as DocxImageRun, Paragraph as DocxParagraph, TextRun as DocxTextRun } from 'docx';
import sharp from 'sharp';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import type { DatasetEvidenceRecord, DatasetReachabilityRecord, ExperimentExecutionRun, WorkspaceEvidenceManifest } from './strict-execution.js';
import { writeWorkspaceEvidenceManifest } from './strict-execution.js';

export interface FigureSpec {
  id: string;
  title: string;
  caption: string;
  labels: string[];
}

export interface SourceCodeArtifact {
  filename: string;
  content: string;
}

export interface WorkspaceExportInput {
  workspaceDir: string;
  title: string;
  markdown: string;
  bibliography: string[];
  citationRecords?: unknown[];
  rawData?: Record<string, unknown>;
  sourceCode?: SourceCodeArtifact[];
  metadata?: Record<string, unknown>;
  figures?: FigureSpec[];
  datasetEvidence?: DatasetEvidenceRecord[];
  datasetReachability?: DatasetReachabilityRecord[];
  executionRuns?: ExperimentExecutionRun[];
}

export interface ExportedFigure {
  id: string;
  title: string;
  caption: string;
  svgPath: string;
  tifPath: string;
  pngPath: string;
}

export interface WorkspaceExportResult {
  markdownPath: string;
  docxPath: string;
  bibliographyPath: string;
  citationsJsonPath?: string;
  manifestPath: string;
  rawDataDir: string;
  sourceCodeDir: string;
  formulaDir?: string;
  formulaCount?: number;
  figures: ExportedFigure[];
  evidenceManifestPath: string;
  strictValidationPath: string;
  evidenceManifest: WorkspaceEvidenceManifest;
}

interface MarkdownSection {
  heading: string;
  body: string;
}

interface FigurePalette {
  primary: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  border: string;
  text: string;
  muted: string;
  grid: string;
}

interface WrappedLabel {
  text: string;
  lines: string[];
  height: number;
}

interface RenderedFormulaAsset {
  key: string;
  tex: string;
  display: boolean;
  svgPath: string;
  tifPath: string;
  pngPath: string;
  width: number;
  height: number;
}

type DocChild = DocxTextRun | DocxImageRun;
type BlockKind = 'paragraph' | 'bullet' | 'heading1' | 'heading2' | 'heading3' | 'code' | 'formula';

interface MarkdownBlock {
  kind: BlockKind;
  text: string;
}

const DOC_TEXT_SIZE = 24;
const DOC_HEADING_1_SIZE = 30;
const DOC_HEADING_2_SIZE = 28;
const DOC_HEADING_3_SIZE = 26;
const DOC_TITLE_SIZE = 40;
const DOC_FONT = 'SimSun';

let docxModulePromise: Promise<typeof import('docx')> | null = null;

async function getDocxModule(): Promise<typeof import('docx')> {
  docxModulePromise ??= (async () => {
    const originalEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
      const message = typeof warning === 'string' ? warning : warning?.message;
      if (message?.includes('--localstorage-file')) return;
      return originalEmitWarning(warning as never, ...(args as never[]));
    }) as typeof process.emitWarning;
    try {
      return await import('docx');
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  })();
  return docxModulePromise;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' });
const mathDocument = mathjax.document('', {
  InputJax: texInput,
  OutputJax: svgOutput,
});

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dir}: ${String(error)}`);
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ');
}

function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = markdown.replace(/\r/g, '').split('\n');
  let currentHeading = '';
  let currentBody: string[] = [];

  const flush = (): void => {
    if (!currentHeading) return;
    sections.push({
      heading: stripMarkdown(currentHeading),
      body: currentBody.join('\n').trim(),
    });
    currentHeading = '';
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentHeading = line.slice(3).trim();
      continue;
    }
    if (currentHeading) {
      currentBody.push(line);
    }
  }

  flush();
  return sections;
}

function deriveDefaultFigures(input: WorkspaceExportInput): FigureSpec[] {
  const sections = parseMarkdownSections(input.markdown);
  const workflowLabels = sections.slice(0, 5).map((section) => section.heading).filter(Boolean);
  const referenceLabels = input.bibliography
    .slice(0, 4)
    .map((entry, index) => `[${index + 1}] ${stripMarkdown(entry).slice(0, 42)}`);

  return [
    {
      id: 'figure_01_workflow',
      title: 'Research Workflow Framework',
      caption: 'End-to-end workflow derived from the current manuscript structure and analysis sequence.',
      labels: workflowLabels.length > 0
        ? workflowLabels
        : ['Abstract', 'Introduction', 'Methodology', 'Results', 'Conclusion'],
    },
    {
      id: 'figure_02_evidence_map',
      title: 'Evidence and Artifact Framework',
      caption: 'Verified citations, preserved raw data, reproducible code, and export deliverables in the workspace.',
      labels: referenceLabels.length > 0
        ? referenceLabels
        : ['Verified citations', 'Raw data preserved', 'Source code archived', 'DOCX / SVG / TIFF exported'],
    },
  ];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function visualWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (!char || code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
    return 0;
  }
  return code > 0xff ? 2 : 1;
}

function wrapSvgText(text: string, maxUnits: number): string[] {
  const normalized = stripMarkdown(text).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [''];
  }

  const tokens = normalized.includes(' ')
    ? normalized.split(/(\s+)/).filter(Boolean)
    : Array.from(normalized);

  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const token of tokens) {
    const tokenWidth = Array.from(token).reduce((sum, char) => sum + visualWidth(char), 0);
    if (current && currentWidth + tokenWidth > maxUnits) {
      lines.push(current.trim());
      current = token.trimStart();
      currentWidth = Array.from(current).reduce((sum, char) => sum + visualWidth(char), 0);
      continue;
    }
    current += token;
    currentWidth += tokenWidth;
  }

  if (current.trim()) {
    lines.push(current.trim());
  }

  return lines.length > 0 ? lines : [normalized];
}

function chooseFigurePalette(spec: FigureSpec): FigurePalette {
  if (/evidence|artifact|reference/i.test(spec.id) || /evidence|artifact/i.test(spec.title)) {
    return {
      primary: '#0f3b57',
      secondary: '#1f6f8b',
      accent: '#b45309',
      accentSoft: '#fef3c7',
      border: '#0f3b57',
      text: '#0f172a',
      muted: '#475569',
      grid: '#dbe7f0',
    };
  }

  return {
    primary: '#12335b',
    secondary: '#1d5d8c',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    border: '#102a43',
    text: '#0f172a',
    muted: '#475569',
    grid: '#d7e3f0',
  };
}

function buildWrappedLabels(labels: string[]): WrappedLabel[] {
  return labels.slice(0, 6).map((label) => {
    const lines = wrapSvgText(label, 34);
    const lineHeight = 48;
    const padding = 58;
    const height = Math.max(132, lines.length * lineHeight + padding);
    return { text: label, lines, height };
  });
}

function buildAcademicFigureSvg(spec: FigureSpec): string {
  const palette = chooseFigurePalette(spec);
  const wrappedLabels = buildWrappedLabels(spec.labels);
  const width = 1800;
  const laneX = 180;
  const laneWidth = 1440;
  const titleY = 96;
  const captionY = 144;
  const startY = 238;
  const gap = 44;
  const tagText = /evidence|artifact/i.test(spec.id) ? 'Evidence Map' : 'Workflow Diagram';
  let cursorY = startY;
  const cards: string[] = [];

  for (let index = 0; index < wrappedLabels.length; index += 1) {
    const wrapped = wrappedLabels[index]!;
    const nodeY = cursorY;
    const circleCx = laneX + 88;
    const circleCy = nodeY + wrapped.height / 2;
    const textX = laneX + 172;
    const lineElements = wrapped.lines.map((line, lineIndex) => {
      const baselineY = nodeY + 52 + lineIndex * 44;
      return `<text x="${textX}" y="${baselineY}" font-family="SimSun, 'Songti SC', serif" font-size="38" font-weight="700" fill="${palette.text}">${escapeXml(line)}</text>`;
    }).join('\n');

    const arrow = index < wrappedLabels.length - 1
      ? `
      <path d="M900 ${nodeY + wrapped.height + 12} L900 ${nodeY + wrapped.height + gap - 10}" stroke="${palette.secondary}" stroke-width="7" stroke-linecap="round" marker-end="url(#arrow)" />
      `
      : '';

    cards.push(`
      <g filter="url(#shadow)">
        <rect x="${laneX}" y="${nodeY}" rx="34" ry="34" width="${laneWidth}" height="${wrapped.height}" fill="#ffffff" stroke="${palette.border}" stroke-width="3"/>
        <rect x="${laneX}" y="${nodeY}" rx="34" ry="34" width="22" height="${wrapped.height}" fill="${palette.accent}"/>
        <circle cx="${circleCx}" cy="${circleCy}" r="38" fill="${palette.primary}" />
        <text x="${circleCx}" y="${circleCy + 14}" text-anchor="middle" font-family="SimSun, 'Songti SC', serif" font-size="34" font-weight="700" fill="#ffffff">${index + 1}</text>
        ${lineElements}
      </g>
      ${arrow}
    `);

    cursorY += wrapped.height + gap;
  }

  const footerY = cursorY + 52;
  const height = Math.max(1100, footerY + 88);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
    <linearGradient id="headerBand" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.primary}" />
      <stop offset="100%" stop-color="${palette.secondary}" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.12" />
    </filter>
    <marker id="arrow" markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto">
      <path d="M0,0 L16,8 L0,16 z" fill="${palette.secondary}" />
    </marker>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${palette.grid}" stroke-width="1" />
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.32" />
  <rect x="0" y="0" width="${width}" height="22" fill="url(#headerBand)" />
  <rect x="1410" y="48" rx="24" ry="24" width="248" height="54" fill="${palette.accentSoft}" stroke="${palette.accent}" stroke-width="2"/>
  <text x="1534" y="84" text-anchor="middle" font-family="SimSun, 'Songti SC', serif" font-size="26" font-weight="700" fill="${palette.accent}">${escapeXml(tagText)}</text>
  <text x="900" y="${titleY}" text-anchor="middle" font-family="SimSun, 'Songti SC', serif" font-size="56" font-weight="700" fill="${palette.primary}">${escapeXml(spec.title)}</text>
  <text x="900" y="${captionY}" text-anchor="middle" font-family="SimSun, 'Songti SC', serif" font-size="28" fill="${palette.muted}">${escapeXml(spec.caption)}</text>
  <rect x="${laneX - 28}" y="${startY - 28}" rx="42" ry="42" width="${laneWidth + 56}" height="${footerY - startY + 36}" fill="#ffffff" fill-opacity="0.84" stroke="${palette.grid}" stroke-width="2"/>
  ${cards.join('\n')}
  <text x="${laneX}" y="${footerY}" font-family="SimSun, 'Songti SC', serif" font-size="24" fill="${palette.muted}">SVG academic figure exported by Tzukwan</text>
</svg>`;
}

function wrapSvgWithBackground(svgMarkup: string): string {
  if (!/<svg[\s\S]*<\/svg>/i.test(svgMarkup)) {
    return svgMarkup;
  }

  return svgMarkup.replace(/<svg([^>]*)>/i, '<svg$1><rect width="100%" height="100%" fill="#ffffff"/>');
}

function buildFormulaFallbackSvg(tex: string, display: boolean): string {
  const width = display ? 1200 : 640;
  const height = display ? 180 : 74;
  const fontSize = display ? 40 : 28;
  const maxUnits = display ? 64 : 38;
  const lines = wrapSvgText(tex, maxUnits);
  const lineHeight = display ? 46 : 34;
  const realHeight = Math.max(height, lines.length * lineHeight + 56);

  const text = lines.map((line, index) => {
    const y = 44 + index * lineHeight;
    return `<text x="28" y="${y}" font-family="SimSun, 'Songti SC', serif" font-size="${fontSize}" fill="#0f172a">${escapeXml(line)}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${realHeight}" viewBox="0 0 ${width} ${realHeight}">
  <rect width="${width}" height="${realHeight}" fill="#ffffff" />
  ${text}
</svg>`;
}

function texToSvg(tex: string, display: boolean): string {
  // Input validation to prevent ReDoS
  if (tex.length > 10000) {
    console.warn('[texToSvg] TeX input too long, using fallback');
    return buildFormulaFallbackSvg(tex.slice(0, 1000) + '...', display);
  }
  try {
    const converted = mathDocument.convert(tex, {
      display,
      em: 18,
      ex: 9,
      containerWidth: 1280,
    }) as unknown;
    const markup = adaptor.outerHTML(converted as any);
    const svgMatch = markup.match(/<svg[\s\S]*<\/svg>/i);
    if (!svgMatch) {
      throw new Error('No SVG element returned by MathJax');
    }
    return wrapSvgWithBackground(svgMatch[0].replace(/currentColor/g, '#0f172a'));
  } catch {
    return buildFormulaFallbackSvg(tex, display);
  }
}

class FormulaAssetManager {
  private readonly cache = new Map<string, RenderedFormulaAsset>();
  private counter = 0;

  constructor(private readonly formulasDir: string) {
    ensureDir(formulasDir);
  }

  async render(tex: string, display: boolean): Promise<RenderedFormulaAsset> {
    const normalized = tex.trim();
    const key = `${display ? 'block' : 'inline'}::${normalized}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    this.counter += 1;
    const baseName = `formula_${String(this.counter).padStart(3, '0')}`;
    const svgPath = path.join(this.formulasDir, `${baseName}.svg`);
    const tifPath = path.join(this.formulasDir, `${baseName}.tif`);
    const pngPath = path.join(this.formulasDir, `${baseName}.png`);

    const svgMarkup = texToSvg(normalized, display);
    const svgBuffer = Buffer.from(svgMarkup, 'utf-8');
    fs.writeFileSync(svgPath, svgBuffer);

    await sharp(svgBuffer).png({ compressionLevel: 9 }).toFile(pngPath);
    await sharp(svgBuffer).tiff({ compression: 'lzw' }).toFile(tifPath);

    const metadata = await sharp(svgBuffer).metadata();
    const asset: RenderedFormulaAsset = {
      key,
      tex: normalized,
      display,
      svgPath,
      tifPath,
      pngPath,
      width: metadata.width ?? (display ? 1200 : 640),
      height: metadata.height ?? (display ? 180 : 74),
    };

    this.cache.set(key, asset);
    return asset;
  }

  getCount(): number {
    return this.cache.size;
  }
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\/]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100);
}

async function writeFigureAssets(figuresDir: string, specs: FigureSpec[]): Promise<ExportedFigure[]> {
  const outputs: ExportedFigure[] = [];

  for (const spec of specs) {
    const safeId = sanitizeFilename(spec.id);
    const svgPath = path.join(figuresDir, `${safeId}.svg`);
    const tifPath = path.join(figuresDir, `${safeId}.tif`);
    const pngPath = path.join(figuresDir, `${safeId}.png`);
    const svg = buildAcademicFigureSvg(spec);
    const svgBuffer = Buffer.from(svg, 'utf-8');

    fs.writeFileSync(svgPath, svgBuffer);
    await sharp(svgBuffer).png({ compressionLevel: 9 }).toFile(pngPath);
    await sharp(svgBuffer).tiff({ compression: 'lzw' }).toFile(tifPath);

    outputs.push({
      id: spec.id,
      title: spec.title,
      caption: spec.caption,
      svgPath,
      tifPath,
      pngPath,
    });
  }

  return outputs;
}

function tokenizeInlineMath(text: string): Array<{ type: 'text' | 'math'; value: string }> {
  const tokens: Array<{ type: 'text' | 'math'; value: string }> = [];
  let buffer = '';

  const flushText = (): void => {
    if (buffer) {
      tokens.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  for (let index = 0; index < text.length;) {
    if (text.startsWith('\\(', index)) {
      const end = text.indexOf('\\)', index + 2);
      if (end !== -1) {
        flushText();
        tokens.push({ type: 'math', value: text.slice(index + 2, end) });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === '$' && text[index + 1] !== '$' && text[index - 1] !== '\\') {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '$' && text[end - 1] !== '\\') {
          break;
        }
        end += 1;
      }
      if (end < text.length) {
        flushText();
        tokens.push({ type: 'math', value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }

  flushText();
  return tokens;
}

async function buildInlineRuns(
  text: string,
  formulaAssets: FormulaAssetManager,
): Promise<DocChild[]> {
  const { TextRun, ImageRun } = await getDocxModule();
  const tokens = tokenizeInlineMath(stripInlineMarkdown(text));
  const runs: DocChild[] = [];

  for (const token of tokens) {
    if (token.type === 'text') {
      const cleaned = token.value.replace(/\s+/g, ' ');
      if (cleaned) {
        runs.push(new TextRun({
          text: cleaned,
          font: DOC_FONT,
          size: DOC_TEXT_SIZE,
        }));
      }
      continue;
    }

    const asset = await formulaAssets.render(token.value, false);
    const targetHeight = 30;
    const targetWidth = Math.max(42, Math.round(asset.width * (targetHeight / Math.max(asset.height, 1))));
    runs.push(new ImageRun({
      data: fs.readFileSync(asset.pngPath),
      type: 'png',
      transformation: {
        width: targetWidth,
        height: targetHeight,
      },
    }));
  }

  return runs.length > 0
    ? runs
    : [new TextRun({ text: '', font: DOC_FONT, size: DOC_TEXT_SIZE })];
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r/g, '').split('\n');
  let inCode = false;
  let codeLines: string[] = [];
  let inFormula = false;
  let formulaLines: string[] = [];

  const flushCode = (): void => {
    if (codeLines.length > 0) {
      blocks.push({ kind: 'code', text: codeLines.join('\n') });
      codeLines = [];
    }
  };

  const flushFormula = (): void => {
    const text = formulaLines.join('\n').trim();
    if (text) {
      blocks.push({ kind: 'formula', text });
    }
    formulaLines = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLines = [];
      } else {
        flushCode();
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (inFormula) {
      if (trimmed.endsWith('$$') || trimmed.endsWith('\\]')) {
        formulaLines.push(trimmed.replace(/\$\$$/, '').replace(/\\]$/, '').trim());
        flushFormula();
        inFormula = false;
      } else {
        formulaLines.push(rawLine);
      }
      continue;
    }

    const singleLineBlockFormula = trimmed.match(/^\$\$(.+)\$\$$/);
    if (singleLineBlockFormula) {
      blocks.push({ kind: 'formula', text: singleLineBlockFormula[1]!.trim() });
      continue;
    }

    const singleLineBracketFormula = trimmed.match(/^\\\[(.+)\\\]$/);
    if (singleLineBracketFormula) {
      blocks.push({ kind: 'formula', text: singleLineBracketFormula[1]!.trim() });
      continue;
    }

    if (trimmed === '$$' || trimmed.startsWith('$$')) {
      inFormula = true;
      formulaLines = [];
      const first = trimmed === '$$' ? '' : trimmed.slice(2).trim();
      if (first) {
        formulaLines.push(first);
      }
      continue;
    }

    if (trimmed === '\\[' || trimmed.startsWith('\\[')) {
      inFormula = true;
      formulaLines = [];
      const first = trimmed === '\\[' ? '' : trimmed.slice(2).trim();
      if (first) {
        formulaLines.push(first);
      }
      continue;
    }

    if (!trimmed) {
      blocks.push({ kind: 'paragraph', text: '' });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'heading1', text: trimmed.slice(2).trim() });
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'heading2', text: trimmed.slice(3).trim() });
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'heading3', text: trimmed.slice(4).trim() });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed) || /^-\s+/.test(trimmed)) {
      blocks.push({ kind: 'bullet', text: trimmed.replace(/^\d+\.\s+/, '').replace(/^-\s+/, '') });
      continue;
    }

    blocks.push({ kind: 'paragraph', text: rawLine });
  }

  if (inCode) {
    flushCode();
  }
  if (inFormula) {
    flushFormula();
  }

  return blocks;
}

async function buildDocxParagraphs(
  markdown: string,
  bibliography: string[],
  figures: ExportedFigure[],
  formulaAssets: FormulaAssetManager,
): Promise<DocxParagraph[]> {
  const docx = await getDocxModule();
  const { Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = docx;
  const blocks = parseMarkdownBlocks(markdown);
  const paragraphs: DocxParagraph[] = [];

  for (const block of blocks) {
    if (block.kind === 'paragraph' && !block.text) {
      paragraphs.push(new Paragraph({ spacing: { after: 140 } }));
      continue;
    }

    if (block.kind === 'heading1') {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: stripMarkdown(block.text), bold: true, size: DOC_TITLE_SIZE, font: DOC_FONT })],
        spacing: { after: 260 },
      }));
      continue;
    }

    if (block.kind === 'heading2') {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: stripMarkdown(block.text), bold: true, size: DOC_HEADING_1_SIZE, font: DOC_FONT })],
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    if (block.kind === 'heading3') {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: stripMarkdown(block.text), bold: true, size: DOC_HEADING_2_SIZE, font: DOC_FONT })],
        spacing: { before: 100, after: 100 },
      }));
      continue;
    }

    if (block.kind === 'bullet') {
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        children: await buildInlineRuns(block.text, formulaAssets),
        spacing: { after: 120 },
      }));
      continue;
    }

    if (block.kind === 'code') {
      for (const line of block.text.split('\n')) {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: 'Consolas',
              size: DOC_TEXT_SIZE - 2,
              color: '1f2937',
            }),
          ],
          spacing: { after: 40 },
          indent: { left: 360 },
        }));
      }
      paragraphs.push(new Paragraph({ spacing: { after: 160 } }));
      continue;
    }

    if (block.kind === 'formula') {
      const asset = await formulaAssets.render(block.text, true);
      const maxWidth = 560;
      const scale = Math.min(1, maxWidth / Math.max(asset.width, 1));
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: fs.readFileSync(asset.pngPath),
            type: 'png',
            transformation: {
              width: Math.max(180, Math.round(asset.width * scale)),
              height: Math.max(48, Math.round(asset.height * scale)),
            },
          }),
        ],
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    paragraphs.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: await buildInlineRuns(block.text, formulaAssets),
      spacing: { after: 180 },
    }));
  }

  if (figures.length > 0) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Figures', bold: true, size: DOC_HEADING_1_SIZE, font: DOC_FONT })],
      spacing: { before: 180, after: 160 },
    }));

    for (const figure of figures) {
      const data = fs.readFileSync(figure.pngPath);
      const metadata = await sharp(data).metadata();
      const width = metadata.width ?? 1800;
      const height = metadata.height ?? 1100;
      const maxWidth = 560;
      const scale = Math.min(1, maxWidth / Math.max(width, 1));

      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data,
            type: 'png',
            transformation: {
              width: Math.round(width * scale),
              height: Math.round(height * scale),
            },
          }),
        ],
        spacing: { after: 80 },
      }));
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: figure.caption, italics: true, font: DOC_FONT, size: DOC_TEXT_SIZE - 2 })],
        spacing: { after: 160 },
      }));
    }
  }

  if (bibliography.length > 0) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'References', bold: true, size: DOC_HEADING_1_SIZE, font: DOC_FONT })],
      spacing: { before: 180, after: 120 },
    }));
    for (const entry of bibliography) {
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: stripMarkdown(entry), font: DOC_FONT, size: DOC_TEXT_SIZE })],
        spacing: { after: 160 },
      }));
    }
  }

  return paragraphs;
}

async function writeDocx(
  docxPath: string,
  markdown: string,
  bibliography: string[],
  figures: ExportedFigure[],
  formulaAssets: FormulaAssetManager,
): Promise<void> {
  const docx = await getDocxModule();
  const { Paragraph, TextRun, Document, Packer } = docx;
  // Handle empty/null content gracefully
  const safeMarkdown = markdown ?? '';
  const safeBibliography = Array.isArray(bibliography)
    ? bibliography.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const paragraphs = await buildDocxParagraphs(safeMarkdown, safeBibliography, figures, formulaAssets);

  // Ensure at least one paragraph exists (empty document placeholder)
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: '(No content)', font: DOC_FONT, size: DOC_TEXT_SIZE })],
      spacing: { after: 180 },
    }));
  }

  const document = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  try {
    const buffer = await Packer.toBuffer(document);
    fs.writeFileSync(docxPath, buffer);
  } catch (error) {
    throw new Error(`Failed to write DOCX file: ${String(error)}`);
  }
}

export async function exportPaperWorkspace(input: WorkspaceExportInput): Promise<WorkspaceExportResult> {
  // Validate input
  if (!input.workspaceDir || typeof input.workspaceDir !== 'string') {
    throw new Error('Invalid workspaceDir: must be a non-empty string');
  }
  if (!input.title || typeof input.title !== 'string') {
    throw new Error('Invalid title: must be a non-empty string');
  }
  // Ensure markdown is a string (handle null/undefined)
  const safeMarkdown = input.markdown ?? '';
  // Ensure bibliography is an array of strings
  const safeBibliography = Array.isArray(input.bibliography)
    ? input.bibliography.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];

  const exportsDir = path.join(input.workspaceDir, 'exports');
  const figuresDir = path.join(input.workspaceDir, 'figures');
  const formulasDir = path.join(input.workspaceDir, 'formulas');
  const rawDataDir = path.join(input.workspaceDir, 'raw-data');
  const sourceCodeDir = path.join(input.workspaceDir, 'source-code');
  const citationsDir = path.join(input.workspaceDir, 'citations');

  for (const dir of [exportsDir, figuresDir, formulasDir, rawDataDir, sourceCodeDir, citationsDir]) {
    ensureDir(dir);
  }

  const markdownPath = path.join(exportsDir, 'final-paper.md');
  const docxPath = path.join(exportsDir, 'final-paper.docx');
  const bibliographyPath = path.join(citationsDir, 'references-gbt.txt');
  const citationsJsonPath = input.citationRecords
    ? path.join(citationsDir, 'verified-citations.json')
    : undefined;
  const manifestPath = path.join(input.workspaceDir, 'workspace-manifest.json');

  // Wrap file writes in try-catch for better error handling
  try {
    fs.writeFileSync(markdownPath, safeMarkdown, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write markdown file: ${String(error)}`);
  }

  try {
    fs.writeFileSync(bibliographyPath, safeBibliography.join('\n'), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write bibliography file: ${String(error)}`);
  }

  if (citationsJsonPath && input.citationRecords) {
    try {
      fs.writeFileSync(citationsJsonPath, JSON.stringify(input.citationRecords, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`[exportPaperWorkspace] Failed to write citations JSON: ${String(error)}`);
    }
  }

  if (input.rawData) {
    try {
      fs.writeFileSync(path.join(rawDataDir, 'research-artifacts.json'), JSON.stringify(input.rawData, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`[exportPaperWorkspace] Failed to write raw data: ${String(error)}`);
    }
  }

  if (input.metadata) {
    try {
      fs.writeFileSync(path.join(input.workspaceDir, 'metadata.export.json'), JSON.stringify(input.metadata, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`[exportPaperWorkspace] Failed to write metadata: ${String(error)}`);
    }
  }

  for (const artifact of input.sourceCode ?? []) {
    if (!artifact.filename || typeof artifact.content !== 'string') {
      console.warn(`[exportPaperWorkspace] Skipping invalid source code artifact: ${artifact.filename || 'unnamed'}`);
      continue;
    }
    const fullPath = path.join(sourceCodeDir, artifact.filename);
    // Prevent path traversal: ensure resolved path stays within sourceCodeDir
    if (!path.resolve(fullPath).startsWith(path.resolve(sourceCodeDir) + path.sep) &&
        path.resolve(fullPath) !== path.resolve(sourceCodeDir)) {
      console.warn(`[exportPaperWorkspace] Skipping source artifact with unsafe path: ${artifact.filename}`);
      continue;
    }
    try {
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, artifact.content, 'utf-8');
    } catch (error) {
      console.warn(`[exportPaperWorkspace] Failed to write source file ${artifact.filename}: ${String(error)}`);
    }
  }

  const figureSpecs = input.figures && input.figures.length > 0 ? input.figures : deriveDefaultFigures(input);
  const figures = await writeFigureAssets(figuresDir, figureSpecs);
  const formulaAssets = new FormulaAssetManager(formulasDir);
  await writeDocx(docxPath, safeMarkdown, safeBibliography, figures, formulaAssets);

  // Build manifest with complete schema
  const manifest = {
    title: input.title,
    workspaceDir: input.workspaceDir,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    exports: {
      markdownPath,
      docxPath,
      bibliographyPath,
      citationsJsonPath,
      figures,
      formulaCount: formulaAssets.getCount(),
    },
    directories: {
      rawDataDir,
      sourceCodeDir,
      figuresDir,
      formulasDir,
      citationsDir,
    },
    input: {
      title: input.title,
      hasMarkdown: safeMarkdown.length > 0,
      markdownLength: safeMarkdown.length,
      bibliographyCount: safeBibliography.length,
      hasRawData: !!input.rawData,
      hasMetadata: !!input.metadata,
      sourceCodeCount: input.sourceCode?.length ?? 0,
      figuresCount: figureSpecs.length,
    },
  };

  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write manifest file: ${String(error)}`);
  }

  const evidence = writeWorkspaceEvidenceManifest({
    workspaceDir: input.workspaceDir,
    title: input.title,
    markdownPath,
    docxPath,
    bibliographyPath,
    citationsJsonPath,
    rawDataDir,
    sourceCodeDir,
    figures,
    formulaDir: formulasDir,
    formulaCount: formulaAssets.getCount(),
    markdown: safeMarkdown,
    bibliography: safeBibliography,
    citationRecords: input.citationRecords,
    datasetEvidence: input.datasetEvidence,
    datasetReachability: input.datasetReachability,
    executionRuns: input.executionRuns,
  });

  return {
    markdownPath,
    docxPath,
    bibliographyPath,
    citationsJsonPath,
    manifestPath,
    rawDataDir,
    sourceCodeDir,
    formulaDir: formulasDir,
    formulaCount: formulaAssets.getCount(),
    figures,
    evidenceManifestPath: evidence.evidenceManifestPath,
    strictValidationPath: evidence.validationReportPath,
    evidenceManifest: evidence.manifest,
  };
}
