import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

function possibleMatlabExecutables() {
  const envPath = process.env.MATLAB_EXE ? [process.env.MATLAB_EXE] : [];
  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramW6432'],
      process.env['ProgramFiles(x86)'],
    ].filter(Boolean);
    const matches = [];
    for (const root of roots) {
      const matlabRoot = path.join(root, 'MATLAB');
      if (!fs.existsSync(matlabRoot)) continue;
      for (const entry of fs.readdirSync(matlabRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const exePath = path.join(matlabRoot, entry.name, 'bin', 'matlab.exe');
        if (fs.existsSync(exePath)) {
          matches.push(exePath);
        }
      }
    }
    return [...envPath, ...matches];
  }
  return [
    ...envPath,
    '/usr/local/bin/matlab',
    '/Applications/MATLAB_R2025b.app/bin/matlab',
    '/Applications/MATLAB_R2025a.app/bin/matlab',
  ];
}

function findMatlabExecutable() {
  return possibleMatlabExecutables().find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

async function detectMatlab() {
  const executable = findMatlabExecutable();
  return {
    available: !!executable,
    executable,
    searched: possibleMatlabExecutables(),
  };
}

async function writeMatlabScript(args) {
  const script = typeof args?.script === 'string' ? args.script : '';
  const outputPath = typeof args?.outputPath === 'string' && args.outputPath.trim()
    ? path.resolve(args.outputPath)
    : path.join(process.cwd(), 'matlab', `script_${Date.now()}.m`);
  if (!script.trim()) {
    throw new Error('script is required');
  }
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, script, 'utf-8');
  return { path: outputPath, bytesWritten: Buffer.byteLength(script, 'utf-8') };
}

async function runMatlabScript(args) {
  const executable = findMatlabExecutable();
  if (!executable) {
    throw new Error('MATLAB executable not found. Set MATLAB_EXE or install MATLAB.');
  }
  const scriptPath = typeof args?.scriptPath === 'string' ? path.resolve(args.scriptPath) : '';
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    throw new Error('scriptPath is required and must exist');
  }
  const cwd = typeof args?.cwd === 'string' && args.cwd.trim() ? path.resolve(args.cwd) : path.dirname(scriptPath);
  const timeoutMs = Math.max(1000, Math.min(600000, Number(args?.timeoutMs ?? 120000) || 120000));
  const runExpr = `try; cd('${cwd.replace(/\\/g, '/').replace(/'/g, "''")}'); run('${scriptPath.replace(/\\/g, '/').replace(/'/g, "''")}'); catch ME; disp(getReport(ME,'extended')); exit(1); end; exit(0);`;
  const { stdout, stderr } = await execFileAsync(executable, ['-batch', runExpr], {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { executable, scriptPath, cwd, stdout, stderr, timeoutMs };
}

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-matlab-bridge', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }
  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'detect_matlab',
          description: 'Detect a local MATLAB installation and return the executable path if available.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'write_matlab_script',
          description: 'Write MATLAB code to a .m file for later execution.',
          inputSchema: {
            type: 'object',
            properties: {
              script: { type: 'string', description: 'MATLAB script contents.' },
              outputPath: { type: 'string', description: 'Optional output .m path.' },
            },
            required: ['script'],
            additionalProperties: false,
          },
        },
        {
          name: 'run_matlab_script',
          description: 'Execute a local MATLAB script via matlab -batch.',
          inputSchema: {
            type: 'object',
            properties: {
              scriptPath: { type: 'string', description: 'Path to an existing .m script.' },
              cwd: { type: 'string', description: 'Optional working directory.' },
              timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds.' },
            },
            required: ['scriptPath'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (method === 'tools/call') {
    try {
      if (params?.name === 'detect_matlab') {
        success(id, await detectMatlab());
        return;
      }
      if (params?.name === 'write_matlab_script') {
        success(id, await writeMatlabScript(params?.arguments ?? {}));
        return;
      }
      if (params?.name === 'run_matlab_script') {
        success(id, await runMatlabScript(params?.arguments ?? {}));
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
