// MCP (Model Context Protocol) server manager
// Handles configuration, lifecycle, and JSON-RPC communication with MCP servers via stdio.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

export interface MCPServerConfig {
  name: string;
  description?: string;
  type: 'stdio';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  installedAt?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  serverName: string;
  parameters?: Record<string, unknown>;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ActiveServer {
  config: MCPServerConfig;
  process: ChildProcess;
  tools: MCPTool[];
  buffer: string;
  pendingRequests: Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>;
  nextId: number;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function isCommandAvailable(cmd: string): boolean {
  if (path.isAbsolute(cmd)) {
    return fs.existsSync(cmd);
  }
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(finder, [cmd], { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function getDefaultNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function getBundledServerScript(scriptName: string): string {
  return path.resolve(MODULE_DIR, '../mcp-servers', scriptName);
}

function getBundledWebSearchConfig(): Pick<MCPServerConfig, 'command' | 'args'> {
  return {
    command: process.execPath,
    args: [getBundledServerScript('brave-fallback-server.mjs')],
  };
}

function getEnabledByEnv(name: string): boolean {
  switch (name) {
    case 'github':
      return !!process.env.GITHUB_TOKEN;
    case 'postgres':
      return !!process.env.DATABASE_URL;
    case 'matlab-bridge':
      return !!process.env.MATLAB_EXE;
    case 'stata-bridge':
      return !!process.env.STATA_EXE;
    case 'netlogo-bridge':
      return !!process.env.NETLOGO_HEADLESS;
    default:
      return false;
  }
}

function isLegacyDefaultServer(name: string, config: MCPServerConfig, defaultNpxCommand: string): boolean {
  if (name === 'arxiv-mcp') {
    return config.command === defaultNpxCommand || config.args?.includes('@modelcontextprotocol/server-arxiv') === true;
  }
  if (name === 'fetch') {
    return config.command === defaultNpxCommand || config.args?.includes('@modelcontextprotocol/server-fetch') === true;
  }
  return false;
}

export class MCPManager {
  private servers: Map<string, MCPServerConfig> = new Map();
  private active: Map<string, ActiveServer> = new Map();
  private configFile: string;

  constructor() {
    this.configFile = path.join(os.homedir(), '.tzukwan', 'mcp-servers.json');
    this.load();
    this.addDefaultServers();
  }

  private validateServerConfig(config: MCPServerConfig): void {
    if (config.type !== 'stdio') {
      throw new Error(`Unsupported MCP transport "${config.type}". Only stdio is supported.`);
    }
    if (!config.name || !/^[a-zA-Z0-9._-]+$/.test(config.name)) {
      throw new Error('MCP server name must be non-empty and contain only letters, numbers, dot, underscore, or hyphen.');
    }
    if (config.command && /[;&|`$]/.test(config.command)) {
      throw new Error('MCP server command contains disallowed shell metacharacters.');
    }
    if (config.args?.some((arg) => /[\r\n]/.test(arg))) {
      throw new Error('MCP server args cannot contain line breaks.');
    }
  }

  addServer(config: MCPServerConfig): void {
    this.validateServerConfig(config);
    this.servers.set(config.name, config);
    this.save();
  }

  updateServer(name: string, updates: Partial<MCPServerConfig>): boolean {
    const existing = this.servers.get(name);
    if (!existing) return false;

    const merged: MCPServerConfig = {
      ...existing,
      ...updates,
      name: existing.name,
    };
    this.validateServerConfig(merged);
    this.stopServer(name);
    this.servers.set(name, merged);
    this.save();
    return true;
  }

  removeServer(name: string): boolean {
    if (!this.servers.has(name)) return false;
    this.stopServer(name);
    this.servers.delete(name);
    this.save();
    return true;
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const server = this.servers.get(name);
    if (!server) return false;
    server.enabled = enabled;
    if (!enabled) this.stopServer(name);
    this.save();
    return true;
  }

  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  getServer(name: string): MCPServerConfig | undefined {
    return this.servers.get(name);
  }

  getStatus(): Array<{ name: string; enabled: boolean; description: string; type: string }> {
    return Array.from(this.servers.values()).map((server) => ({
      name: server.name,
      enabled: server.enabled,
      description: server.description ?? '',
      type: server.type,
    }));
  }

  isRunning(name: string): boolean {
    return this.active.has(name);
  }

  async startEnabledServers(): Promise<Record<string, MCPTool[]>> {
    const started: Record<string, MCPTool[]> = {};
    for (const server of this.servers.values()) {
      if (!server.enabled) continue;
      try {
        started[server.name] = await this.startServer(server.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[mcp] Failed to start server "${server.name}": ${message}`);
      }
    }
    return started;
  }

  async startServer(name: string): Promise<MCPTool[]> {
    const config = this.servers.get(name);
    if (!config) return [];
    if (config.type !== 'stdio') {
      throw new Error(`MCP server "${name}" uses unsupported transport "${config.type}". Only stdio is currently supported.`);
    }
    if (!config.command) {
      throw new Error(`MCP server "${name}" is missing a command.`);
    }
    const effectiveConfig = name === 'brave-search'
      ? { ...config, ...getBundledWebSearchConfig(), description: 'Bundled web search fallback' }
      : config;

    const activeClient = this.active.get(name);
    if (activeClient) return activeClient.tools;

    if (!isCommandAvailable(effectiveConfig.command!)) {
      throw new Error(
        `MCP server '${config.name}' requires '${effectiveConfig.command}' to be installed and in PATH.\n` +
        `Install it with: npm install -g ${effectiveConfig.args?.[1] ?? config.name}\n` +
        'Or install Node.js from: https://nodejs.org/'
      );
    }

    // On Windows, .cmd/.bat wrappers (e.g. npx.cmd) need shell:true + windowsHide:true
    // to properly set CREATE_NO_WINDOW and prevent console windows from flashing.
    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(effectiveConfig.command!);

    const proc = spawn(effectiveConfig.command!, effectiveConfig.args ?? [], {
      env: { ...process.env, ...(effectiveConfig.env ?? {}) },
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      ...(useShell ? { shell: true } : {}),
    });

    const server: ActiveServer = {
      config: effectiveConfig,
      process: proc,
      tools: [],
      buffer: '',
      pendingRequests: new Map(),
      nextId: 1,
    };

    this.active.set(name, server);

    const MAX_BUFFER_SIZE = 1024 * 1024;
    proc.stdout?.on('data', (chunk: Buffer) => {
      server.buffer += chunk.toString('utf-8');
      if (server.buffer.length > MAX_BUFFER_SIZE) {
        console.warn(`[MCPClient] Buffer overflow for server "${name}" - discarding`);
        server.buffer = '';
      }

      const lines = server.buffer.split('\n');
      server.buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JSONRPCResponse;
          const pending = server.pendingRequests.get(msg.id);
          if (!pending) continue;
          server.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        } catch {
          // Ignore non-JSON output from noisy servers.
        }
      }
    });

    proc.on('exit', () => {
      for (const [, pending] of server.pendingRequests) {
        pending.reject(new Error('MCP server exited'));
      }
      server.pendingRequests.clear();
      this.active.delete(name);
    });

    proc.on('error', (err) => {
      for (const [, pending] of server.pendingRequests) {
        pending.reject(err);
      }
      server.pendingRequests.clear();
      this.active.delete(name);
    });

    try {
      await this.sendRequest(server, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'tzukwan-cli', version: '2.0' },
      });
      this.sendNotification(server, 'notifications/initialized');

      const result = await this.sendRequest(
        server,
        'tools/list',
        {},
      ) as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> } | null;

      const toolList = result?.tools ?? [];
      server.tools = toolList.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        serverName: name,
        parameters: tool.inputSchema,
      }));
    } catch (error) {
      this.stopServer(name);
      throw error;
    }

    return server.tools;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const server = this.active.get(serverName);
    if (!server) {
      throw new Error(`MCP server "${serverName}" is not running`);
    }
    return this.sendRequest(server, 'tools/call', { name: toolName, arguments: args });
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.active.values()) {
      tools.push(...server.tools);
    }
    return tools;
  }

  stopServer(name: string): void {
    const server = this.active.get(name);
    if (server) {
      try {
        server.process.kill();
      } catch {
        // ignore
      }
      this.active.delete(name);
    }
  }

  stopAll(): void {
    for (const name of this.active.keys()) {
      this.stopServer(name);
    }
  }

  private sendNotification(server: ActiveServer, method: string, params?: unknown): void {
    if (!server.process.stdin || server.process.killed) return;
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    try {
      server.process.stdin.write(JSON.stringify(notification) + '\n');
    } catch {
      // Best effort only.
    }
  }

  private sendRequest(server: ActiveServer, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!server.process.stdin || server.process.killed) {
        reject(new Error('Server process not available'));
        return;
      }

      if (server.nextId >= Number.MAX_SAFE_INTEGER) {
        server.nextId = 1;
      }

      const id = server.nextId++;
      const request: JSONRPCRequest = { jsonrpc: '2.0', id, method, params: params ?? undefined };
      let timeout: NodeJS.Timeout | undefined;

      const pendingRequest = {
        resolve: (result: unknown) => {
          if (timeout) clearTimeout(timeout);
          server.pendingRequests.delete(id);
          resolve(result);
        },
        reject: (error: Error) => {
          if (timeout) clearTimeout(timeout);
          server.pendingRequests.delete(id);
          reject(error);
        },
      };

      server.pendingRequests.set(id, pendingRequest);
      timeout = setTimeout(() => {
        if (!server.pendingRequests.has(id)) return;
        server.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 10000);

      try {
        server.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        server.pendingRequests.delete(id);
        reject(error as Error);
      }
    });
  }

  private addDefaultServers(): void {
    const defaultNpxCommand = getDefaultNpxCommand();
    const defaults: MCPServerConfig[] = [
      {
        name: 'arxiv-mcp',
        description: 'arXiv paper search and metadata fetch',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('arxiv-server.mjs')],
        enabled: true,
      },
      {
        name: 'openalex-mcp',
        description: 'OpenAlex scholarly search and work metadata fetch',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('openalex-server.mjs')],
        enabled: true,
      },
      {
        name: 'pubmed-mcp',
        description: 'PubMed article search and metadata fetch',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('pubmed-server.mjs')],
        enabled: true,
      },
      {
        name: 'brave-search',
        description: 'Bundled web search',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('brave-fallback-server.mjs')],
        enabled: true,
      },
      {
        name: 'filesystem',
        description: 'Filesystem access',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@modelcontextprotocol/server-filesystem', os.homedir()],
        enabled: true,
      },
      {
        name: 'fetch',
        description: 'Web content fetch',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('fetch-server.mjs')],
        enabled: true,
      },
      {
        name: 'memory',
        description: 'Official MCP memory server for persistent knowledge graph memory',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@modelcontextprotocol/server-memory'],
        enabled: true,
      },
      {
        name: 'sequential-thinking',
        description: 'Official MCP sequential thinking server for structured reasoning',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        enabled: true,
      },
      {
        name: 'github',
        description: 'Official MCP GitHub API server',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: process.env.GITHUB_TOKEN ? { GITHUB_TOKEN: process.env.GITHUB_TOKEN } : undefined,
        enabled: getEnabledByEnv('github'),
      },
      {
        name: 'postgres',
        description: 'Official MCP PostgreSQL server',
        type: 'stdio',
        command: defaultNpxCommand,
        args: process.env.DATABASE_URL
          ? ['-y', '@modelcontextprotocol/server-postgres', process.env.DATABASE_URL]
          : ['-y', '@modelcontextprotocol/server-postgres'],
        enabled: getEnabledByEnv('postgres'),
      },
      {
        name: 'puppeteer',
        description: 'Official MCP Puppeteer browser automation server',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        enabled: false,
      },
      {
        name: 'playwright',
        description: 'Community MCP Playwright browser automation server',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', '@executeautomation/playwright-mcp-server'],
        enabled: false,
      },
      {
        name: 'mermaid',
        description: 'Community Mermaid MCP server for diagram generation',
        type: 'stdio',
        command: defaultNpxCommand,
        args: ['-y', 'mermaid-mcp-server'],
        enabled: false,
      },
      {
        name: 'browser-use',
        description: 'Community browser-use MCP server (requires uvx/browser-use environment)',
        type: 'stdio',
        command: process.platform === 'win32' ? 'uvx.exe' : 'uvx',
        args: ['mcp-browser-use'],
        enabled: false,
      },
      {
        name: 'matlab-bridge',
        description: 'Bundled MATLAB bridge MCP server for local scientific computing',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('matlab-bridge-server.mjs')],
        enabled: getEnabledByEnv('matlab-bridge'),
      },
      {
        name: 'stata-bridge',
        description: 'Bundled Stata bridge MCP server for econometrics workflows',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('stata-bridge-server.mjs')],
        enabled: getEnabledByEnv('stata-bridge'),
      },
      {
        name: 'netlogo-bridge',
        description: 'Bundled NetLogo bridge MCP server for agent-based simulation workflows',
        type: 'stdio',
        command: process.execPath,
        args: [getBundledServerScript('netlogo-bridge-server.mjs')],
        enabled: getEnabledByEnv('netlogo-bridge'),
      },
    ];

    for (const def of defaults) {
      const existing = this.servers.get(def.name);
      if (!existing) {
        this.servers.set(def.name, def);
        continue;
      }

      if (isLegacyDefaultServer(def.name, existing, defaultNpxCommand)) {
        this.servers.set(def.name, {
          ...existing,
          command: def.command,
          args: def.args,
          description: def.description,
          enabled: true,
        });
        continue;
      }

      if (
        process.platform === 'win32'
        && existing.command === 'npx'
        && (!existing.args || existing.args[0] === '-y')
      ) {
        this.servers.set(def.name, { ...existing, command: defaultNpxCommand, enabled: true });
        continue;
      }

      if (existing.enabled !== true) {
        this.servers.set(def.name, { ...existing, enabled: true });
      }
    }

    this.save();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.configFile)) return;
      const raw = fs.readFileSync(this.configFile, 'utf-8');
      const parsed = JSON.parse(raw) as MCPServerConfig[];
      for (const config of parsed) {
        if (config.name && config.type === 'stdio') {
          this.servers.set(config.name, config);
        } else if (config.name && config.type) {
          console.warn(`[mcp] Skipping server "${config.name}" with unsupported transport "${config.type}"`);
        }
      }
    } catch {
      // Load failure is non-fatal.
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(Array.from(this.servers.values()), null, 2), 'utf-8');
    } catch {
      // Save failure is non-fatal.
    }
  }
}
