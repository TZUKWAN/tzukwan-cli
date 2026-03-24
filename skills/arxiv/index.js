/**
 * arXiv Skill - Paper search, fetch, monitor and analysis
 * Commands: search, fetch, monitor, analyze
 */

import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

// arXiv API base URL
const ARXIV_API_BASE = 'https://export.arxiv.org/api';

/**
 * Make HTTP GET request with timeout
 * @param {string} url - Request URL
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string>} Response body
 */
function httpGet(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'application/atom+xml, application/xml, text/xml',
        'User-Agent': 'tzukwan-cli/1.0'
      },
      timeout: timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Parse arXiv Atom XML response
 * @param {string} xml - XML response body
 * @returns {Array} Parsed papers
 */
function parseArxivXml(xml) {
  const papers = [];

  // Extract entries using regex
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    // Extract ID
    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    const id = idMatch ? idMatch[1].split('/').pop().replace('abs/', '') : '';

    // Extract title
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    // Extract summary (abstract)
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

    // Extract published date
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const published = publishedMatch ? publishedMatch[1] : '';

    // Extract updated date
    const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
    const updated = updatedMatch ? updatedMatch[1] : '';

    // Extract authors
    const authors = [];
    const authorRegex = /<author[^>]*>([\s\S]*?)<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      const authorBlock = authorMatch[1];
      const nameMatch = authorBlock.match(/<name>([^<]+)<\/name>/);
      if (nameMatch) {
        authors.push(nameMatch[1].trim());
      }
    }

    // Extract categories
    const categories = [];
    const categoryRegex = /<category[^>]*term="([^"]+)"[^>]*\/>/g;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(entry)) !== null) {
      categories.push(categoryMatch[1]);
    }

    // Also check for primary category
    const primaryCatMatch = entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"[^>]*\/>/);
    if (primaryCatMatch && !categories.includes(primaryCatMatch[1])) {
      categories.unshift(primaryCatMatch[1]);
    }

    // Extract links
    let pdfUrl = '';
    const linkRegex = /<link[^>]*href="([^"]+)"[^>]*\/?>/g;
    const linkTypeRegex = /<link[^>]*type="([^"]+)"[^>]*\/?>/g;

    // Find PDF link
    const linkMatches = entry.match(/<link[^>]*\/?>/g) || [];
    for (const linkTag of linkMatches) {
      if (linkTag.includes('type="application/pdf"')) {
        const hrefMatch = linkTag.match(/href="([^"]+)"/);
        if (hrefMatch) {
          pdfUrl = hrefMatch[1];
        }
      }
    }

    papers.push({
      id,
      title,
      abstract,
      published,
      updated,
      authors,
      categories,
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: pdfUrl || `https://arxiv.org/pdf/${id}.pdf`
    });
  }

  return papers;
}

/**
 * Filter papers by date range
 * @param {Array} papers - Papers array
 * @param {number} days - Number of days to look back
 * @returns {Array} Filtered papers
 */
function filterByDate(papers, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return papers.filter(paper => {
    const published = new Date(paper.published);
    return published >= cutoff;
  });
}

/**
 * Format paper output
 * @param {Object} paper - Paper object
 * @param {string} format - Output format ('text' or 'json')
 * @returns {string} Formatted output
 */
