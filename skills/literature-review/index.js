/**
 * Literature Review Skill
 * Commands: search, generate, cluster, gaps, export
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

// Skill metadata
export const name = 'literature-review';
export const description = 'Academic literature search and review generation';
export const version = '1.0.0';

// Command definitions
export const commands = [
  {
    name: 'search',
    description: 'Search academic papers from arXiv',
    args: [
      { name: 'query', type: 'string', required: true },
      { name: 'sources', type: 'array', default: ['arxiv'] },
      { name: 'limit', type: 'number', default: 20 },
      { name: 'dateFrom', type: 'string', required: false },
      { name: 'dateTo', type: 'string', required: false }
    ]
  },
  {
    name: 'generate',
    description: 'Generate literature review from papers',
    args: [
      { name: 'topic', type: 'string', required: true },
      { name: 'papers', type: 'array', required: true },
      { name: 'style', type: 'string', default: 'academic' },
      { name: 'lang', type: 'string', default: 'en' }
    ]
  },
  {
    name: 'cluster',
    description: 'Cluster papers by topic/themes',
    args: [
      { name: 'papers', type: 'array', required: true }
    ]
  },
  {
    name: 'gaps',
    description: 'Analyze research gaps and opportunities',
    args: [
      { name: 'topic', type: 'string', required: true },
      { name: 'papers', type: 'array', required: true }
    ]
  },
  {
    name: 'export',
    description: 'Export papers to various formats',
    args: [
      { name: 'papers', type: 'array', required: true },
      { name: 'format', type: 'string', default: 'bibtex' },
      { name: 'output', type: 'string', required: false }
    ]
  }
];

/**
 * Search papers from arXiv API
 */
export async function search(args) {
  const { query, sources = ['arxiv'], limit = 20, dateFrom, dateTo } = args;

  if (!query) {
    throw new Error('Query parameter is required');
  }

  const results = { papers: [], total: 0 };

  for (const source of sources) {
    if (source === 'arxiv') {
      try {
        const arxivResults = await searchArXiv(query, limit, dateFrom, dateTo);
        results.papers.push(...arxivResults.papers);
        results.total += arxivResults.total;
      } catch (error) {
        console.error(`arXiv search error: ${error.message}`);
        // Continue with other sources
      }
    }
  }

  return results;
}

/**
 * Search arXiv API
 */
function searchArXiv(query, limit, dateFrom, dateTo) {
  return new Promise((resolve, reject) => {
    let searchQuery = encodeURIComponent(query);
    let url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&max_results=${limit}&sortBy=relevance`;

    if (dateFrom) {
      url += `&start_date=${dateFrom}`;
    }
    if (dateTo) {
      url += `&end_date=${dateTo}`;
    }

    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const papers = parseArXivXML(data);
          resolve({ papers, total: papers.length });
        } catch (error) {
          reject(new Error(`Failed to parse arXiv response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parse arXiv Atom XML response using string methods
 */
function parseArXivXML(xml) {
  const papers = [];

  // Extract entries using regex
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const id = extractTag(entry, 'id') || '';
    const title = cleanText(extractTag(entry, 'title') || '');
    const summary = cleanText(extractTag(entry, 'summary') || '');
    const published = extractTag(entry, 'published') || '';

    // Extract authors
    const authors = [];
    const authorRegex = /<author[^>]*>([\s\S]*?)<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      const name = extractTag(authorMatch[1], 'name');
      if (name) authors.push(name);
    }

    // Extract arXiv ID from URL
    const arxivId = id.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');

    papers.push({
      id: arxivId,
      title,
      authors,
      abstract: summary,
      published,
      url: id,
      source: 'arxiv'
    });
  }

  return papers;
}

/**
 * Extract content from XML tag
 */
function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\s\S]*?)<\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Clean text content
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Generate literature review from papers
 */
