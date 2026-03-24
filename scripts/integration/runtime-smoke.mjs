import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function discoverWorkingProvider() {
  const candidates = [
    { provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', apiKey: 'none' },
    { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: 'none' },
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate.baseUrl}/models`);
      if (!response.ok) continue;
      const payload = await response.json();
      const model = Array.isArray(payload.data) && payload.data[0]?.id ? payload.data[0].id : null;
      if (!model) continue;
      return { ...candidate, model };
    } catch {
      continue;
    }
  }

  throw new Error('No working local OpenAI-compatible provider found for runtime smoke test.');
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tzukwan-runtime-home-'));
  const tempProject = await fs.mkdtemp(path.join(os.tmpdir(), 'tzukwan-runtime-project-'));
  const providerConfig = await discoverWorkingProvider();

  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  const tzukwanHome = path.join(tempHome, '.tzukwan');
  const localSkillsDir = path.join(tempProject, '.tzukwan', 'skills', 'demo-skill');
  const fakeServerPath = path.join(tempProject, 'fake-mcp-server.mjs');

  try {
    await fs.mkdir(tzukwanHome, { recursive: true });
    await fs.mkdir(localSkillsDir, { recursive: true });

    await fs.writeFile(path.join(tzukwanHome, 'mcp-servers.json'), JSON.stringify([
      {
        name: 'fake',
        description: 'fake integration server',
        type: 'stdio',
        command: process.execPath,
        args: [fakeServerPath],
        enabled: true,
      },
    ], null, 2), 'utf8');

    await fs.writeFile(path.join(localSkillsDir, 'SKILL.md'), `---
name: demo-skill
version: 1.0.0
description: Demo skill for runtime smoke
---

## Commands
- \`run\`
`, 'utf8');

    await fs.writeFile(path.join(localSkillsDir, 'index.mjs'), `export const commands = [
  {
    name: 'run',
    description: 'runtime demo command',
    execute: async (args) => ({ echoed: args.value ?? 'missing' }),
  },
];
`, 'utf8');

    await fs.writeFile(fakeServerPath, `import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: {} } });
    return;
  }
  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'echo tool',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        echoed: message.params?.arguments?.text ?? '',
      },
    });
  }
});
`, 'utf8');

    const { loadCLIRuntime } = await import(pathToFileURL(path.join(repoRoot, 'packages/cli/dist/shared/runtime.js')).href);
    const runtime = await loadCLIRuntime({
      provider: providerConfig.provider,
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      temperature: 0,
      maxTokens: 32,
      think: true,
    }, {
      useCache: false,
      cwd: tempProject,
    });

    const registry = runtime.orchestrator.getToolRegistry();
    const tools = registry.listTools().map((tool) => tool.name);

    if (!tools.includes('skill_demo_skill_run')) {
      throw new Error('Skill tool was not registered into runtime.');
    }
    if (!tools.includes('mcp_fake_echo')) {
      throw new Error('MCP tool was not registered into runtime.');
    }

    const skillResult = await registry.executeTool('skill_demo_skill_run', { value: 'ok' });
    if (!skillResult.success || skillResult.result?.echoed !== 'ok') {
      throw new Error(`Skill tool execution failed: ${JSON.stringify(skillResult)}`);
    }

    const mcpResult = await registry.executeTool('mcp_fake_echo', { text: 'ok' });
    if (!mcpResult.success || mcpResult.result?.echoed !== 'ok') {
      throw new Error(`MCP tool execution failed: ${JSON.stringify(mcpResult)}`);
    }

    console.log(`[runtime-smoke] PASS provider=${providerConfig.provider} model=${providerConfig.model}`);
    runtime.mcpManager.stopAll();
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempProject, { recursive: true, force: true });
  }
}

await main();
