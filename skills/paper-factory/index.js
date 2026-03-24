/**
 * Paper Factory Skill - End-to-end academic paper generation and analysis
 * Commands: generate, monitor, analyze, reproduce, review
 * Delegates to @tzukwan/research package
 */

// ─── Helper: dynamic import with error normalization ─────────────────────────

async function getResearch() {
  return import('../../packages/research/dist/index.js');
}

// ─── Helper: validate arXiv ID format ────────────────────────────────────────

function isValidArxivId(id) {
  // arXiv ID format: YYMM.NNNNN or arXiv:YYMM.NNNNN or YYMM.NNNNNvN
  // Examples: 2401.12345, 2401.12345v1, arXiv:2401.12345
  const cleanId = id.replace(/^arxiv:/i, '');
  return /^\d{4}\.\d{4,6}(v\d+)?$/.test(cleanId);
}

function normalizeArxivId(id) {
  return id.replace(/^arxiv:/i, '').trim();
}

// ─── Command Implementations ─────────────────────────────────────────────────

async function generateCommand(args, context) {
  const {
    topic,
    field = 'ai',
    type = 'journal',
    outputDir,
  } = args;

  if (!topic) {
    return { error: 'topic is required' };
  }

  // Validate type parameter
  const validTypes = ['journal', 'master', 'phd', 'conference'];
  if (!validTypes.includes(type)) {
    return {
      error: `Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`,
      topic,
      field,
      type,
    };
  }

  try {
    const research = await getResearch();
    const result = await research.generatePaper({ topic, field, type, outputDir });

    // Verify output was actually created
    if (!result.outputPath) {
      return {
        error: 'Paper generation completed but no output path was returned',
        topic,
        field,
        type,
      };
    }

    return {
      ...result,
      output: formatGenerateOutput(result, topic, field, type),
    };
  } catch (err) {
    return {
      error: `generatePaper failed: ${err.message}`,
      topic,
      field,
      type,
    };
  }
}

function formatGenerateOutput(result, topic, field, type) {
  const lines = [
    `Paper generated: "${result.title || topic}"`,
    `Type: ${type} | Field: ${field}`,
  ];
  if (result.outputPath) lines.push(`Saved to: ${result.outputPath}`);
  if (result.abstract) lines.push(`\nAbstract (excerpt):\n${result.abstract.slice(0, 400)}${result.abstract.length > 400 ? '...' : ''}`);
  if (Array.isArray(result.references) && result.references.length > 0) {
    lines.push(`\nDatasets referenced (${result.references.length}):`);
    result.references.slice(0, 3).forEach(r => lines.push(`  - ${r}`));
  }
  return lines.join('\n');
}

async function monitorCommand(args, context) {
  const {
    categories = ['cs.AI'],
    limit = 10,
  } = args;

  // Validate limit
  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    return {
      error: 'limit must be a number between 1 and 100',
      papers: [],
      total: 0,
      categories,
    };
  }

  // Validate categories
  if (!Array.isArray(categories) || categories.length === 0) {
    return {
      error: 'categories must be a non-empty array',
      papers: [],
      total: 0,
      categories,
    };
  }

  try {
    const research = await getResearch();
    const papers = await research.monitorArxiv({ limit, categories });

    const output = formatMonitorOutput(papers, categories);
    return { papers, total: papers.length, categories, output };
  } catch (err) {
    return {
      error: `monitorArxiv failed: ${err.message}`,
      papers: [],
      total: 0,
      categories,
    };
  }
}

