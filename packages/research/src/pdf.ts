import * as fs from 'fs';
import * as path from 'path';

// pdf-parse is a CommonJS module; we use createRequire for ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

// Maximum file size: 100MB to prevent OOM
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
// Minimum valid PDF size (PDF header is typically > 100 bytes)
const MIN_PDF_SIZE_BYTES = 100;

export interface Section {
  heading: string;
  content: string;
  level: number;
}

export interface Reference {
  raw: string;
  authors?: string[];
  title?: string;
  year?: string;
  journal?: string;
  doi?: string;
}

export interface ParsedPaper {
  rawText: string;
  title: string;
  abstract: string;
  sections: Section[];
  references: Reference[];
  figures: string[];
  equations: string[];
  pageCount: number;
  metadata: Record<string, unknown>;
}

export class PdfParser {
  /**
   * Check if a file is a valid PDF by examining its header
   */
  private isPdfFile(filePath: string): boolean {
    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(8);
      fs.readSync(fd, buffer, 0, 8, 0);
      // PDF files start with %PDF- (0x25 0x50 0x44 0x46 0x2d)
      return buffer.toString('ascii', 0, 5) === '%PDF-';
    } catch {
      return false;
    } finally {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    }
  }

  async parse(filePath: string): Promise<ParsedPaper | null> {
    if (!fs.existsSync(filePath)) {
      console.warn(`PDF file not found: ${filePath}`);
      return null;
    }

    // Check file size before reading
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`PDF file too large (${stats.size} bytes): ${filePath}`);
      return null;
    }

    if (stats.size < MIN_PDF_SIZE_BYTES) {
      console.warn(`PDF file too small (${stats.size} bytes), likely corrupted: ${filePath}`);
      return null;
    }

    // Validate PDF header
    if (!this.isPdfFile(filePath)) {
      console.warn(`File is not a valid PDF: ${filePath}`);
      return null;
    }

    let dataBuffer: Buffer | undefined;
    try {
      dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer, { max: 0 });

      // Handle empty or corrupted PDFs
      if (!data || !data.text || data.numpages === 0) {
        console.warn(`PDF appears to be empty or corrupted: ${filePath}`);
        return null;
      }

      const rawText = data.text;
      const title = this.extractTitle(rawText);
      const abstract = this.extractAbstract(rawText);
      const sections = this.extractSections(rawText);
      const references = this.extractReferences(rawText);
      const figures = this.extractFigures(rawText);
      const equations = this.extractEquations(rawText);

      return {
        rawText,
        title,
        abstract,
        sections,
        references,
        figures,
        equations,
        pageCount: data.numpages,
        metadata: data.info ?? {},
      };
    } catch (error) {
      console.warn(`Failed to parse PDF "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      // Clear buffer reference to help GC
      dataBuffer = undefined;
    }
  }

  extractAbstract(text: string): string {
    // Limit text size to prevent ReDoS attacks
    const MAX_TEXT_SIZE = 500000;
    const searchText = text.length > MAX_TEXT_SIZE ? text.slice(0, MAX_TEXT_SIZE) : text;
    // Use non-greedy quantifiers with reasonable length limits to prevent catastrophic backtracking
    const patterns = [
      /\bABSTRACT\b[\s\n]+([\s\S]{100,2000}?)(?=\n\s*(?:1[.\s]|INTRODUCTION|Keywords?:|Index Terms?))/i,
      /\bAbstract[\s—–-]+([\s\S]{100,2000}?)(?=\n\s*(?:1[.\s]|Introduction|Keywords?:))/i,
      /\bAbstract\b\n+([\s\S]{100,2000}?)(?=\n\s*\n)/i,
    ];

    for (const pattern of patterns) {
      const match = searchText.match(pattern);
      if (match?.[1]) {
        return match[1].replace(/\s+/g, ' ').trim();
      }
    }

    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const abstractLine = lines.findIndex((l) => /^abstract$/i.test(l.trim()));
    if (abstractLine >= 0 && abstractLine + 1 < lines.length) {
      const collected: string[] = [];
      for (let i = abstractLine + 1; i < Math.min(abstractLine + 20, lines.length); i++) {
        if (/^\d+\.\s+\w/.test(lines[i]) || /^(keywords|introduction)/i.test(lines[i])) break;
        collected.push(lines[i]);
      }
      if (collected.length > 0) return collected.join(' ').replace(/\s+/g, ' ').trim();
    }

    return '';
  }

  extractSections(text: string): Section[] {
    const sections: Section[] = [];
    // Limit text size and match count to prevent ReDoS
    const MAX_TEXT_SIZE = 1000000;
    const MAX_MATCHES = 1000;
    const searchText = text.length > MAX_TEXT_SIZE ? text.slice(0, MAX_TEXT_SIZE) : text;

    const sectionPattern = /^(\d+(?:\.\d+)*)\s+([A-Z][^\n]{3,80})\s*$/gm;
    let match: RegExpExecArray | null;
    const headingPositions: { pos: number; heading: string; level: number }[] = [];
    let matchCount = 0;

    while ((match = sectionPattern.exec(searchText)) !== null) {
      if (++matchCount > MAX_MATCHES) {
        console.warn('[extractSections] Too many matches, stopping');
        break;
      }
      const numbering = match[1];
      const heading = match[2].trim();
      const level = numbering.split('.').length;
      headingPositions.push({ pos: match.index, heading: `${numbering} ${heading}`, level });
    }

    if (headingPositions.length === 0) {
      const fallbackPattern = /^(ABSTRACT|INTRODUCTION|RELATED WORK|METHODOLOGY|METHOD|RESULTS?|DISCUSSION|CONCLUSION|REFERENCES?|ACKNOWLEDGMENTS?)\s*$/gm;
      while ((match = fallbackPattern.exec(text)) !== null) {
        headingPositions.push({ pos: match.index, heading: match[1].trim(), level: 1 });
      }
    }

    for (let i = 0; i < headingPositions.length; i++) {
      const current = headingPositions[i];
      const nextPos = i + 1 < headingPositions.length ? headingPositions[i + 1].pos : text.length;
      const content = text
        .slice(current.pos + current.heading.length, nextPos)
        .replace(/\s+/g, ' ')
        .trim();
      sections.push({
        heading: current.heading,
        content,
        level: current.level,
      });
    }

    return sections;
  }

  extractReferences(text: string): Reference[] {
    const references: Reference[] = [];

    const refSectionMatch = text.match(
      /\n\s*(?:REFERENCES|References|Bibliography)\s*\n([\s\S]+?)(?:\n\s*APPENDIX|\n\s*Appendix|$)/i
    );

    const refText = refSectionMatch ? refSectionMatch[1] : '';
    if (!refText) return references;

    const numbered = refText.split(/\n\s*\[\d+\]\s+/);
    const autoed = refText.split(/\n(?=[A-Z][a-z]+,\s+[A-Z]\.)/);
    const lines = (numbered.length > autoed.length ? numbered : autoed).filter(
      (l) => l.trim().length > 20
    );

    for (const line of lines) {
      const raw = line.replace(/\s+/g, ' ').trim();
      if (!raw) continue;

      const ref: Reference = { raw };

      const doiMatch = raw.match(/doi:\s*(10\.\S+)/i) ?? raw.match(/https?:\/\/doi\.org\/(10\.\S+)/i);
      if (doiMatch) ref.doi = doiMatch[1];

      const yearMatch = raw.match(/\((\d{4})\)/) ?? raw.match(/,?\s*(\d{4})[.,]/);
      if (yearMatch) ref.year = yearMatch[1];

      const titleMatch = raw.match(/"([^"]{10,200})"/) ?? raw.match(/["""]([^"""]{10,200})["""]/);
      if (titleMatch) ref.title = titleMatch[1];

      references.push(ref);
    }

    return references;
  }

  extractEquations(text: string): string[] {
    const equations: string[] = [];

    const displayEq = text.match(/\$\$[\s\S]+?\$\$/g);
    if (displayEq) equations.push(...displayEq);

    const inlineEq = text.match(/\$[^$\n]{3,100}\$/g);
    if (inlineEq) equations.push(...inlineEq);

    const eqPatterns = [
      /(?:^|\n)\s*(?:Eq\.|Equation)\s*\(?(\d+)\)?\s*:?\s*([^\n]{10,200})/gim,
    ];
    for (const pattern of eqPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        equations.push(match[2].trim());
      }
    }

    return [...new Set(equations)];
  }

  private extractTitle(text: string): string {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    const skipPatterns = [
      /^abstract$/i,
      /^\d+$/,
      /^(received|accepted|published|doi:|arXiv:|proceedings|conference|workshop|journal|vol\.|volume)/i,
      /permission\s+(to|is)/i,
      /copyright/i,
      /all rights reserved/i,
      /grant(s|ed|ing)\s+permission/i,
      /under\s+(the\s+)?(terms|license|cc|creative)/i,
      /preprint/i,
      /^\s*\d+\s*$/, // standalone numbers
    ];

    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i].trim();
      if (
        line.length > 10 &&
        line.length < 250 &&
        !skipPatterns.some(p => p.test(line))
      ) {
        return line;
      }
    }

    return '';
  }

  private extractFigures(text: string): string[] {
    const figures: string[] = [];

    const figPattern = /(?:Fig(?:ure)?\.?\s*\d+[a-z]?[:.]?\s*|FIGURE\s+\d+[.:]\s*)([^\n]{10,300})/gi;
    let match: RegExpExecArray | null;

    while ((match = figPattern.exec(text)) !== null) {
      figures.push(match[0].replace(/\s+/g, ' ').trim());
    }

    return figures;
  }
}
