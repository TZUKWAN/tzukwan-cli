import readline from 'node:readline';

const WIKIPEDIA_SEARCH_URL = 'https://en.wikipedia.org/w/api.php';
const DDG_INSTANT_URL = 'https://api.duckduckgo.com/';
const CROSSREF_URL = 'https://api.crossref.org/works';
const OPENALEX_URL = 'https://api.openalex.org/works';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(text) {
  return decodeHtml(text.replace(/<[^>]+>/g, ' '));
}

async function wikipediaFallback(query, count) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(count),
    format: 'json',
    utf8: '1',
    origin: '*',
  });
  const response = await fetch(`${WIKIPEDIA_SEARCH_URL}?${params.toString()}`, {
    headers: { 'user-agent': 'tzukwan-cli/3.0 (+https://github.com)' },
  });
  if (!response.ok) return [];

  const payload = await response.json();
  const items = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  return items.slice(0, count).map((item) => ({
    title: decodeHtml(item.title || ''),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title || '').replace(/\s+/g, '_'))}`,
    description: stripTags(item.snippet || ''),
    source: 'wikipedia',
  })).filter((item) => item.title && item.url);
}

async function instantAnswerFallback(query, count) {
  const url = `${DDG_INSTANT_URL}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'tzukwan-cli/3.0 (+https://github.com)' },
  });
  if (!response.ok) return [];

  const data = await response.json();
  const results = [];
  if (data.AbstractURL && data.AbstractText) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      description: data.AbstractText,
      source: 'duckduckgo-instant',
    });
  }
  if (Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= count) break;
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 120),
          url: topic.FirstURL,
          description: topic.Text,
          source: 'duckduckgo-instant',
        });
      } else if (Array.isArray(topic.Topics)) {
        for (const subtopic of topic.Topics) {
          if (results.length >= count) break;
          if (subtopic.FirstURL && subtopic.Text) {
            results.push({
              title: subtopic.Text.split(' - ')[0] || subtopic.Text.slice(0, 120),
              url: subtopic.FirstURL,
              description: subtopic.Text,
              source: 'duckduckgo-instant',
            });
          }
        }
      }
    }
  }

  return results.slice(0, count);
}

async function crossrefFallback(query, count) {
  const url = `${CROSSREF_URL}?rows=${count}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'tzukwan-cli/3.0 (+mailto:research@tzukwan.io)' },
  });
  if (!response.ok) return [];

  const payload = await response.json();
  const items = Array.isArray(payload?.message?.items) ? payload.message.items : [];
  return items.slice(0, count).map((item) => ({
    title: Array.isArray(item.title) ? (item.title[0] || query) : (item.title || query),
    url: item.URL || '',
    description: [item['container-title']?.[0], item.publisher, item.published?.['date-parts']?.[0]?.[0]].filter(Boolean).join(' | '),
    source: 'crossref',
  })).filter((item) => item.title && item.url);
}

async function openAlexFallback(query, count) {
  const params = new URLSearchParams({
    search: query,
    per_page: String(count),
    mailto: 'research@tzukwan.io',
  });
  const response = await fetch(`${OPENALEX_URL}?${params.toString()}`, {
    headers: { 'user-agent': 'tzukwan-cli/3.0 (mailto:research@tzukwan.io)' },
  });
  if (!response.ok) return [];

  const payload = await response.json();
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return items.slice(0, count).map((item) => ({
    title: item.title || query,
    url: item.open_access?.oa_url || item.id || '',
    description: [
      item.primary_location?.source?.display_name,
      item.publication_year,
      item.cited_by_count != null ? `Citations ${item.cited_by_count}` : '',
    ].filter(Boolean).join(' | '),
    source: 'openalex',
  })).filter((item) => item.title && item.url);
}

async function braveWebSearch(args) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const count = Math.max(1, Math.min(10, Number(args?.count ?? args?.maxResults ?? 5) || 5));
  if (!query) throw new Error('query is required');

  const looksAcademic = /\b(?:paper|papers|research|citation|doi|dataset|benchmark|journal|study|survey|arxiv|pubmed|openalex|semantic scholar)\b/i.test(query);
  const primaryResults = looksAcademic
    ? await openAlexFallback(query, count)
    : await wikipediaFallback(query, count);
  const instantResults = primaryResults.length > 0 ? [] : await instantAnswerFallback(query, count);
  const scholarlyResults = primaryResults.length > 0 || instantResults.length > 0 ? [] : await crossrefFallback(query, count);
  const finalResults = primaryResults.length > 0 ? primaryResults : (instantResults.length > 0 ? instantResults : scholarlyResults);
  return {
    query,
    count: finalResults.length,
    results: finalResults,
    degraded: true,
    provider: primaryResults.length > 0
      ? (looksAcademic ? 'openalex' : 'wikipedia')
      : (instantResults.length > 0 ? 'duckduckgo-instant' : 'crossref'),
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-brave-fallback', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'brave_web_search',
          description: 'Search the web without API credentials using bundled open sources and scholarly backups.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query.' },
              count: { type: 'number', description: 'Maximum number of results.' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    if (params?.name !== 'brave_web_search') {
      failure(id, `Unknown tool: ${params?.name}`);
      return;
    }
    try {
      success(id, await braveWebSearch(params?.arguments ?? {}));
    } catch (error) {
      failure(id, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (typeof id === 'number') {
    failure(id, `Unsupported method: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    await handleRequest(JSON.parse(trimmed));
  } catch (error) {
    let fallbackId;
    try {
      fallbackId = JSON.parse(trimmed)?.id;
    } catch {
      fallbackId = undefined;
    }
    if (typeof fallbackId === 'number') {
      failure(fallbackId, error instanceof Error ? error.message : String(error));
    }
  }
});