function formatMonitorOutput(papers, categories) {
  const lines = [
    `arXiv Monitor — ${categories.join(', ')}`,
    `Latest papers: ${papers.length}\n`,
  ];
  papers.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.title}`);
    const authors = Array.isArray(p.authors) ? p.authors.slice(0, 3).join(', ') : String(p.authors || '');
    if (authors) lines.push(`   Authors: ${authors}${p.authors && p.authors.length > 3 ? ' et al.' : ''}`);
    if (p.year) lines.push(`   Year: ${p.year}`);
    if (p.url) lines.push(`   URL: ${p.url}`);
    if (p.abstract) lines.push(`   Abstract: ${p.abstract.slice(0, 150)}...`);
    lines.push('');
  });
  return lines.join('\n');
}

async function analyzeCommand(args, context) {
  const { id, outputDir } = args;

  if (!id) {
    return { error: 'id (arXiv paper ID) is required' };
  }

  // Validate arXiv ID format
  if (!isValidArxivId(id)) {
    return {
      error: `Invalid arXiv ID format: "${id}". Expected format: YYMM.NNNNN (e.g., 2401.12345)`,
      id,
    };
  }

  const normalizedId = normalizeArxivId(id);

  try {
    const research = await getResearch();
    const result = await research.analyzePaper(normalizedId, outputDir);

    // Verify analysis was actually performed
    if (!result.paper && !result.analysis) {
      return {
        error: `Analysis failed: No paper data or analysis results returned for ${normalizedId}`,
        id: normalizedId,
      };
    }

    const output = formatAnalyzeOutput(result, normalizedId);
    return { ...result, output };
  } catch (err) {
    return {
      error: `analyzePaper failed: ${err.message}`,
      id: normalizedId,
    };
  }
}

function formatAnalyzeOutput(result, id) {
  const lines = [`Paper Analysis: ${id}\n`];
  if (result.paper) {
    const p = result.paper;
    lines.push(`Title:   ${p.title || id}`);
    if (Array.isArray(p.authors) && p.authors.length > 0) {
      lines.push(`Authors: ${p.authors.slice(0, 4).join(', ')}${p.authors.length > 4 ? ' et al.' : ''}`);
    }
    if (p.year) lines.push(`Year:    ${p.year}`);
    if (p.url) lines.push(`URL:     ${p.url}`);
    if (p.abstract) lines.push(`\nAbstract:\n${p.abstract.slice(0, 500)}${p.abstract.length > 500 ? '...' : ''}`);
  }
  if (result.analysis) lines.push(`\nAnalysis:\n${result.analysis}`);
  if (Array.isArray(result.keyContributions) && result.keyContributions.length > 0) {
    lines.push(`\nKey Contributions:\n${result.keyContributions.map(c => `  - ${c}`).join('\n')}`);
  }
  if (result.outputPath) lines.push(`\nFull analysis saved to: ${result.outputPath}`);
  return lines.join('\n');
}

async function reproduceCommand(args, context) {
  const { id, outputDir } = args;

  if (!id) {
    return { error: 'id (arXiv paper ID) is required' };
  }

  // Validate arXiv ID format
  if (!isValidArxivId(id)) {
    return {
      error: `Invalid arXiv ID format: "${id}". Expected format: YYMM.NNNNN (e.g., 2401.12345)`,
      id,
    };
  }

  const normalizedId = normalizeArxivId(id);

  try {
    const research = await getResearch();
    const result = await research.reproducePaper(normalizedId, outputDir);

    // Verify project was actually created
    if (!result.outputPath) {
      return {
        error: `Reproduction failed: No project directory was created for ${normalizedId}`,
        id: normalizedId,
        paper: result.paper || null,
      };
    }

    // Verify the directory actually exists
    const fs = await import('fs');
    if (!fs.existsSync(result.outputPath)) {
      return {
        error: `Reproduction failed: Project directory was not created at ${result.outputPath}`,
        id: normalizedId,
        paper: result.paper || null,
      };
    }

    const output = formatReproduceOutput(result, normalizedId);
    return { ...result, output };
  } catch (err) {
    return {
      error: `reproducePaper failed: ${err.message}`,
      id: normalizedId,
    };
  }
}

function formatReproduceOutput(result, id) {
  const lines = [`Reproduction Package: ${id}\n`];
  if (result.paper && result.paper.title) {
    lines.push(`Paper: ${result.paper.title}`);
  }
  if (result.outputPath) lines.push(`Project directory: ${result.outputPath}`);
  if (Array.isArray(result.requirements) && result.requirements.length > 0) {
    lines.push(`\nRequirements:\n${result.requirements.map(r => `  - ${r}`).join('\n')}`);
  }
  if (Array.isArray(result.steps) && result.steps.length > 0) {
    lines.push(`\nReproduction steps:\n${result.steps.map((s, i) => `  ${i+1}. ${s}`).join('\n')}`);
  }
  if (result.code) lines.push(`\nScaffold code preview:\n${result.code.slice(0, 300)}...`);
  return lines.join('\n');
}

async function reviewCommand(args, context) {
  const {
    topic,
    limit = 10,
    lang = 'en',
    outputDir,
  } = args;

  if (!topic) {
    return { error: 'topic is required' };
  }

  // Validate limit
  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    return {
      error: 'limit must be a number between 1 and 100',
      topic,
    };
  }

  // Validate language
  const validLangs = ['en', 'zh', 'zh-CN', 'zh-TW'];
  if (!validLangs.includes(lang)) {
    return {
      error: `Invalid language "${lang}". Supported: ${validLangs.join(', ')}`,
      topic,
      lang,
    };
  }

  try {
    const research = await getResearch();
    const result = await research.generateReview(topic, { limit, lang, outputDir });

    // Verify review was actually generated
    if (!result.outputPath && (!result.papers || result.papers.length === 0)) {
      return {
        error: `Review generation failed: No output or papers returned for topic "${topic}"`,
        topic,
      };
    }

    const output = formatReviewOutput(result, topic);
    return { ...result, output };
  } catch (err) {
    return {
      error: `generateReview failed: ${err.message}`,
      topic,
    };
  }
}

function formatReviewOutput(result, topic) {
  const lines = [`Literature Review: "${topic}"\n`];
  if (Array.isArray(result.papers) && result.papers.length > 0) {
    lines.push(`Papers analyzed: ${result.papers.length}\n`);
    result.papers.slice(0, 5).forEach((p, i) => {
      const authors = Array.isArray(p.authors) ? p.authors.slice(0,2).join(', ') : '';
      lines.push(`${i+1}. ${p.title} (${p.year || '?'})${authors ? ' — ' + authors : ''}`);
      if (p.url) lines.push(`   ${p.url}`);
    });
    if (result.papers.length > 5) lines.push(`   ... and ${result.papers.length - 5} more`);
    lines.push('');
  }
  if (result.synthesis) {
    lines.push(`Synthesis:\n${result.synthesis.slice(0, 800)}${result.synthesis.length > 800 ? '...' : ''}`);
  }
  if (Array.isArray(result.gaps) && result.gaps.length > 0) {
    lines.push(`\nResearch gaps:\n${result.gaps.map(g => `  - ${g}`).join('\n')}`);
  }
  if (result.outputPath) lines.push(`\nFull review saved to: ${result.outputPath}`);
  return lines.join('\n');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const commands = [
  {
    name: 'generate',
    description: 'Generate a complete academic paper from topic to draft',
    args: [
      { name: 'topic', type: 'string', required: true, description: 'Research topic' },
      { name: 'field', type: 'string', default: 'ai', description: 'Research field (e.g. ai, bioinformatics, cs.LG)' },
      { name: 'type', type: 'string', default: 'journal', description: 'Paper type: journal, master, phd' },
      { name: 'outputDir', type: 'string', description: 'Output directory for generated files' },
    ],
    execute: generateCommand,
  },
  {
    name: 'monitor',
    description: 'Monitor arXiv for the latest papers in specified categories',
    args: [
      { name: 'categories', type: 'array', default: ['cs.AI'], description: 'arXiv categories to monitor (e.g. cs.AI, cs.LG)' },
      { name: 'limit', type: 'number', default: 10, description: 'Number of papers to fetch' },
    ],
    execute: monitorCommand,
  },
  {
    name: 'analyze',
    description: 'Deep analysis of an arXiv paper by ID',
    args: [
      { name: 'id', type: 'string', required: true, description: 'arXiv paper ID (e.g. 2401.12345)' },
      { name: 'outputDir', type: 'string', description: 'Output directory for analysis results' },
    ],
    execute: analyzeCommand,
  },
  {
    name: 'reproduce',
    description: 'Generate reproduction package for an arXiv paper',
    args: [
      { name: 'id', type: 'string', required: true, description: 'arXiv paper ID (e.g. 2401.12345)' },
      { name: 'outputDir', type: 'string', description: 'Output directory for reproduction code' },
    ],
    execute: reproduceCommand,
  },
  {
    name: 'review',
    description: 'Generate a literature review for a given topic',
    args: [
      { name: 'topic', type: 'string', required: true, description: 'Review topic' },
      { name: 'limit', type: 'number', default: 10, description: 'Number of papers to include' },
      { name: 'lang', type: 'string', default: 'en', description: 'Output language: en, zh' },
      { name: 'outputDir', type: 'string', description: 'Output directory for review document' },
    ],
    execute: reviewCommand,
  },
];

export default { commands };
