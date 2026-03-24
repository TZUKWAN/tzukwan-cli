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

function possibleNetLogoExecutables() {
  const envPath = process.env.NETLOGO_HEADLESS ? [process.env.NETLOGO_HEADLESS] : [];
  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramW6432'],
      process.env['ProgramFiles(x86)'],
    ].filter(Boolean);
    const matches = [];
    for (const root of roots) {
      for (const folder of ['NetLogo 7.0.0', 'NetLogo 6.4.0', 'NetLogo 6.3.0']) {
        const candidate = path.join(root, folder, 'netlogo-headless.bat');
        if (fs.existsSync(candidate)) {
          matches.push(candidate);
        }
      }
    }
    return [...envPath, ...matches];
  }
  return [...envPath, '/usr/local/bin/netlogo-headless.sh'];
}

function findNetLogoExecutable() {
  return possibleNetLogoExecutables().find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

async function detectNetLogo() {
  const executable = findNetLogoExecutable();
  return {
    available: !!executable,
    executable,
    searched: possibleNetLogoExecutables(),
  };
}

async function writeBehaviorSpaceTemplate(args) {
  const experimentName = typeof args?.experimentName === 'string' && args.experimentName.trim()
    ? args.experimentName.trim()
    : 'experiment';
  const outputPath = typeof args?.outputPath === 'string' && args.outputPath.trim()
    ? path.resolve(args.outputPath)
    : path.join(process.cwd(), 'netlogo', `${experimentName}.xml`);
  const metric = typeof args?.metric === 'string' && args.metric.trim() ? args.metric.trim() : 'count turtles';
  const parameterName = typeof args?.parameterName === 'string' && args.parameterName.trim() ? args.parameterName.trim() : 'density';
  const values = Array.isArray(args?.values) && args.values.length > 0 ? args.values.map(String) : ['0.1', '0.2', '0.3'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<experiments>\n  <experiment name="${experimentName}" repetitions="5" runMetricsEveryStep="false">\n    <setup>setup</setup>\n    <go>go</go>\n    <metric>${metric}</metric>\n    <enumeratedValueSet variable="${parameterName}">\n${values.map((value) => `      <value value="${value}"/>`).join('\n')}\n    </enumeratedValueSet>\n  </experiment>\n</experiments>\n`;
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, xml, 'utf-8');
  return { path: outputPath, experimentName, parameterName, values };
}

async function runNetLogoHeadless(args) {
  const executable = findNetLogoExecutable();
  if (!executable) {
    throw new Error('NetLogo headless executable not found. Set NETLOGO_HEADLESS or install NetLogo.');
  }
  const modelPath = typeof args?.modelPath === 'string' ? path.resolve(args.modelPath) : '';
  const experiment = typeof args?.experiment === 'string' ? args.experiment.trim() : '';
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error('modelPath is required and must exist');
  }
  if (!experiment) {
    throw new Error('experiment is required');
  }
  const table = typeof args?.table === 'string' && args.table.trim()
    ? path.resolve(args.table)
    : path.join(path.dirname(modelPath), `${experiment}.csv`);
  const timeoutMs = Math.max(1000, Math.min(600000, Number(args?.timeoutMs ?? 180000) || 180000));
  ensureDir(table);
  const argv = ['--model', modelPath, '--experiment', experiment, '--table', table];
  const { stdout, stderr } = await execFileAsync(executable, argv, {
    cwd: path.dirname(modelPath),
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { executable, modelPath, experiment, table, stdout, stderr, timeoutMs };
}

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    success(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'tzukwan-netlogo-bridge', version: '1.0.0' },
      capabilities: { tools: {} },
    });
    return;
  }
  if (method === 'tools/list') {
    success(id, {
      tools: [
        {
          name: 'detect_netlogo',
          description: 'Detect a local NetLogo headless installation.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          name: 'write_behaviorspace_template',
          description: 'Write a BehaviorSpace experiment XML template for NetLogo.',
          inputSchema: {
            type: 'object',
            properties: {
              experimentName: { type: 'string', description: 'BehaviorSpace experiment name.' },
              parameterName: { type: 'string', description: 'Parameter name to sweep.' },
              values: { type: 'array', items: { type: 'string' }, description: 'Enumerated values.' },
              metric: { type: 'string', description: 'Metric expression.' },
              outputPath: { type: 'string', description: 'Optional output XML path.' },
            },
            additionalProperties: false,
          },
        },
        {
          name: 'run_netlogo_headless',
          description: 'Run a NetLogo BehaviorSpace experiment via the headless executable.',
          inputSchema: {
            type: 'object',
            properties: {
              modelPath: { type: 'string', description: 'Path to a .nlogo model file.' },
              experiment: { type: 'string', description: 'BehaviorSpace experiment name.' },
              table: { type: 'string', description: 'Optional output CSV path.' },
              timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds.' },
            },
            required: ['modelPath', 'experiment'],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (method === 'tools/call') {
    try {
      if (params?.name === 'detect_netlogo') {
        success(id, await detectNetLogo());
        return;
      }
      if (params?.name === 'write_behaviorspace_template') {
        success(id, await writeBehaviorSpaceTemplate(params?.arguments ?? {}));
        return;
      }
      if (params?.name === 'run_netlogo_headless') {
        success(id, await runNetLogoHeadless(params?.arguments ?? {}));
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