export async function generate(args) {
  const { topic, papers, style = 'academic', lang = 'en' } = args;

  if (!topic) {
    throw new Error('Topic parameter is required');
  }

  if (!papers || !Array.isArray(papers) || papers.length === 0) {
    throw new Error('Papers array is required and must not be empty');
  }

  // Check if llmClient is available (passed from context)
  const llmClient = args.llmClient || global.llmClient;

  if (llmClient) {
    return await generateWithLLM(llmClient, topic, papers, style, lang);
  } else {
    return generateTemplateReview(topic, papers, style, lang);
  }
}

/**
 * Generate review using LLM
 */
async function generateWithLLM(llmClient, topic, papers, style, lang) {
  const prompt = buildReviewPrompt(topic, papers, style, lang);

  try {
    const response = await llmClient.chat([{role:"user",content:prompt}]);
    return response.content || "";
  } catch (error) {
    console.error(`LLM generation failed: ${error.message}`);
    // Fall back to template
    return generateTemplateReview(topic, papers, style, lang);
  }
}

/**
 * Build prompt for LLM
 */
function buildReviewPrompt(topic, papers, style, lang) {
  const paperSummaries = papers.map((p, i) =>
    `[${i + 1}] ${p.title} by ${(p.authors ?? []).join(', ')}\nAbstract: ${p.abstract?.substring(0, 300)}...`
  ).join('\n\n');

  const styleGuide = {
    academic: 'Formal academic style with proper citations',
    technical: 'Technical report style focusing on methodologies',
    survey: 'Comprehensive survey covering all major approaches'
  };

  return `Write a comprehensive literature review on "${topic}".

Style: ${styleGuide[style] || styleGuide.academic}
Language: ${lang}

Papers to include:
${paperSummaries}

Structure:
1. Introduction - overview of the field
2. Background - key concepts and terminology
3. Main Approaches - categorize and discuss methods
4. Comparison - strengths and weaknesses
5. Future Directions - emerging trends
6. Conclusion - summary of findings

Use proper citations like [1], [2], etc. referencing the paper numbers above.`;
}

/**
 * Generate template review without LLM
 */
function generateTemplateReview(topic, papers, style, lang) {
  const citations = papers.map((p, i) =>
    `[${i + 1}] ${(p.authors ?? []).join(', ')}. "${p.title}". ${p.published ? new Date(p.published).getFullYear() : 'N/A'}. ${p.url}`
  );

  // Extract keywords for categorization
  const keywords = extractKeywords(papers);

  let review = `# Literature Review: ${topic}\n\n`;

  review += `## 1. Introduction\n\n`;
  review += `This review examines ${papers.length} papers related to ${topic}. `;
  review += `The field has seen significant development with contributions from researchers worldwide.\n\n`;

  review += `## 2. Key Themes and Approaches\n\n`;

  // Group by keywords
  const themes = groupByKeywords(papers, keywords.slice(0, 5));
  for (const [theme, themePapers] of Object.entries(themes)) {
    if (themePapers.length > 0) {
      review += `### ${theme.charAt(0).toUpperCase() + theme.slice(1)}\n\n`;
      for (const p of themePapers.slice(0, 3)) {
        const idx = papers.indexOf(p) + 1;
        review += `- ${p.title} [${idx}]: ${p.abstract?.substring(0, 150)}...\n\n`;
      }
    }
  }

  review += `## 3. Research Timeline\n\n`;
  const sortedPapers = [...papers].sort((a, b) =>
    new Date(b.published || 0) - new Date(a.published || 0)
  );
  review += `Recent developments (${sortedPapers.slice(0, 5).map(p => new Date(p.published).getFullYear()).join(', ')}):\n\n`;
  sortedPapers.slice(0, 5).forEach((p, i) => {
    const idx = papers.indexOf(p) + 1;
    review += `- [${idx}] ${p.title}\n`;
  });

  review += `\n## 4. References\n\n`;
  citations.forEach(c => {
    review += `${c}\n\n`;
  });

  return review;
}

/**
 * Cluster papers by topics
 */
