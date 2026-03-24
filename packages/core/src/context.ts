import * as fs from 'fs';
import * as path from 'path';
import type { TzukwanConfig, Tool } from './types.js';

/**
 * Builds prompts and context strings for the tzukwan agent.
 */
export class ContextBuilder {
  /**
   * Constructs the system-level prompt that initialises an agent conversation.
   *
   * The system prompt includes:
   *   - Agent identity and purpose
   *   - Current time and working directory
   *   - Research configuration (language, citation style, preferred sources)
   *   - Available tools with descriptions and parameter schemas
   *   - User-defined rules from TZUKWAN.md
   *
   * @param config - Active configuration
   * @param tools - Tools that the agent may call
   * @returns Complete system prompt string
   */
  buildSystemPrompt(config: TzukwanConfig, tools: Tool[]): string {
    const now = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
    const cwd = process.cwd();
    const lang = config.research.defaultLanguage;

    // Build tool list with parameter summaries
    let toolsSection: string;
    if (tools.length === 0) {
      toolsSection = '(No tools registered)';
    } else {
      toolsSection = tools
        .map((t) => {
          const params = t.parameters as {
            properties?: Record<string, { type?: string; description?: string }>;
            required?: string[];
          };

          const paramLines = params.properties
            ? Object.entries(params.properties)
                .map(([name, spec]) => {
                  const required = params.required?.includes(name) ? ' [required]' : ' [optional]';
                  return `      ${name} (${spec.type ?? 'any'})${required}: ${spec.description ?? ''}`;
                })
                .join('\n')
            : '      (no parameters)';

          return `  - **${t.name}**: ${t.description}\n    Parameters:\n${paramLines}`;
        })
        .join('\n\n');
    }

    // Build rules section
    let rulesSection = '';
    if (config.rules.length > 0) {
      rulesSection =
        '## Behavioural Rules (defined by the user in TZUKWAN.md)\n' +
        config.rules.map((r) => `  - ${r}`).join('\n');
    }

    // Build preferred sources section
    let sourcesLine = '';
    if (config.research.preferredSources.length > 0) {
      sourcesLine = `Preferred sources: ${config.research.preferredSources.join(', ')}`;
    }

    // Build dataset categories section
    let categoriesLine = '';
    if (config.research.datasetCategories.length > 0) {
      categoriesLine = `Dataset categories: ${config.research.datasetCategories.join(', ')}`;
    }

    const parts: string[] = [
      `You are tzukwan, an AI agent specialised in academic research and literature analysis.`,
      `You assist researchers in finding, summarising, and citing academic sources accurately.`,
      '',
      `## Runtime Context`,
      `  Current time: ${now}`,
      `  Working directory: ${cwd}`,
      '',
      `## Research Configuration`,
      `  Output language: ${lang}`,
      `  Citation style: ${config.research.citationStyle}`,
    ];

    if (sourcesLine) parts.push(`  ${sourcesLine}`);
    if (categoriesLine) parts.push(`  ${categoriesLine}`);

    parts.push('', '## Available Tools', toolsSection);

    if (rulesSection) {
      parts.push('', rulesSection);
    }

    parts.push(
      '',
      '## Core Principles',
      '  - Always cite real, verifiable papers. Never fabricate authors, titles, DOIs, or abstracts.',
      '  - Prefer primary sources (journal articles, conference proceedings) over secondary summaries.',
      `  - Format all citations in ${config.research.citationStyle} style.`,
      `  - Respond in ${lang} unless the user requests another language.`,
      '  - When uncertain about a fact, say so rather than guessing.',
      '  - Before executing shell commands, explain what the command will do.'
    );

    return parts.join('\n');
  }

  /**
   * Builds a research context string for a specific topic.
   * This is typically prepended to user messages in a research session.
   *
   * @param topic - Research topic or question
   * @param config - Active configuration
   * @returns Context string
   */
  buildResearchContext(topic: string, config: TzukwanConfig): string {
    const parts: string[] = [
      `## Research Session Context`,
      `  Topic: ${topic}`,
      `  Language: ${config.research.defaultLanguage}`,
      `  Citation Style: ${config.research.citationStyle}`,
    ];

    if (config.research.preferredSources.length > 0) {
      parts.push(`  Preferred Sources: ${config.research.preferredSources.join(', ')}`);
    }

    if (config.research.datasetCategories.length > 0) {
      parts.push(`  Dataset Focus: ${config.research.datasetCategories.join(', ')}`);
    }

    parts.push(
      '',
      `Please conduct a thorough literature review on the above topic, following the behavioural rules`,
      `defined in the system prompt. Begin by identifying key papers and then synthesise their findings.`
    );

    return parts.join('\n');
  }

  /**
   * Loads and returns the content of the TZUKWAN.md file in the given directory.
   * Returns an empty string if the file does not exist or cannot be read.
   *
   * @param dir - Directory to search for TZUKWAN.md
   * @returns File content, or empty string
   */
  async loadTzukwanMdContext(dir: string): Promise<string> {
    const mdPath = path.join(dir, 'TZUKWAN.md');

    try {
      return await fs.promises.readFile(mdPath, 'utf-8');
    } catch {
      return '';
    }
  }
}
