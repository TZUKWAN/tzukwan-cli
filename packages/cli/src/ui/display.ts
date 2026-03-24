import chalk from 'chalk';
import boxen from 'boxen';
import figlet from 'figlet';
import gradientString from 'gradient-string';

export function displayBanner(version: string = '1.0.0'): void {
  let art: string;
  try {
    art = figlet.textSync('TZUKWAN', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    });
  } catch {
    art = 'TZUKWAN';
  }

  const gradient = gradientString(['#00b4d8', '#0077b6', '#023e8a']);
  console.log('\n' + gradient(art));
  console.log(chalk.cyan('  ') + chalk.bold.white('Academic Research AI Agent') + chalk.gray(`  v${version}`));
  console.log(chalk.gray(`  ${'-'.repeat(58)}`));
  console.log(chalk.gray('  Type ') + chalk.cyan('/help') + chalk.gray(' for commands, ') + chalk.cyan('/exit') + chalk.gray(' to quit\n'));
}

export function displayResult(content: string): void {
  console.log('\n' + renderMarkdown(content) + '\n');
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = fenceMatch[1] ?? '';
        codeLines = [];
      } else {
        const header = codeBlockLang ? ` code:${codeBlockLang} ` : ' code ';
        output.push(chalk.gray(`  +${'-'.repeat(54)}+`));
        output.push(chalk.gray(`  |${header.padEnd(54)}|`));
        output.push(chalk.gray(`  +${'-'.repeat(54)}+`));
        for (const codeLine of codeLines) {
          // Truncate very long lines to prevent terminal display issues
          const displayLine = codeLine.length > 200 ? codeLine.slice(0, 200) + '…' : codeLine;
          output.push(chalk.gray('  | ') + chalk.greenBright(displayLine));
        }
        output.push(chalk.gray(`  +${'-'.repeat(54)}+`));
        inCodeBlock = false;
        codeBlockLang = '';
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (/^######\s+(.+)/.test(line)) {
      output.push(chalk.bold.white(line.replace(/^######\s+/, '')));
    } else if (/^#####\s+(.+)/.test(line)) {
      output.push(chalk.bold.white(line.replace(/^#####\s+/, '')));
    } else if (/^####\s+(.+)/.test(line) || /^###\s+(.+)/.test(line)) {
      output.push('\n' + chalk.bold.cyan(line.replace(/^#{3,4}\s+/, '')));
    } else if (/^##\s+(.+)/.test(line)) {
      output.push('\n' + chalk.bold.blue('## ') + chalk.bold.white(line.replace(/^##\s+/, '')));
    } else if (/^#\s+(.+)/.test(line)) {
      output.push('\n' + chalk.bold.blueBright('# ') + chalk.bold.white(line.replace(/^#\s+/, '')));
    } else if (/^[-*_]{3,}$/.test(line.trim())) {
      output.push(chalk.gray('-'.repeat(60)));
    } else if (/^(\s*)[*\-+]\s+(.+)/.test(line)) {
      const match = line.match(/^(\s*)[*\-+]\s+(.+)/);
      if (match) {
        output.push(match[1] + chalk.cyan('-') + ' ' + inlineMarkdown(match[2]));
      }
    } else if (/^(\s*)\d+\.\s+(.+)/.test(line)) {
      const match = line.match(/^(\s*)(\d+)\.\s+(.+)/);
      if (match) {
        output.push(match[1] + chalk.cyan(`${match[2]}.`) + ' ' + inlineMarkdown(match[3]));
      }
    } else if (/^>\s*(.*)/.test(line)) {
      const match = line.match(/^>\s*(.*)/);
      if (match) {
        output.push(chalk.gray('  | ') + chalk.italic.gray(inlineMarkdown(match[1])));
      }
    } else {
      output.push(inlineMarkdown(line));
    }
  }

  return output.join('\n');
}

function inlineMarkdown(text: string): string {
  const tokens: string[] = [];
  const stash = (value: string): string => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(value);
    return token;
  };
  const restore = (value: string): string => value.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] ?? '');

  let formatted = text;
  formatted = formatted.replace(/`([^`]+)`/g, (_, code) => stash(chalk.bgBlackBright.greenBright(` ${code} `)));
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => stash(chalk.cyan(label) + chalk.gray(` (${url})`)));
  formatted = formatted.replace(/\*\*\*([^*]+)\*\*\*/g, (_, value) => stash(chalk.bold.italic(value)));
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (_, value) => stash(chalk.bold(value)));
  formatted = formatted.replace(/__([^_]+)__/g, (_, value) => stash(chalk.bold(value)));
  formatted = formatted.replace(/(^|[\s([{"'])\*([^*\n]+)\*(?=$|[\s)\]}",.!?:;'])/g, (_, prefix, value) => `${prefix}${stash(chalk.italic(value))}`);
  formatted = formatted.replace(/(^|[\s([{"'])_([^_\n]+)_(?=$|[\s)\]}",.!?:;'])/g, (_, prefix, value) => `${prefix}${stash(chalk.italic(value))}`);
  formatted = formatted.replace(/~~([^~]+)~~/g, (_, value) => stash(chalk.strikethrough.gray(value)));
  return restore(formatted);
}

export function displayError(msg: string): void {
  const box = boxen(`${chalk.red('x')} ${chalk.bold.red('Error:')} ${chalk.white(msg)}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: 'red',
    borderStyle: 'round',
  });
  console.error('\n' + box + '\n');
}

export function displaySuccess(msg: string): void {
  const box = boxen(`${chalk.green('ok')} ${chalk.bold.green('Success:')} ${chalk.white(msg)}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: 'green',
    borderStyle: 'round',
  });
  console.log('\n' + box + '\n');
}

export function displayInfo(msg: string): void {
  const box = boxen(`${chalk.blue('i')} ${chalk.bold.blue('Info:')} ${chalk.white(msg)}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: 'blue',
    borderStyle: 'round',
  });
  console.log('\n' + box + '\n');
}

export function displayTable(headers: string[], rows: string[][]): void {
  if (headers.length === 0) return;

  const widths = headers.map((header, index) => {
    const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[index] ?? '').length), 0);
    return Math.max(header.length, maxDataLen);
  });

  const divider = '+' + widths.map((width) => '-'.repeat((width ?? 0) + 2)).join('+') + '+';
  const formatRow = (cells: string[], color: (value: string) => string): string => {
    const padded = cells.map((cell, index) => {
      const width = widths[index] ?? 0;
      return ` ${color((cell ?? '').padEnd(width))} `;
    });
    return '|' + padded.join('|') + '|';
  };

  console.log('\n' + chalk.gray(divider));
  console.log(formatRow(headers, (value) => chalk.bold.cyan(value)));
  console.log(chalk.gray(divider));
  for (let index = 0; index < rows.length; index++) {
    const row = headers.map((_, cellIndex) => rows[index]?.[cellIndex] ?? '');
    const color = index % 2 === 0 ? (value: string) => chalk.white(value) : (value: string) => chalk.gray(value);
    console.log(formatRow(row, color));
  }
  console.log(chalk.gray(divider) + '\n');
}

export function displayProgress(label: string): { stop: (finalMsg?: string) => void } {
  const frames = ['|', '/', '-', '\\'];
  let index = 0;
  const isTTY = process.stdout.isTTY;

  const interval = setInterval(() => {
    if (isTTY) {
      process.stdout.write('\r' + chalk.cyan(frames[index % frames.length]) + ' ' + chalk.gray(label));
    }
    index++;
  }, 80);

  return {
    stop: (finalMsg?: string) => {
      clearInterval(interval);
      if (isTTY) {
        process.stdout.write('\r' + ' '.repeat(label.length + 4) + '\r');
      }
      if (finalMsg) {
        console.log(chalk.green('ok') + ' ' + chalk.gray(finalMsg));
      }
    },
  };
}

/**
 * Display a diff-like view for code/text changes (IDE style)
 * Removed lines shown in red with '-', added lines in green with '+'
 */
export function displayDiff(
  oldText: string,
  newText: string,
  options: { context?: number; header?: string } = {}
): void {
  const { context = 3, header } = options;
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple diff algorithm - find common prefix and suffix
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }

  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld--;
    endNew--;
  }

  // Print header
  if (header) {
    console.log(chalk.bold.cyan('\n  ' + header));
    console.log(chalk.gray('  ' + '─'.repeat(56)));
  } else {
    console.log(chalk.gray('  ' + '─'.repeat(56)));
  }

  // Print context before changes
  const contextStart = Math.max(0, start - context);
  for (let i = contextStart; i < start; i++) {
    console.log(chalk.gray('  ' + String(i + 1).padStart(4) + ' │ ' + oldLines[i]));
  }

  if (start > 0 && contextStart > 0) {
    console.log(chalk.gray('  ··· │ ···'));
  }

  // Print removed lines (red, with '-')
  for (let i = start; i <= endOld; i++) {
    const lineNum = String(i + 1).padStart(4);
    const content = oldLines[i] || '';
    // Truncate very long lines
    const displayContent = content.length > 100 ? content.slice(0, 100) + '…' : content;
    console.log(chalk.bgRed.black(' - ') + chalk.red(' ' + lineNum + ' │ ') + chalk.red.strikethrough(displayContent));
  }

  // Print added lines (green, with '+')
  for (let i = start; i <= endNew; i++) {
    const lineNum = String(i + 1).padStart(4);
    const content = newLines[i] || '';
    // Truncate very long lines
    const displayContent = content.length > 100 ? content.slice(0, 100) + '…' : content;
    console.log(chalk.bgGreen.black(' + ') + chalk.green(' ' + lineNum + ' │ ') + chalk.green(displayContent));
  }

  // Print context after changes
  const contextEnd = Math.min(oldLines.length, endOld + 1 + context);
  if (contextEnd < oldLines.length) {
    if (contextEnd < oldLines.length - 1) {
      console.log(chalk.gray('  ··· │ ···'));
    }
    for (let i = Math.max(contextEnd, oldLines.length - context); i < oldLines.length; i++) {
      console.log(chalk.gray('  ' + String(i + 1).padStart(4) + ' │ ' + oldLines[i]));
    }
  }

  console.log(chalk.gray('  ' + '─'.repeat(56)));
}

/**
 * Display a single code change (for simple text replacements)
 * Shows old text in red strikethrough, new text in green
 */
export function displayChange(
  oldText: string,
  newText: string,
  label?: string
): void {
  if (label) {
    console.log(chalk.bold.cyan('\n  ' + label));
  }
  console.log(chalk.gray('  ' + '─'.repeat(56)));
  console.log(chalk.red('  - ') + chalk.strikethrough(oldText.slice(0, 100)));
  console.log(chalk.green('  + ') + newText.slice(0, 100));
  console.log(chalk.gray('  ' + '─'.repeat(56)));
}

/**
 * Display a tool call with IDE-style formatting
 * Tool name in gray, parameters in dimmed text
 */
export function displayToolCall(toolName: string, params: Record<string, unknown>): void {
  console.log(chalk.gray('  ┌─ Tool Call'));
  console.log(chalk.gray('  │ ') + chalk.cyan.bold(toolName));
  const paramsText = JSON.stringify(params, null, 2).split('\n');
  for (const line of paramsText) {
    console.log(chalk.gray('  │ ') + chalk.dim(line));
  }
  console.log(chalk.gray('  └─'));
}

/**
 * Display thinking/thought process in dimmed gray
 */
export function displayThinking(thought: string): void {
  const lines = thought.split('\n');
  console.log(chalk.gray('  ┌─ Thinking'));
  for (const line of lines.slice(0, 20)) { // Limit to 20 lines
    console.log(chalk.gray('  │ ') + chalk.dim(line.slice(0, 100)));
  }
  if (lines.length > 20) {
    console.log(chalk.gray('  │ ') + chalk.dim(`... and ${lines.length - 20} more lines`));
  }
  console.log(chalk.gray('  └─'));
}
