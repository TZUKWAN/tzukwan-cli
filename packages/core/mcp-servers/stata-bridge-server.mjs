import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

function possibleStataExecutables() {
  const envPath = process.env.STATA_EXE ? [process.env.STATA_EXE] : [];
  if (process.platform !== 'win32') {
    return [...envPath, '/usr/local/bin/stata-mp', '/usr/local/bin/stata-se', '/usr/local/bin/stata'];
  }
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramW6432'],
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean);
  const names = [
    'StataMP-64.exe',
    'StataSE-64.exe',
    'StataBE-64.exe',
    'StataMP.exe',
    'StataSE.exe',
    'StataBE.exe',
  ];
  const matches = [];
  for (const root of roots) {
    for (const folder of ['Stata18', 'Stata17', 'Stata16']) {
      for (const exe of names) {
        const candidate = path.join(root, folder, exe);
        if (fs.existsSync(candidate)) {
          matches.push(candidate);
        }
      }
    }
  }
  return [...envPath, ...matches];
}

function findStataExecutable() {
  return possibleStataExecutables().find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

async function detectStata() {
  const executable = findStataExecutable();
  return {
    available: !!executable,
    executable,
    searched: possibleStataExecutables(),
  };
}

async function writeStataDo(args) {
  const script = typeof args?.script === 'string' ? args.script : '';
  const outputPath = typeof args?.outputPath === 'string' && args.outputPath.trim()
    ? path.resolve(args.outputPath)
    : path.join(process.cwd(), 'stata', `analysis_${Date.now()}.do`);
  if (!script.trim()) {
    throw new Error('script is required');
  }
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, script, 'utf-8');
  return { path: outputPath, bytesWritten: Buffer.byteLength(script, 'utf-8') };
}

async function runStataDo(args) {
  const executable = findStataExecutable();
  if (!executable) {
    throw new Error('Stata executable not found. Set STATA_EXE or install Stata.');
  }
  const doPath = typeof args?.doPath === 'string' ? path.resolve(args.doPath) : '';
  if (!doPath || !fs.existsSync(doPath)) {
    throw new Error('doPath is required and must exist');
  }
  const cwd = typeof args?.cwd === 'string' && args.cwd.trim() ? path.resolve(args.cwd) : path.dirname(doPath);
  const timeoutMs = Math.max(1000, Math.min(600000, Number(args?.timeoutMs ?? 120000) || 120000));
  const argsList = process.platform === 'win32'
    ? ['/e', 'do', doPath]
    : ['-b', 'do', doPath];
  const { stdout, stderr } = await execFileAsync(executable, argsList, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { executable, doPath, cwd, stdout, stderr, timeoutMs };
}

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-stata-bridge', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }
  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'detect_stata',
          description: 'Detect a local Stata installation and return the executable path if available.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'write_stata_do',
          description: 'Write a Stata .do file for later execution.',
          inputSchema: {
            type: 'object',
            properties: {
              script: { type: 'string', description: 'Stata do-file contents.' },
              outputPath: { type: 'string', description: 'Optional output .do path.' },
            },
            required: ['script'],
            additionalProperties: false,
          },
        },
        {
          name: 'run_stata_do',
          description: 'Execute a local Stata do-file in batch mode.',
          inputSchema: {
            type: 'object',
            properties: {
              doPath: { type: 'string', description: 'Path to an existing .do file.' },
              cwd: { type: 'string', description: 'Optional working directory.' },
              timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds.' },
            },
            required: ['doPath'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (method === 'tools/call') {
    try {
      if (params?.name === 'detect_stata') {
        success(id, await detectStata());
        return;
      }
      if (params?.name === 'write_stata_do') {
        success(id, await writeStataDo(params?.arguments ?? {}));
        return;
      }
      if (params?.name === 'run_stata_do') {
        success(id, await runStataDo(params?.arguments ?? {}));
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