export async function cluster(args) {
  const { papers } = args;

  if (!papers || !Array.isArray(papers) || papers.length === 0) {
    throw new Error('Papers array is required');
  }

  // Extract all keywords
  const keywords = extractKeywords(papers);

  // Create clusters based on keyword overlap
  const clusters = {};
  const unclustered = [];

  // Initialize clusters for top keywords
  keywords.slice(0, 8).forEach(kw => {
    clusters[kw] = { name: kw.charAt(0).toUpperCase() + kw.slice(1), papers: [] };
  });

  // Assign papers to clusters
  papers.forEach(paper => {
    const paperText = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
    let assigned = false;

    for (const [kw, cluster] of Object.entries(clusters)) {
      if (paperText.includes(kw.toLowerCase())) {
        cluster.papers.push(paper);
        assigned = true;
      }
    }

    if (!assigned) {
      unclustered.push(paper);
    }
  });

  // Remove empty clusters
  const result = {};
  for (const [kw, cluster] of Object.entries(clusters)) {
    if (cluster.papers.length > 0) {
      result[cluster.name] = cluster.papers;
    }
  }

  if (unclustered.length > 0) {
    result['Other'] = unclustered;
  }

  return result;
}

/**
 * Analyze research gaps
 */
export async function gaps(args) {
  const { topic, papers } = args;

  if (!topic) {
    throw new Error('Topic parameter is required');
  }

  if (!papers || !Array.isArray(papers) || papers.length === 0) {
    throw new Error('Papers array is required');
  }

  const llmClient = args.llmClient || global.llmClient;

  if (llmClient) {
    return await analyzeGapsWithLLM(llmClient, topic, papers);
  } else {
    return analyzeGapsHeuristic(topic, papers);
  }
}

/**
 * Analyze gaps using LLM
 */
async function analyzeGapsWithLLM(llmClient, topic, papers) {
  const prompt = `Analyze research gaps in the field of "${topic}" based on these ${papers.length} papers.

Papers:
${papers.map((p, i) => `${i + 1}. ${p.title}: ${p.abstract?.substring(0, 200)}`).join('\n')}

Identify:
1. Research gaps - what is missing or underexplored
2. Opportunities - promising directions for future work

Return as JSON: { "gaps": [...], "opportunities": [...] }`;

  try {
    const response = await llmClient.chat([{role:"user",content:prompt}]);
    // Try to parse JSON from response
    const _rText = typeof response === "string" ? response : (response.content || "");
    const jsonMatch = _rText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error(`LLM gap analysis failed: ${error.message}`);
  }

  return analyzeGapsHeuristic(topic, papers);
}

/**
 * Heuristic gap analysis
 */
function analyzeGapsHeuristic(topic, papers) {
  const keywords = extractKeywords(papers);
  const years = papers.map(p => p.published ? new Date(p.published).getFullYear() : null).filter(Boolean);
  const yearRange = years.length > 0 ? { min: Math.min(...years), max: Math.max(...years) } : null;

  const gaps = [];
  const opportunities = [];

  // Analyze keyword diversity
  if (keywords.length < 5) {
    gaps.push('Limited diversity in research approaches and methodologies');
    opportunities.push('Explore alternative paradigms and cross-disciplinary approaches');
  }

  // Analyze temporal distribution
  if (yearRange) {
    const recentPapers = years.filter(y => y >= yearRange.max - 2).length;
    if (recentPapers < papers.length * 0.2) {
      gaps.push('Limited recent research activity in this area');
      opportunities.push('Revisit with modern techniques and larger datasets');
    }
  }

  // Analyze author diversity
  const allAuthors = papers.flatMap(p => p.authors);
  const uniqueAuthors = new Set(allAuthors);
  if (uniqueAuthors.size < papers.length * 0.5) {
    gaps.push('Research concentrated among few research groups');
    opportunities.push('Validate findings across different institutions and contexts');
  }

  // General gaps
  gaps.push('Need for comprehensive benchmark comparisons');
  gaps.push('Limited real-world deployment studies');

  opportunities.push('Develop standardized evaluation frameworks');
  opportunities.push('Investigate practical implementation challenges');
  opportunities.push('Explore integration with complementary techniques');

  return { gaps, opportunities };
}

/**
 * Export papers to various formats
 */
