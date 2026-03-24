import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import { displayError, displayInfo, displaySuccess, displayTable } from '../ui/display.js';
import { TZUKWAN_DIR } from '../shared/constants.js';

interface McpServer {
  name: string;
  url: string;
  type: 'stdio' | 'sse';
  enabled: boolean;
  addedAt: string;
}

interface McpConfig {
  servers: McpServer[];
}

const MCP_CONFIG_PATH = path.join(TZUKWAN_DIR, 'mcp-servers.json');

function readMcpConfig(): McpConfig {
  try {
    const content = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content) as Partial<McpConfig>;
    return {
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
    };
  } catch {
    return { servers: [] };
  }
}

function writeMcpConfig(config: McpConfig): void {
  fs.mkdirSync(TZUKWAN_DIR, { recursive: true });
  fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function listMcpServers(): Promise<void> {
  const config = readMcpConfig();

  if (config.servers.length === 0) {
    displayInfo('No MCP servers configured. Use "tzukwan mcp add <name> <url>" to add one.');
    return;
  }

  console.log(`\n${chalk.bold.cyan('Configured MCP Servers')}\n`);

  const headers = ['Name', 'Type', 'URL', 'Status'];
  const rows = config.servers.map((server) => [
    server.name,
    server.type,
    server.url.length > 40 ? server.url.slice(0, 37) + '...' : server.url,
    server.enabled ? chalk.green('enabled') : chalk.gray('disabled'),
  ]);

  displayTable(headers, rows);
}

export async function addMcpServer(name: string, url: string, type: 'stdio' | 'sse'): Promise<void> {
  // Validate name
  if (!name || name.trim().length === 0) {
    displayError('Server name cannot be empty');
    return;
  }

  // Validate URL format and protocol for SSE type
  if (type === 'sse') {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      displayError(`Invalid URL format: ${url}`);
      return;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      displayError(`Invalid protocol '${parsedUrl.protocol}' — only http: and https: are supported`);
      return;
    }
  }

  const config = readMcpConfig();

  // Check for duplicate names
  if (config.servers.some((s) => s.name === name)) {
    displayError(`A server with name '${name}' already exists. Remove it first or use a different name.`);
    return;
  }

  const newServer: McpServer = {
    name: name.trim(),
    url: url.trim(),
    type,
    enabled: true,
    addedAt: new Date().toISOString(),
  };

  config.servers.push(newServer);
  writeMcpConfig(config);

  displaySuccess(`Added MCP server '${name}' (${type})`);
}

export async function removeMcpServer(name: string): Promise<void> {
  const config = readMcpConfig();
  const initialLength = config.servers.length;

  config.servers = config.servers.filter((s) => s.name !== name);

  if (config.servers.length === initialLength) {
    displayError(`No server found with name '${name}'`);
    return;
  }

  writeMcpConfig(config);
  displaySuccess(`Removed MCP server '${name}'`);
}

export async function testMcpServer(name: string): Promise<void> {
  const config = readMcpConfig();
  const server = config.servers.find((s) => s.name === name);

  if (!server) {
    displayError(`No server found with name '${name}'`);
    return;
  }

  console.log(chalk.gray(`\n  Testing connection to '${name}'...`));

  try {
    if (server.type === 'sse') {
      // For SSE servers: attempt an HTTP HEAD request to the URL
      await new Promise<void>((resolve, reject) => {
        const parsed = new URL(server.url);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request({ method: 'HEAD', hostname: parsed.hostname, port: parsed.port, path: parsed.pathname }, (res) => {
          // Any HTTP response (even 404) means the server is reachable
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Server returned HTTP ${res.statusCode}`));
          }
        });
        let settled = false;
        req.setTimeout(5000, () => { if (!settled) { settled = true; req.destroy(); reject(new Error('Connection timed out (5s)')); } });
        req.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
        req.end();
      });
      displaySuccess(`Server '${name}' is reachable`);
    } else {
      // For stdio servers: verify the command exists in PATH
      const command = server.url.split(' ')[0];
      try {
        // Use execFileSync to avoid shell injection from command variable
        const finder = process.platform === 'win32' ? 'where' : 'which';
        execFileSync(finder, [command], { stdio: 'ignore' });
        displaySuccess(`Command '${command}' found in PATH`);
      } catch {
        displayError(`Command '${command}' not found in PATH — server may not be installed`);
        return;
      }
    }
    console.log(chalk.gray(`  Type: ${server.type}`));
    console.log(chalk.gray(`  URL/Command: ${server.url}`));
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Connection test failed: ${message}`);
  }
}
