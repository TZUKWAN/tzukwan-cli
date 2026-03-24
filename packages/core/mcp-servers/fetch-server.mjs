import readline from 'node:readline';

const MAX_RESPONSE_CHARS = 200000;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

function normalizeText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchUrl(args) {
  const url = typeof args?.url === 'string' ? args.url.trim() : '';
  if (!url) {
    throw new Error('url is required');
  }

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'tzukwan-cli/3.0 (+https://github.com)',
      'accept': 'text/html, text/plain, application/xhtml+xml, application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();
  const normalized = normalizeText(body);

  return {
    url,
    status: response.status,
    ok: response.ok,
    contentType,
    content: normalized.slice(0, MAX_RESPONSE_CHARS),
    truncated: normalized.length > MAX_RESPONSE_CHARS,
  };
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-fetch', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }

  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'fetch_url',
          description: 'Fetch web content from a URL and return normalized text.',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch.' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    if (toolName !== 'fetch_url') {
      failure(id, `Unknown tool: ${toolName}`);
      return;
    }
    try {
      success(id, await fetchUrl(params?.arguments ?? {}));
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
