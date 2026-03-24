import readline from 'node:readline';

const PUBMED_ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

async function esearch(query, limit) {
  const params = new URLSearchParams({
    db: 'pubmed',
    retmode: 'json',
    sort: 'relevance',
    retmax: String(limit),
    term: query,
  });
  const response = await fetch(`${PUBMED_ESEARCH_URL}?${params.toString()}`, {
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (+https://github.com)',
      'accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`PubMed eSearch returned ${response.status}`);
  }
  const payload = await response.json();
  const ids = Array.isArray(payload?.esearchresult?.idlist) ? payload.esearchresult.idlist : [];
  return {
    count: Number(payload?.esearchresult?.count ?? ids.length),
    ids,
  };
}

async function esummary(ids) {
  if (!ids.length) return [];
  const params = new URLSearchParams({
    db: 'pubmed',
    retmode: 'json',
    id: ids.join(','),
  });
  const response = await fetch(`${PUBMED_ESUMMARY_URL}?${params.toString()}`, {
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (+https://github.com)',
      'accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`PubMed eSummary returned ${response.status}`);
  }
  const payload = await response.json();
  return ids.map((id) => {
    const item = payload?.result?.[id] || {};
    return {
      id,
      title: item.title || '',
      pubdate: item.pubdate || '',
      source: item.source || '',
      fullJournalName: item.fulljournalname || '',
      doi: Array.isArray(item.articleids)
        ? (item.articleids.find((articleId) => articleId.idtype === 'doi')?.value || '')
        : '',
      authors: Array.isArray(item.authors) ? item.authors.map((author) => author?.name).filter(Boolean) : [],
    };
  });
}

async function searchPubMed(args) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5) || 5));
  if (!query) {
    throw new Error('query is required');
  }
  const search = await esearch(query, limit);
  const records = await esummary(search.ids);
  return {
    query,
    totalCount: search.count,
    count: records.length,
    results: records,
  };
}

async function getPubMedArticle(args) {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) {
    throw new Error('id is required');
  }
  const records = await esummary([id]);
  return {
    id,
    article: records[0] ?? null,
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-pubmed', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'search_pubmed_articles',
          description: 'Search PubMed articles and return summary metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query.' },
              limit: { type: 'number', description: 'Maximum number of results to return.' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_pubmed_article',
          description: 'Fetch PubMed summary metadata for a specific PubMed id.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'PubMed article id.' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    try {
      if (params?.name === 'search_pubmed_articles') {
        success(id, await searchPubMed(params?.arguments ?? {}));
        return;
      }
      if (params?.name === 'get_pubmed_article') {
        success(id, await getPubMedArticle(params?.arguments ?? {}));
        return;
      }
      failure(id, `Unknown tool: ${params?.name}`);
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