function formatPaper(paper, format = 'text') {
  if (format === 'json') {
    return JSON.stringify(paper, null, 2);
  }

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 ${paper.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: ${paper.id}
👥 Authors: ${paper.authors.join(', ')}
📅 Published: ${paper.published}
🏷️ Categories: ${paper.categories.join(', ')}
🔗 URL: ${paper.url}
📥 PDF: ${paper.pdfUrl}

📝 Abstract:
${paper.abstract}
`;
}

/**
 * Search command - Search arXiv papers
 */
async function searchCommand(args, context) {
  const {
    query,
    limit = 10,
    days,
    category,
    format = 'text'
  } = args;

  if (!query) {
    return { error: 'Query parameter is required' };
  }

  try {
    // Build search query
    let searchQuery = query;
    if (category) {
      searchQuery = `cat:${category} AND (${query})`;
    }

    // Build URL
    const url = `${ARXIV_API_BASE}/query?search_query=${encodeURIComponent(searchQuery)}&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;

    // Make request
    const xml = await httpGet(url, 3000);

    // Parse response
    let papers = parseArxivXml(xml);

    // Filter by date if specified
    if (days && !isNaN(parseInt(days))) {
      papers = filterByDate(papers, parseInt(days));
    }

    // Format output
    const total = papers.length;

    if (format === 'json') {
      return { papers, total };
    }

    // Text format
    let output = `\n🔍 arXiv Search Results\n`;
    output += `Query: "${query}"\n`;
    if (category) output += `Category: ${category}\n`;
    if (days) output += `Last ${days} days\n`;
    output += `Found: ${total} papers\n`;

    for (const paper of papers) {
      output += formatPaper(paper, 'text');
    }

    return {
      papers,
      total,
      output
    };

  } catch (error) {
    return {
      error: `Search failed: ${error.message}`,
      papers: [],
      total: 0
    };
  }
}

/**
 * Fetch command - Get paper by ID
 */
async function fetchCommand(args, context) {
  const { id, format = 'text' } = args;

  if (!id) {
    return { error: 'Paper ID is required' };
  }

  // Clean ID (remove arxiv: prefix if present)
  const cleanId = id.replace(/^arxiv:/i, '').trim();

  try {
    const url = `${ARXIV_API_BASE}/query?id_list=${encodeURIComponent(cleanId)}`;
    const xml = await httpGet(url, 3000);

    const papers = parseArxivXml(xml);

    if (papers.length === 0) {
      return { error: `Paper not found: ${cleanId}` };
    }

    const paper = papers[0];

    if (format === 'json') {
      return { paper };
    }

    return {
      paper,
      output: formatPaper(paper, 'text')
    };

  } catch (error) {
    return {
      error: `Fetch failed: ${error.message}`
    };
  }
}

/**
 * Monitor command - Set up monitoring for new papers
 */
async function monitorCommand(args, context) {
  const {
    query,
    category,
    interval = '24h',
    format = 'text'
  } = args;

  if (!query) {
    return { error: 'Query parameter is required' };
  }

  const workDir = context.workDir || process.cwd();
  const monitorFile = path.join(workDir, '.tzukwan-monitor.json');

  try {
    // Save monitor config
    const config = {
      type: 'arxiv',
      query,
      category,
      interval,
      createdAt: new Date().toISOString(),
      lastCheck: new Date().toISOString()
    };

    fs.writeFileSync(monitorFile, JSON.stringify(config, null, 2));

    // Perform initial search
    const searchResult = await searchCommand({
      query,
      category,
      limit: 5,
      format
    }, context);

    const message = `Monitor configured for "${query}"${category ? ` in ${category}` : ''}\nConfig saved to: ${monitorFile}\nInterval: ${interval}`;

    return {
      message,
      papers: searchResult.papers || [],
      configSaved: true,
      config,
      output: format === 'text' ? `${message}\n\nInitial search results:\n${searchResult.output || ''}` : undefined
    };

  } catch (error) {
    return {
      error: `Monitor setup failed: ${error.message}`,
      configSaved: false
    };
  }
}

/**
 * Analyze command - Analyze paper using LLM
 */