export async function exportPapers(args) {
  const { papers, format = 'bibtex', output } = args;

  if (!papers || !Array.isArray(papers) || papers.length === 0) {
    throw new Error('Papers array is required');
  }

  let content;

  switch (format.toLowerCase()) {
    case 'bibtex':
      content = exportBibTeX(papers);
      break;
    case 'markdown':
      content = exportMarkdown(papers);
      break;
    case 'json':
      content = JSON.stringify(papers, null, 2);
      break;
    case 'csv':
      content = exportCSV(papers);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  if (output) {
    fs.writeFileSync(output, content, 'utf8');
    return { success: true, format, output, count: papers.length };
  }

  return { content, format, count: papers.length };
}

// Alias for export command
export { exportPapers as export };

/**
 * Export to BibTeX format
 */
function exportBibTeX(papers) {
  return papers.map(paper => {
    const key = paper.id || (paper.title ?? '').toLowerCase().replace(/\s+/g, '_').substring(0, 20) || 'unknown';
    const year = paper.published ? new Date(paper.published).getFullYear() : 'N/A';
    const authorStr = paper.authors?.join(' and ') || 'Unknown';

    return `@article{${key},
  title = {${paper.title}},
  author = {${authorStr}},
  year = {${year}},
  journal = {arXiv preprint},
  url = {${paper.url || ''}},
  abstract = {${paper.abstract || ''}}
}`;
  }).join('\n\n');
}

/**
 * Export to Markdown format
 */
function exportMarkdown(papers) {
  let md = '# References\n\n';
  papers.forEach((paper, i) => {
    const year = paper.published ? new Date(paper.published).getFullYear() : 'N/A';
    md += `${i + 1}. **${paper.title}**\n`;
    md += `   - Authors: ${paper.authors?.join(', ') || 'Unknown'}\n`;
    md += `   - Year: ${year}\n`;
    md += `   - URL: ${paper.url || 'N/A'}\n`;
    md += `   - Abstract: ${paper.abstract?.substring(0, 200)}...\n\n`;
  });
  return md;
}

/**
 * Export to CSV format
 */
function exportCSV(papers) {
  const headers = ['ID', 'Title', 'Authors', 'Year', 'URL', 'Abstract'];
  const rows = papers.map(p => [
    p.id || '',
    `"${(p.title || '').replace(/"/g, '""')}"`,
    `"${(p.authors || []).join('; ').replace(/"/g, '""')}"`,
    p.published ? new Date(p.published).getFullYear() : '',
    p.url || '',
    `"${(p.abstract || '').replace(/"/g, '""').substring(0, 500)}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Extract keywords from papers
 */
function extractKeywords(papers) {
  const text = papers.map(p => `${p.title} ${p.abstract || ''}`).join(' ').toLowerCase();

  // Common academic keywords to track
  const commonKeywords = [
    'neural', 'network', 'deep', 'learning', 'machine', 'model', 'algorithm',
    'classification', 'regression', 'clustering', 'optimization', 'training',
    'dataset', 'feature', 'prediction', 'analysis', 'framework', 'method',
    'approach', 'system', 'performance', 'accuracy', 'evaluation'
  ];

  const keywordCounts = {};
  commonKeywords.forEach(kw => {
    const count = (text.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length;
    if (count > 0) {
      keywordCounts[kw] = count;
    }
  });

  // Sort by frequency
  return Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);
}

/**
 * Group papers by keywords
 */
function groupByKeywords(papers, keywords) {
  const groups = {};

  keywords.forEach(kw => {
    groups[kw] = papers.filter(p => {
      const text = `${p.title} ${p.abstract || ''}`.toLowerCase();
      return text.includes(kw.toLowerCase());
    });
  });

  return groups;
}

// Wire execute methods into commands array
commands.find(c => c.name === 'search').execute   = (args, ctx) => search({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'generate').execute = (args, ctx) => generate({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'cluster').execute  = (args, ctx) => cluster({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'gaps').execute     = (args, ctx) => gaps({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'export').execute   = (args, ctx) => exportPapers({...args, llmClient: ctx?.llmClient});

// Default export
export default {
  name,
  description,
  version,
  commands,
  search,
  generate,
  cluster,
  gaps,
  export: exportPapers
};
