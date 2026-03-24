import readline from 'node:readline';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function extractAuthors(block) {
  return Array.from(block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi))
    .map((match) => decodeXml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseEntries(xml) {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)).map((match) => {
    const block = match[1];
    const links = Array.from(block.matchAll(/<link\s+([^>]+?)\/?>/gi))
      .map((linkMatch) => {
        const attrs = linkMatch[1];
        const href = attrs.match(/href="([^"]+)"/i)?.[1] ?? '';
        const title = attrs.match(/title="([^"]+)"/i)?.[1] ?? '';
        const rel = attrs.match(/rel="([^"]+)"/i)?.[1] ?? '';
        return { href, title, rel };
      });

    return {
      id: extractTag(block, 'id'),
      title: extractTag(block, 'title'),
      summary: extractTag(block, 'summary'),
      published: extractTag(block, 'published'),
      updated: extractTag(block, 'updated'),
      authors: extractAuthors(block),
      pdfUrl: links.find((link) => link.title === 'pdf')?.href ?? '',
    };
  });
}

async function searchArxiv(args) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5) || 5));
  if (!query) {
    throw new Error('query is required');
  }

  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (+https://github.com)',
      'accept': 'application/atom+xml, application/xml, text/xml',
    },
  });
  if (!response.ok) {
    throw new Error(`arXiv API returned ${response.status}`);
  }

  const xml = await response.text();
  return {
    query,
    totalResults: extractTag(xml, 'opensearch:totalResults') || undefined,
    entries: parseEntries(xml),
  };
}

async function getPaper(args) {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) {
    throw new Error('id is required');
  }

  const normalizedId = id.replace(/^arxiv:/i, '');
  const result = await searchArxiv({ query: `id:${normalizedId}`, limit: 1 });
  return {
    id: normalizedId,
    paper: result.entries[0] ?? null,
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-arxiv', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'search_arxiv',
          description: 'Search arXiv papers and return metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query for arXiv.' },
              limit: { type: 'number', description: 'Maximum number of results to return.' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_arxiv_paper',
          description: 'Fetch metadata for a specific arXiv paper id.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'arXiv paper id, with or without arxiv: prefix.' },
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
    const toolName = params?.name;
    try {
      if (toolName === 'search_arxiv') {
        success(id, await searchArxiv(params?.arguments ?? {}));
        return;
      }
      if (toolName === 'get_arxiv_paper') {
        success(id, await getPaper(params?.arguments ?? {}));
        return;
      }
      failure(id, `Unknown tool: ${toolName}`);
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