async function analyzeCommand(args, context) {
  const {
    id,
    aspects = 'contributions,methods,limitations',
    format = 'text'
  } = args;

  if (!id) {
    return { error: 'Paper ID is required' };
  }

  // First fetch the paper
  const fetchResult = await fetchCommand({ id, format: 'json' }, context);

  if (fetchResult.error) {
    return fetchResult;
  }

  const paper = fetchResult.paper;

  // Check if LLM is available
  const llmClient = context.llmClient;

  if (!llmClient || typeof llmClient.chat !== 'function') {
    // No-LLM fallback mode
    const fallbackResult = {
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        categories: paper.categories,
        published: paper.published,
        abstract: paper.abstract,
        url: paper.url
      },
      analysis: null,
      note: 'LLM not available. Returning paper metadata only.',
      aspects: aspects.split(',').map(a => a.trim())
    };

    if (format === 'json') {
      return fallbackResult;
    }

    return {
      ...fallbackResult,
      output: `
📄 Paper Analysis (Metadata Only - LLM unavailable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Categories: ${paper.categories.join(', ')}
Published: ${paper.published}

Abstract:
${paper.abstract}

Requested aspects: ${aspects}

Note: LLM client not available. Install/configure LLM to get full analysis.
`
    };
  }

  // Perform LLM analysis
  try {
    const aspectList = aspects.split(',').map(a => a.trim());

    const prompt = `Analyze the following arXiv paper and provide insights on these aspects: ${aspectList.join(', ')}.

Paper Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Categories: ${paper.categories.join(', ')}
Published: ${paper.published}

Abstract:
${paper.abstract}

Please provide a structured analysis covering each requested aspect.`;

    const llmResponse = await llmClient.chat([
      { role: 'system', content: 'You are a research paper analysis assistant. Provide clear, structured analysis of academic papers.' },
      { role: 'user', content: prompt }
    ]);

    const analysis = llmResponse.content || llmResponse.message || llmResponse;

    const result = {
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        categories: paper.categories,
        published: paper.published,
        url: paper.url
      },
      analysis,
      aspects: aspectList
    };

    if (format === 'json') {
      return result;
    }

    return {
      ...result,
      output: `
📄 Paper Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Categories: ${paper.categories.join(', ')}
Published: ${paper.published}
URL: ${paper.url}

🔍 Analysis (${aspects}):
${analysis}
`
    };

  } catch (error) {
    // LLM error fallback
    return {
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        categories: paper.categories,
        published: paper.published,
        abstract: paper.abstract,
        url: paper.url
      },
      analysis: null,
      error: `LLM analysis failed: ${error.message}`,
      aspects: aspects.split(',').map(a => a.trim())
    };
  }
}

// Export commands
export const commands = [
  {
    name: 'search',
    description: 'Search arXiv papers by query',
    args: [
      { name: 'query', type: 'string', required: true, description: 'Search query' },
      { name: 'limit', type: 'number', default: 10, description: 'Maximum results (default: 10)' },
      { name: 'days', type: 'number', description: 'Filter papers from last N days' },
      { name: 'category', type: 'string', description: 'arXiv category filter (e.g., cs.AI, cs.CL)' },
      { name: 'format', type: 'string', default: 'text', description: 'Output format: text or json' }
    ],
    execute: searchCommand
  },
  {
    name: 'fetch',
    description: 'Fetch paper details by arXiv ID',
    args: [
      { name: 'id', type: 'string', required: true, description: 'arXiv paper ID (e.g., 2401.12345)' },
      { name: 'format', type: 'string', default: 'text', description: 'Output format: text or json' }
    ],
    execute: fetchCommand
  },
  {
    name: 'monitor',
    description: 'Monitor arXiv for new papers matching query',
    args: [
      { name: 'query', type: 'string', required: true, description: 'Search query to monitor' },
      { name: 'category', type: 'string', description: 'arXiv category filter' },
      { name: 'interval', type: 'string', default: '24h', description: 'Check interval (default: 24h)' },
      { name: 'format', type: 'string', default: 'text', description: 'Output format: text or json' }
    ],
    execute: monitorCommand
  },
  {
    name: 'analyze',
    description: 'Analyze paper using LLM',
    args: [
      { name: 'id', type: 'string', required: true, description: 'arXiv paper ID' },
      { name: 'aspects', type: 'string', default: 'contributions,methods,limitations', description: 'Analysis aspects (comma-separated)' },
      { name: 'format', type: 'string', default: 'text', description: 'Output format: text or json' }
    ],
    execute: analyzeCommand
  }
];

// Default export
export default { commands };
