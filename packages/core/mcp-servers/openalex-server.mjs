import readline from 'node:readline';

const OPENALEX_WORKS_URL = 'https://api.openalex.org/works';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

async function searchOpenAlex(args) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5) || 5));
  if (!query) {
    throw new Error('query is required');
  }

  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    sort: 'relevance_score:desc',
    mailto: 'research@tzukwan.io',
  });
  const response = await fetch(`${OPENALEX_WORKS_URL}?${params.toString()}`, {
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (mailto:research@tzukwan.io)',
      'accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return {
    query,
    count: items.length,
    results: items.map((item) => ({
      id: item.id,
      title: item.title || '',
      publicationYear: item.publication_year,
      citedByCount: item.cited_by_count,
      doi: item.doi || '',
      openAccessUrl: item.open_access?.oa_url || '',
      venue: item.primary_location?.source?.display_name || '',
      authors: Array.isArray(item.authorships)
        ? item.authorships.map((entry) => entry?.author?.display_name).filter(Boolean)
        : [],
      abstract: item.abstract_inverted_index ? '[OpenAlex abstract available via abstract_inverted_index]' : '',
    })),
  };
}

async function getOpenAlexWork(args) {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) {
    throw new Error('id is required');
  }
  const normalizedId = /^https?:\/\//i.test(id) ? id : `${OPENALEX_WORKS_URL}/${encodeURIComponent(id.replace(/^https?:\/\/api\.openalex\.org\/works\//i, ''))}`;
  const response = await fetch(`${normalizedId}?mailto=research@tzukwan.io`, {
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (mailto:research@tzukwan.io)',
      'accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`OpenAlex API returned ${response.status}`);
  }
  const item = await response.json();
  return {
    id: item.id,
    title: item.title || '',
    publicationYear: item.publication_year,
    citedByCount: item.cited_by_count,
    doi: item.doi || '',
    openAccessUrl: item.open_access?.oa_url || '',
    venue: item.primary_location?.source?.display_name || '',
    authors: Array.isArray(item.authorships)
      ? item.authorships.map((entry) => entry?.author?.display_name).filter(Boolean)
      : [],
    referencedWorksCount: Array.isArray(item.referenced_works) ? item.referenced_works.length : 0,
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-openalex', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'search_openalex',
          description: 'Search scholarly works in OpenAlex and return metadata.',
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
          name: 'get_openalex_work',
          description: 'Fetch metadata for a specific OpenAlex work id.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'OpenAlex work id or URL.' },
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
      if (params?.name === 'search_openalex') {
        success(id, await searchOpenAlex(params?.arguments ?? {}));
        return;
      }
      if (params?.name === 'get_openalex_work') {
        success(id, await getOpenAlexWork(params?.arguments ?? {}));
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
