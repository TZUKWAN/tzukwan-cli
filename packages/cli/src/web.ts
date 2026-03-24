import http from 'http';
import { URL } from 'url';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import type { Config } from './commands/config.js';
import { buildDirectConfig, getConfig, getRoutingConfig, saveConfig, saveRoutingConfig, testConfigConnection, testRoutingConnection } from './commands/config.js';
import { captureTerminalOutput, handleSlashCommand, streamWithOrchestratorTUI, type REPLState } from './repl.js';
import { loadCLIRuntime, resetRuntimeCache } from './shared/runtime.js';
import {
  ConfigLoader,
  SessionManager,
  type Message,
  type Session,
  getAgentRuntimeStates,
  setAgentCommListener,
  setAgentRuntimeListener,
} from '@tzukwan/core';

interface WebServerOptions {
  config: Config;
  host?: string;
  port?: number;
  autoOpenBrowser?: boolean;
}

interface WebMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentId?: string;
}

interface WebLogEntry {
  id: string;
  type: 'agent' | 'think' | 'tool' | 'route';
  title: string;
  content: string;
  timestamp: string;
  agentId?: string;
}

interface WebSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
  preview: string;
}

interface WebProcessState {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
}

interface WebPaperValidationItem {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'warning';
  detail: string;
}

interface WebPaperValidationSummary {
  paperId: string;
  ready: boolean | null;
  strictValidationPath: string | null;
  evidenceManifestPath: string | null;
  checklist: WebPaperValidationItem[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  } | null;
}

function stripEmoji(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function text(res: http.ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, { 'Content-Type': `${contentType}; charset=utf-8` });
  res.end(body);
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const WEB_META_DIR = path.join(os.homedir(), '.tzukwan');
const WEB_SESSION_META_PATH = path.join(WEB_META_DIR, 'web-session-titles.json');
const WEB_PROCESS_STATE_PATH = path.join(WEB_META_DIR, 'web-process.json');
const WEB_SETTINGS_PATH = path.join(WEB_META_DIR, 'web-settings.json');
const PRODUCTION_STATE_PATH = path.join(process.cwd(), '.production-readiness-state.json');

function ensureWebMetaDir(): void {
  fs.mkdirSync(WEB_META_DIR, { recursive: true });
}

function readWebSettings(): { workspacePath?: string } {
  try {
    ensureWebMetaDir();
    if (!fs.existsSync(WEB_SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(WEB_SETTINGS_PATH, 'utf-8').replace(/^\uFEFF/, '')) as { workspacePath?: string };
  } catch {
    return {};
  }
}

function writeWebSettings(settings: { workspacePath?: string }): void {
  ensureWebMetaDir();
  fs.writeFileSync(WEB_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

function readProductionState(): { isProductionReady?: boolean; qualityScore?: number } | null {
  try {
    if (!fs.existsSync(PRODUCTION_STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(PRODUCTION_STATE_PATH, 'utf-8').replace(/^\uFEFF/, '')) as {
      isProductionReady?: boolean;
      qualityScore?: number;
    };
  } catch {
    return null;
  }
}

function readSessionTitles(): Record<string, string> {
  try {
    ensureWebMetaDir();
    if (!fs.existsSync(WEB_SESSION_META_PATH)) return {};
    return JSON.parse(fs.readFileSync(WEB_SESSION_META_PATH, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSessionTitles(titles: Record<string, string>): void {
  ensureWebMetaDir();
  fs.writeFileSync(WEB_SESSION_META_PATH, JSON.stringify(titles, null, 2), 'utf-8');
}

function readWebProcessState(): WebProcessState | null {
  try {
    ensureWebMetaDir();
    if (!fs.existsSync(WEB_PROCESS_STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(WEB_PROCESS_STATE_PATH, 'utf-8')) as WebProcessState;
  } catch {
    return null;
  }
}

function writeWebProcessState(state: WebProcessState): void {
  ensureWebMetaDir();
  fs.writeFileSync(WEB_PROCESS_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function clearWebProcessState(): void {
  try {
    if (fs.existsSync(WEB_PROCESS_STATE_PATH)) fs.unlinkSync(WEB_PROCESS_STATE_PATH);
  } catch {
    // Best-effort only.
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopPid(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function findListeningPids(port: number): number[] {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const target = `:${port}`;
      const pids = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && line.includes(target) && /\bLISTENING\b/i.test(line))
        .map((line) => {
          const parts = line.split(/\s+/);
          return Number.parseInt(parts[parts.length - 1] ?? '', 10);
        })
        .filter((pid) => Number.isFinite(pid) && pid > 0);
      return Array.from(new Set(pids));
    }
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Array.from(new Set(
      output
        .split(/\r?\n/)
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0),
    ));
  } catch {
    return [];
  }
}

function getActiveWebProcessState(host?: string, port?: number): WebProcessState | null {
  const state = readWebProcessState();
  if (!state) return null;
  if (!isProcessAlive(state.pid)) {
    clearWebProcessState();
    return null;
  }
  if (host && state.host !== host) return null;
  if (port && state.port !== port) return null;
  return state;
}

async function canConnect(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export function stopWebServerProcess(host?: string, port?: number): { stopped: boolean; message: string } {
  const state = readWebProcessState();
  const resolvedPort = port ?? state?.port ?? 3847;
  const resolvedHost = host ?? state?.host ?? '127.0.0.1';
  const pids = [
    ...(state?.pid ? [state.pid] : []),
    ...findListeningPids(resolvedPort),
  ].filter((pid, index, list) => list.indexOf(pid) === index);
  if (!pids.length) {
    clearWebProcessState();
    return { stopped: false, message: `No running web server found on http://${resolvedHost}:${resolvedPort}.` };
  }
  const stopped = pids.some((pid) => stopPid(pid));
  clearWebProcessState();
  return stopped
    ? { stopped: true, message: `Stopped web server on http://${resolvedHost}:${resolvedPort} (pid(s) ${pids.join(', ')}).` }
    : { stopped: false, message: `Failed to stop web server pid(s) ${pids.join(', ')}.` };
}

export function startDetachedWebServer(host?: string, port?: number): { started: boolean; message: string } {
  const resolvedHost = host ?? '127.0.0.1';
  const resolvedPort = port ?? 3847;
  const existing = getActiveWebProcessState(resolvedHost, resolvedPort);
  if (existing) {
    return {
      started: true,
      message: `Web server already running on http://${existing.host}:${existing.port} (pid ${existing.pid}).`,
    };
  }
  const existingPids = findListeningPids(resolvedPort);
  if (existingPids.length) {
    return {
      started: true,
      message: `Web server already listening on http://${resolvedHost}:${resolvedPort} (pid(s) ${existingPids.join(', ')}).`,
    };
  }
  const args = [process.argv[1]!, 'web'];
  if (host) args.push('--host', host);
  if (port) args.push('--port', String(port));
  args.push('--serve');
  try {
    const backgroundBinary = (() => {
      if (process.platform !== 'win32') return process.execPath;
      const nodewPath = path.join(path.dirname(process.execPath), 'nodew.exe');
      return fs.existsSync(nodewPath) ? nodewPath : process.execPath;
    })();
    const child = spawn(backgroundBinary, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return {
      started: true,
      message: `Started web server in background${host || port ? ` (${host ?? '127.0.0.1'}:${port ?? 3847})` : ''}.`,
    };
  } catch (error) {
    return {
      started: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function launchDetachedWebServer(host?: string, port?: number): { started: boolean; message: string } {
  const resolvedHost = host ?? '127.0.0.1';
  const resolvedPort = port ?? 3847;
  const existing = getActiveWebProcessState(resolvedHost, resolvedPort);
  if (existing) {
    return {
      started: true,
      message: `Web server already running on http://${existing.host}:${existing.port}.`,
    };
  }
  const launchResult = startDetachedWebServer(host, port);
  if (!launchResult.started) {
    return launchResult;
  }
  openBrowser(`http://${resolvedHost}:${resolvedPort}`);
  return {
    started: true,
    message: `Started web server in background and opened http://${resolvedHost}:${resolvedPort}`,
  };
}

export function restartWebServerProcess(host?: string, port?: number): { restarted: boolean; message: string } {
  const state = readWebProcessState();
  const resolvedHost = host ?? state?.host ?? '127.0.0.1';
  const resolvedPort = port ?? state?.port ?? 3847;
  const stopResult = stopWebServerProcess(resolvedHost, resolvedPort);
  const startResult = startDetachedWebServer(resolvedHost, resolvedPort);
  return {
    restarted: startResult.started,
    message: `${stopResult.message} ${startResult.message}`.trim(),
  };
}

export async function getWebServerStatus(host = '127.0.0.1', port = 3847): Promise<{
  running: boolean;
  reachable: boolean;
  host: string;
  port: number;
  pids: number[];
}> {
  const pids = findListeningPids(port);
  const reachable = await canConnect(host, port, 1200);
  return {
    running: pids.length > 0 || reachable,
    reachable,
    host,
    port,
    pids,
  };
}

function inferSessionTitle(messages: WebMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.trim();
  if (!firstUser) return 'Untitled Session';
  return firstUser.replace(/\s+/g, ' ').slice(0, 48);
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return;
    }
    if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
    const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Best-effort only.
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function toWebMessages(session: Session): WebMessage[] {
  return session.messages
    .filter((message): message is Extract<Message, { role: 'user' | 'assistant' | 'system' }> => (
      message.role === 'user' || message.role === 'assistant' || message.role === 'system'
    ))
    .map((message, index) => ({
      id: uid(`msg_${session.id}_${index}`),
      role: message.role,
      content: String(message.content ?? ''),
      timestamp: new Date(session.createdAt.getTime() + index * 1000).toISOString(),
    }));
}

function buildSessionSummary(session: Session, titles: Record<string, string>): WebSessionSummary {
  const messages = toWebMessages(session);
  const previewSource =
    [...messages].reverse().find((message) => message.role === 'assistant' || message.role === 'user')?.content
    ?? '';
  return {
    id: session.id,
    title: titles[session.id] || inferSessionTitle(messages),
    createdAt: session.createdAt.toISOString(),
    messageCount: messages.length,
    preview: previewSource.replace(/\s+/g, ' ').slice(0, 120),
  };
}

function formatRuntimeState(state: ReturnType<typeof getAgentRuntimeStates>[number]) {
  return {
    ...state,
    agentName: stripEmoji(state.agentName),
    detail: state.detail,
    stepName: (() => {
      if (state.status === 'thinking') return 'Reasoning';
      if (state.status === 'tool') return 'Tool Execution';
      if (/plan/i.test(state.detail)) return 'Planning';
      if (/synthes/i.test(state.detail)) return 'Synthesis';
      if (/selected|idle/i.test(state.detail)) return 'Standby';
      return state.status === 'running' ? 'Working' : 'Standby';
    })(),
    lastToolName: state.toolName,
    startedAt: state.updatedAt,
  };
}

function describeEndpoint(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl || 'unknown-endpoint';
  }
}

function toChatHistory(session: Session): REPLState['conversationHistory'] {
  return session.messages
    .filter((message): message is Extract<Message, { role: 'user' | 'assistant' | 'system' }> => (
      message.role === 'user' || message.role === 'assistant' || message.role === 'system'
    ))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? ''),
    }));
}

function makeHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tzukwan Web</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f4f1ea;
      --panel: #fbfaf7;
      --panel-2: #f0ece4;
      --line: #d5cdc0;
      --text: #1c232b;
      --muted: #5a6673;
      --accent: #20486d;
      --accent-soft: #d9e6f1;
      --danger: #8a2f2f;
      --tool: #3f5f79;
      --think: #6a7683;
      --shadow: 0 12px 40px rgba(18, 27, 34, 0.08);
      --radius: 18px;
      --radius-sm: 12px;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(32, 72, 109, 0.09), transparent 28%),
        linear-gradient(180deg, #f7f4ee 0%, var(--bg) 100%);
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 10px;
      padding: 12px;
    }
    .topbar, .agent-strip, .composer, .panel, .sidebar {
      background: rgba(251, 250, 247, 0.96);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .topbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 10px 14px;
      align-items: center;
    }
    .topbar-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: var(--accent-soft);
      display: grid;
      place-items: center;
      border: 1px solid rgba(32, 72, 109, 0.12);
      flex: 0 0 auto;
    }
    .brand h1 {
      margin: 0;
      font-family: "Noto Serif SC", serif;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.06em;
    }
    .brand p, .meta-grid p {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .meta-grid {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .meta-item {
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 10px;
      white-space: nowrap;
    }
    .meta-item span {
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-right: 6px;
      display: inline;
    }
    .meta-item strong {
      display: inline;
      margin-top: 0;
      font-size: 12px;
      font-weight: 600;
      word-break: break-word;
    }
    .agent-strip {
      display: flex;
      gap: 8px;
      padding: 8px 10px;
      overflow-x: auto;
      align-items: center;
    }
    .agent-card {
      background: #f5f1e9;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 0;
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .agent-card.active {
      border-color: rgba(32, 72, 109, 0.34);
      background: #deebf5;
      box-shadow: inset 0 0 0 1px rgba(32, 72, 109, 0.08);
    }
    .agent-name {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }
    .badge {
      padding: 3px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border: 1px solid var(--line);
      background: var(--panel-2);
    }
    .badge.running { color: #7a5b12; background: #f6edd0; }
    .badge.thinking { color: #55606d; background: #e7ebef; }
    .badge.tool { color: #20486d; background: #deebf5; }
    .badge.completed { color: #2e694f; background: #deefe5; }
    .badge.error { color: var(--danger); background: #f5dfdf; }
    .agent-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #c2c9d1;
      flex: 0 0 auto;
    }
    .agent-card.active .agent-dot,
    .agent-card.running .agent-dot,
    .agent-card.thinking .agent-dot,
    .agent-card.tool .agent-dot {
      background: #20486d;
      box-shadow: 0 0 0 4px rgba(32, 72, 109, 0.12);
    }
    .workspace {
      min-height: 0;
      display: grid;
      grid-template-columns: 280px minmax(0, 1.55fr) minmax(320px, 0.85fr);
      gap: 14px;
    }
    .panel, .sidebar {
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    .sidebar-body {
      min-height: 0;
      overflow: auto;
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .sidebar-actions {
      display: grid;
      gap: 10px;
    }
    .session-list {
      display: grid;
      gap: 10px;
    }
    .session-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: var(--panel);
      display: grid;
      gap: 8px;
      cursor: pointer;
    }
    .session-card.active {
      border-color: rgba(32,72,109,0.34);
      background: #eef3f7;
    }
    .session-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }
    .session-preview {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
      min-height: 36px;
    }
    .session-meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
      font-family: "IBM Plex Mono", monospace;
    }
    .session-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .session-tools {
      display: flex;
      gap: 6px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--line);
    }
    .panel-header h2 {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .panel-body {
      min-height: 0;
      overflow: auto;
      padding: 18px;
    }
    .message-list, .log-list {
      display: grid;
      gap: 14px;
    }
    .validation-panel {
      display: grid;
      gap: 12px;
      margin-bottom: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: #f7f4ee;
    }
    .validation-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .validation-stat {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: #fffdfa;
    }
    .validation-stat span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .validation-stat strong {
      display: block;
      margin-top: 6px;
      font-size: 16px;
      font-weight: 700;
    }
    .validation-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border: 1px solid var(--line);
      background: var(--panel-2);
    }
    .validation-status.pass { color: #2e694f; background: #deefe5; }
    .validation-status.fail { color: var(--danger); background: #f5dfdf; }
    .validation-status.pending { color: #7a5b12; background: #f6edd0; }
    .validation-list {
      display: grid;
      gap: 10px;
    }
    .validation-item {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fffdfa;
      padding: 12px;
      display: grid;
      gap: 6px;
    }
    .validation-item-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .validation-item-label {
      font-size: 13px;
      font-weight: 600;
    }
    .validation-item-detail {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .validation-paths {
      display: grid;
      gap: 8px;
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      color: var(--muted);
    }
    .validation-paths code {
      display: block;
      margin-top: 4px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fffdfa;
      color: var(--text);
      overflow-wrap: anywhere;
    }
    .message {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 15px;
      background: var(--panel);
    }
    .message.user {
      background: #e7eef4;
      border-color: #cad9e6;
    }
    .message.assistant {
      background: #fcfbf8;
    }
    .message.system {
      background: #f3eee6;
    }
    .message-head, .log-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      align-items: center;
    }
    .message-role, .log-kind {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 600;
    }
    .message-time, .log-time {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      color: var(--muted);
    }
    .message-content, .log-content {
      white-space: pre-wrap;
      line-height: 1.6;
      word-break: break-word;
      font-size: 14px;
    }
    .message-content {
      white-space: normal;
    }
    .message-content h1,
    .message-content h2,
    .message-content h3,
    .message-content h4 {
      font-family: "Noto Serif SC", serif;
      margin: 0 0 12px;
      line-height: 1.35;
    }
    .message-content h1 { font-size: 24px; }
    .message-content h2 { font-size: 20px; }
    .message-content h3 { font-size: 17px; }
    .message-content h4 { font-size: 15px; }
    .message-content p,
    .message-content ul,
    .message-content ol,
    .message-content blockquote,
    .message-content pre,
    .message-content table,
    .message-content .table-wrap {
      margin: 0 0 14px;
    }
    .message-content ul,
    .message-content ol {
      padding-left: 22px;
    }
    .message-content ul ul,
    .message-content ol ol,
    .message-content ul ol,
    .message-content ol ul {
      margin-top: 8px;
      margin-bottom: 8px;
    }
    .message-content li + li {
      margin-top: 6px;
    }
    .message-content li.task-item {
      list-style: none;
      margin-left: -18px;
    }
    .message-content .task-box {
      display: inline-grid;
      place-items: center;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      border: 1px solid #8fa2b3;
      border-radius: 4px;
      background: #fffdfa;
      font-size: 10px;
      line-height: 1;
      vertical-align: baseline;
    }
    .message-content blockquote {
      border-left: 3px solid #c9d6e2;
      padding: 10px 12px;
      background: #f4f7fa;
      color: #455566;
      border-radius: 10px;
    }
    .message-content code {
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      background: #eef2f5;
      border: 1px solid #d7dde3;
      border-radius: 8px;
      padding: 2px 6px;
    }
    .message-content pre {
      white-space: pre-wrap;
      overflow: auto;
      background: #f5f3ee;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      position: relative;
    }
    .message-content .code-lang {
      position: absolute;
      top: 10px;
      right: 12px;
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .message-content pre code {
      background: transparent;
      border: 0;
      padding: 0;
      border-radius: 0;
      font-size: 12px;
    }
    .message-content hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 18px 0;
    }
    .message-content .table-wrap {
      overflow-x: auto;
      border-radius: 12px;
    }
    .message-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: #fffdfa;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .message-content th,
    .message-content td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .message-content th {
      background: #eef3f7;
      font-weight: 600;
    }
    .message-content tr:last-child td {
      border-bottom: 0;
    }
    .message-content strong {
      font-weight: 700;
    }
    .message-content em {
      font-style: italic;
    }
    .message-content del {
      text-decoration: line-through;
      color: #6e7681;
    }
    .message-content a {
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px solid rgba(32, 72, 109, 0.2);
    }
    .message-content a:hover {
      border-bottom-color: rgba(32, 72, 109, 0.5);
    }
    .message-content .math-inline {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 8px;
      border: 1px solid #d8d0c0;
      background: #f7f3eb;
      font-family: "Noto Serif SC", serif;
      font-size: 14px;
    }
    .message-content .math-block {
      display: block;
      margin: 0 0 14px;
      padding: 14px 16px;
      border-radius: 12px;
      border: 1px solid #d8d0c0;
      background: #f7f3eb;
      font-family: "Noto Serif SC", serif;
      font-size: 18px;
      line-height: 1.5;
      text-align: center;
      overflow-x: auto;
    }
    .message-content .footnote-ref {
      font-size: 11px;
      vertical-align: super;
      margin-left: 2px;
    }
    .message-content .footnotes {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      font-size: 12px;
      color: var(--muted);
    }
    .message-content .footnotes ol {
      margin: 10px 0 0;
      padding-left: 18px;
    }
    .log-entry {
      border-left: 3px solid var(--line);
      padding-left: 12px;
    }
    .log-entry.tool { border-left-color: var(--tool); }
    .log-entry.think { border-left-color: var(--think); }
    .log-entry.agent { border-left-color: var(--accent); }
    .log-entry.route { border-left-color: #7a5c20; background: rgba(122, 92, 32, 0.04); }
    .composer {
      padding: 14px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: end;
    }
    .composer-fields {
      display: grid;
      gap: 10px;
    }
    .composer-toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    select, textarea, button, input {
      font: inherit;
    }
    select, textarea, input[type="text"], input[type="password"] {
      width: 100%;
      border: 1px solid var(--line);
      background: #fffdfa;
      color: var(--text);
      border-radius: 14px;
      padding: 12px 14px;
      outline: none;
    }
    textarea {
      resize: vertical;
      min-height: 92px;
      max-height: 240px;
      line-height: 1.55;
    }
    button {
      height: 46px;
      padding: 0 20px;
      border-radius: 14px;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: white;
      font-weight: 600;
      letter-spacing: 0.03em;
      cursor: pointer;
    }
    button.secondary {
      background: var(--panel);
      color: var(--accent);
      border-color: var(--line);
    }
    button.ghost {
      background: transparent;
      color: var(--muted);
      border-color: var(--line);
      height: 34px;
      padding: 0 12px;
      font-size: 12px;
    }
    button:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    .status-inline {
      color: var(--muted);
      font-size: 12px;
    }
    .empty {
      color: var(--muted);
      font-size: 13px;
      border: 1px dashed var(--line);
      border-radius: 14px;
      padding: 18px;
      background: rgba(240,236,228,0.45);
    }
    .settings-drawer {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: min(460px, 92vw);
      background: rgba(251, 250, 247, 0.98);
      border-left: 1px solid var(--line);
      box-shadow: -20px 0 40px rgba(18, 27, 34, 0.12);
      padding: 20px;
      display: none;
      grid-template-rows: auto 1fr auto;
      gap: 14px;
      z-index: 20;
    }
    .settings-drawer.open {
      display: grid;
    }
    .settings-body {
      overflow: auto;
      display: grid;
      gap: 14px;
      align-content: start;
    }
    .settings-group {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      background: var(--panel);
      display: grid;
      gap: 10px;
    }
    .settings-group h3 {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .field label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .checkbox-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: #fffdfa;
    }
    .checkbox-row input {
      width: 18px;
      height: 18px;
    }
    @media (max-width: 1100px) {
      .topbar { grid-template-columns: 1fr; }
      .workspace { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      .shell { padding: 10px; gap: 10px; }
      .composer { grid-template-columns: 1fr; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="20" height="20" rx="4" stroke="#20486d" stroke-width="1.6"/>
            <path d="M9 10.5H19M9 14H19M9 17.5H15" stroke="#20486d" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <h1>TZUKWAN</h1>
          <p>Scholarly agent workspace for research, writing, and experimentation.</p>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="meta-grid" id="meta-grid"></div>
        <button id="settings-button" class="secondary" type="button">Settings</button>
      </div>
    </section>

    <section class="agent-strip" id="agent-strip"></section>

    <section class="workspace">
      <aside class="sidebar">
        <div class="panel-header">
          <h2>Sessions</h2>
          <div class="status-inline" id="session-status">Local history</div>
        </div>
        <div class="sidebar-body">
          <div class="sidebar-actions">
            <button id="new-session-button" class="secondary" type="button">New Session</button>
          </div>
          <div class="session-list" id="session-list"></div>
        </div>
      </aside>

      <section class="panel">
        <div class="panel-header">
          <h2>Conversation</h2>
          <div class="status-inline" id="conversation-status">Idle</div>
        </div>
        <div class="panel-body">
          <div id="validation-panel"></div>
          <div class="message-list" id="message-list"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Runtime Logs</h2>
          <div class="status-inline" id="runtime-status">Monitoring agent state</div>
        </div>
        <div class="panel-body">
          <div class="log-list" id="log-list"></div>
        </div>
      </section>
    </section>

    <section class="composer">
      <div class="composer-fields">
        <div class="composer-toolbar">
          <select id="agent-select" aria-label="Agent selector"></select>
          <span class="status-inline" id="send-status">Ready</span>
        </div>
        <textarea id="composer-input" placeholder="Describe the research task. The system will coordinate tools and agents automatically."></textarea>
        <div class="status-inline">Enter sends. Shift+Enter inserts a newline. Slash commands run directly. Web queue and steer are not available yet.</div>
      </div>
      <div style="display:grid; gap:10px;">
        <button id="send-button" type="button">Send Task</button>
        <button id="refresh-button" class="secondary" type="button">Refresh State</button>
      </div>
    </section>
  </div>
  <aside class="settings-drawer" id="settings-drawer" aria-hidden="true">
    <div class="panel-header" style="padding:0; border:0;">
      <h2>Settings</h2>
      <button id="settings-close-button" class="ghost" type="button">Close</button>
    </div>
    <div class="settings-body">
      <section class="settings-group">
        <h3>LLM</h3>
        <div class="field">
          <label for="settings-workspace-path">Workspace Path</label>
          <input id="settings-workspace-path" type="text" />
        </div>
        <div class="field">
          <label for="settings-base-url">Base URL</label>
          <input id="settings-base-url" type="text" />
        </div>
        <div class="field">
          <label for="settings-api-key">API Key</label>
          <input id="settings-api-key" type="password" />
        </div>
        <div class="field">
          <label for="settings-model">LLM Name</label>
          <input id="settings-model" type="text" />
        </div>
        <div class="field">
          <label for="settings-think">Think Mode</label>
          <div class="checkbox-row">
            <span>Expose reasoning telemetry and think mode defaults.</span>
            <input id="settings-think" type="checkbox" />
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="settings-test-button" class="secondary" type="button">Test Connection</button>
          <button id="settings-save-button" type="button">Save Settings</button>
        </div>
        <div class="status-inline" id="settings-status">Idle</div>
      </section>
      <section class="settings-group">
        <h3>Routing Model</h3>
        <div class="field">
          <label for="settings-routing-base-url">Routing Base URL</label>
          <input id="settings-routing-base-url" type="text" />
        </div>
        <div class="field">
          <label for="settings-routing-api-key">Routing API Key</label>
          <input id="settings-routing-api-key" type="password" />
        </div>
        <div class="field">
          <label for="settings-routing-model">Routing LLM Name</label>
          <input id="settings-routing-model" type="text" />
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="settings-routing-test-button" class="secondary" type="button">Test Routing Model</button>
        </div>
        <div class="status-inline" id="settings-routing-status">Idle</div>
      </section>
        <section class="settings-group">
          <h3>MCP Servers</h3>
          <div id="settings-mcp-list" style="display:grid; gap:10px;"></div>
          <div class="field">
            <label for="settings-mcp-name">New MCP Name</label>
            <input id="settings-mcp-name" type="text" placeholder="custom-mcp" />
          </div>
          <div class="field">
            <label for="settings-mcp-command">Command</label>
            <input id="settings-mcp-command" type="text" placeholder="npx.cmd or node" />
          </div>
          <div class="field">
            <label for="settings-mcp-args">Args</label>
            <input id="settings-mcp-args" type="text" placeholder="-y package-name arg1 arg2" />
          </div>
          <div class="field">
            <label for="settings-mcp-description">Description</label>
            <input id="settings-mcp-description" type="text" placeholder="What this MCP does" />
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="settings-mcp-add-button" class="secondary" type="button">Add MCP</button>
            <button id="settings-mcp-refresh-button" class="secondary" type="button">Reload MCP</button>
          </div>
          <div class="status-inline" id="settings-mcp-status">Idle</div>
        </section>
        <section class="settings-group">
          <h3>Skills</h3>
          <div id="settings-skill-list" style="display:grid; gap:10px;"></div>
          <div class="field">
            <label for="settings-skill-source">Install Skill Source</label>
            <input id="settings-skill-source" type="text" placeholder="local path, git URL, or skill source" />
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="settings-skill-install-button" class="secondary" type="button">Install Skill</button>
            <button id="settings-skill-refresh-button" class="secondary" type="button">Reload Skills</button>
          </div>
          <div class="status-inline" id="settings-skill-status">Idle</div>
        </section>
      </div>
    <div class="status-inline">Changes are written to the system config and runtime immediately reloads.</div>
  </aside>
  <script>
    const state = { agents: [], messages: [], logs: [], runtimeStates: [], activeAgentId: 'advisor', activeSessionId: '', sessions: [], sending: false, settingsOpen: false, settings: null, settingsDraft: null, settingsDirty: false, paperValidation: null };

    const els = {
      metaGrid: document.getElementById('meta-grid'),
      agentStrip: document.getElementById('agent-strip'),
      sessionList: document.getElementById('session-list'),
      sessionStatus: document.getElementById('session-status'),
      validationPanel: document.getElementById('validation-panel'),
      messageList: document.getElementById('message-list'),
      logList: document.getElementById('log-list'),
      conversationStatus: document.getElementById('conversation-status'),
      runtimeStatus: document.getElementById('runtime-status'),
      sendStatus: document.getElementById('send-status'),
      agentSelect: document.getElementById('agent-select'),
      composerInput: document.getElementById('composer-input'),
      sendButton: document.getElementById('send-button'),
      refreshButton: document.getElementById('refresh-button'),
      newSessionButton: document.getElementById('new-session-button'),
      settingsButton: document.getElementById('settings-button'),
      settingsDrawer: document.getElementById('settings-drawer'),
      settingsCloseButton: document.getElementById('settings-close-button'),
      settingsWorkspacePath: document.getElementById('settings-workspace-path'),
      settingsBaseUrl: document.getElementById('settings-base-url'),
      settingsApiKey: document.getElementById('settings-api-key'),
      settingsModel: document.getElementById('settings-model'),
      settingsRoutingBaseUrl: document.getElementById('settings-routing-base-url'),
      settingsRoutingApiKey: document.getElementById('settings-routing-api-key'),
      settingsRoutingModel: document.getElementById('settings-routing-model'),
      settingsThink: document.getElementById('settings-think'),
      settingsTestButton: document.getElementById('settings-test-button'),
      settingsRoutingTestButton: document.getElementById('settings-routing-test-button'),
        settingsSaveButton: document.getElementById('settings-save-button'),
        settingsStatus: document.getElementById('settings-status'),
        settingsRoutingStatus: document.getElementById('settings-routing-status'),
        settingsMcpList: document.getElementById('settings-mcp-list'),
        settingsMcpName: document.getElementById('settings-mcp-name'),
        settingsMcpCommand: document.getElementById('settings-mcp-command'),
        settingsMcpArgs: document.getElementById('settings-mcp-args'),
        settingsMcpDescription: document.getElementById('settings-mcp-description'),
        settingsMcpAddButton: document.getElementById('settings-mcp-add-button'),
        settingsMcpRefreshButton: document.getElementById('settings-mcp-refresh-button'),
        settingsMcpStatus: document.getElementById('settings-mcp-status'),
        settingsSkillList: document.getElementById('settings-skill-list'),
        settingsSkillSource: document.getElementById('settings-skill-source'),
        settingsSkillInstallButton: document.getElementById('settings-skill-install-button'),
        settingsSkillRefreshButton: document.getElementById('settings-skill-refresh-button'),
        settingsSkillStatus: document.getElementById('settings-skill-status'),
      };

    function escapeHtml(value) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function timeOnly(value) {
      if (!value) return '--:--:--';
      return new Date(value).toLocaleTimeString('en-GB', { hour12: false });
    }

    function elapsed(value) {
      if (!value) return '--';
      const diff = Math.max(0, Date.now() - new Date(value).getTime());
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      const remain = seconds % 60;
      if (minutes < 60) return minutes + 'm' + String(remain).padStart(2, '0') + 's';
      const hours = Math.floor(minutes / 60);
      return hours + 'h' + String(minutes % 60).padStart(2, '0') + 'm';
    }

    function renderInlineMarkdown(value) {
      let html = escapeHtml(value);
      html = html.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, '<span class="math-block">$1</span>');
      html = html.replace(/\\$([^$\\n]+)\\$/g, '<span class="math-inline">$1</span>');
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      html = html.replace(/(^|[^\\*])\\*([^*\\n]+)\\*(?!\\*)/g, '$1<em>$2</em>');
      html = html.replace(/(^|[^_])_([^_\\n]+)_(?!_)/g, '$1<em>$2</em>');
      html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      html = html.replace(/\\[\\^([^\\]]+)\\]/g, '<sup class="footnote-ref">[$1]</sup>');
      html = html.replace(/(^|[\\s(>])((https?:\\/\\/|www\\.)[^\\s<]+)/g, (match, prefix, url) => {
        const href = url.startsWith('www.') ? 'https://' + url : url;
        return prefix + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
      });
      return html;
    }

    function renderMarkdown(value) {
      const source = String(value || '').replace(/\\r\\n/g, '\\n');
      if (!source.trim()) return '';

      const footnotes = [];
      const contentWithoutFootnotes = source.replace(/^\\[\\^([^\\]]+)\\]:\\s+(.+)$/gm, (match, key, text) => {
        footnotes.push({ key, text });
        return '';
      });
      const lines = contentWithoutFootnotes.split('\\n');
      const html = [];
      let index = 0;
      const codeFence = String.fromCharCode(96, 96, 96);

      const isTableRow = (line) => /\\|/.test(line);
      const isTableSeparator = (line) => /^\\s*\\|?[\\s:-]+(\\|[\\s:-]+)+\\|?\\s*$/.test(line);

      while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
          index += 1;
          continue;
        }

        if (/^(-{3,}|\\*{3,}|_{3,})$/.test(trimmed)) {
          html.push('<hr>');
          index += 1;
          continue;
        }

        if (trimmed.startsWith(codeFence)) {
          const firstFenceLine = trimmed.slice(codeFence.length).trim();
          const language = firstFenceLine ? escapeHtml(firstFenceLine) : '';
          const codeLines = [];
          index += 1;
          while (index < lines.length && !lines[index].trim().startsWith(codeFence)) {
            codeLines.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          html.push('<pre>' + (language ? '<div class="code-lang">' + language + '</div>' : '') + '<code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
          continue;
        }

        if (
          (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) ||
          (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4)
        ) {
          const formula = trimmed.startsWith('$$')
            ? trimmed.slice(2, -2).trim()
            : trimmed.slice(2, -2).trim();
          html.push('<div class="math-block">' + escapeHtml(formula) + '</div>');
          continue;
        }

        if (isTableRow(trimmed) && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) {
          const headerCells = trimmed.split('|').map((cell) => cell.trim()).filter(Boolean);
          index += 2;
          const bodyRows = [];
          while (index < lines.length && isTableRow(lines[index].trim())) {
            const cells = lines[index].split('|').map((cell) => cell.trim()).filter(Boolean);
            if (cells.length) bodyRows.push(cells);
            index += 1;
          }
          html.push(
            '<div class="table-wrap"><table><thead><tr>' +
            headerCells.map((cell) => '<th>' + renderInlineMarkdown(cell) + '</th>').join('') +
            '</tr></thead><tbody>' +
            bodyRows.map((row) => '<tr>' + row.map((cell) => '<td>' + renderInlineMarkdown(cell) + '</td>').join('') + '</tr>').join('') +
            '</tbody></table></div>'
          );
          continue;
        }

        const heading = trimmed.match(/^(#{1,4})\\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          html.push('<h' + level + '>' + renderInlineMarkdown(heading[2]) + '</h' + level + '>');
          index += 1;
          continue;
        }

        if (trimmed.startsWith('>')) {
          const quoteLines = [];
          while (index < lines.length && lines[index].trim().startsWith('>')) {
            quoteLines.push(lines[index].trim().replace(/^>\\s?/, ''));
            index += 1;
          }
          html.push('<blockquote>' + quoteLines.map((part) => renderInlineMarkdown(part)).join('<br>') + '</blockquote>');
          continue;
        }

        if (/^[-*]\\s+/.test(trimmed)) {
          const items = [];
          while (index < lines.length && /^(\\s*)[-*]\\s+/.test(lines[index])) {
            const rawLine = lines[index];
            const indent = Math.floor((rawLine.match(/^(\\s*)/)?.[1]?.length ?? 0) / 2);
            items.push({
              indent,
              text: rawLine.trim().replace(/^[-*]\\s+/, ''),
            });
            index += 1;
          }
          html.push('<ul>' + items.map((item) => {
            const task = item.text.match(/^\\[( |x|X)\\]\\s+(.*)$/);
            const style = item.indent > 0 ? ' style="margin-left:' + (item.indent * 18) + 'px"' : '';
            if (task) {
              const checked = task[1].toLowerCase() === 'x';
              return '<li class="task-item"' + style + '><span class="task-box">' + (checked ? '&#10003;' : '') + '</span>' + renderInlineMarkdown(task[2]) + '</li>';
            }
            return '<li' + style + '>' + renderInlineMarkdown(item.text) + '</li>';
          }).join('') + '</ul>');
          continue;
        }

        if (/^\\d+\\.\\s+/.test(trimmed)) {
          const items = [];
          while (index < lines.length && /^(\\s*)\\d+\\.\\s+/.test(lines[index])) {
            const rawLine = lines[index];
            const indent = Math.floor((rawLine.match(/^(\\s*)/)?.[1]?.length ?? 0) / 2);
            items.push({
              indent,
              text: rawLine.trim().replace(/^\\d+\\.\\s+/, ''),
            });
            index += 1;
          }
          html.push('<ol>' + items.map((item) => {
            const style = item.indent > 0 ? ' style="margin-left:' + (item.indent * 18) + 'px"' : '';
            return '<li' + style + '>' + renderInlineMarkdown(item.text) + '</li>';
          }).join('') + '</ol>');
          continue;
        }

        const paragraphLines = [];
        while (index < lines.length) {
          const candidate = lines[index].trim();
          if (!candidate) break;
          if (candidate.startsWith(codeFence)) break;
          if (/^(#{1,4})\\s+/.test(candidate)) break;
          if (candidate.startsWith('>')) break;
          if (/^[-*]\\s+/.test(candidate)) break;
          if (/^\\d+\\.\\s+/.test(candidate)) break;
          if (isTableRow(candidate) && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) break;
          paragraphLines.push(candidate);
          index += 1;
        }
        html.push('<p>' + renderInlineMarkdown(paragraphLines.join(' ')) + '</p>');
      }

      if (footnotes.length > 0) {
        html.push(
          '<section class="footnotes"><strong>Notes</strong><ol>' +
          footnotes.map((item) => '<li><span class="footnote-ref">[' + escapeHtml(item.key) + ']</span> ' + renderInlineMarkdown(item.text) + '</li>').join('') +
          '</ol></section>'
        );
      }

      return html.join('');
    }

    function renderMeta(meta) {
      const items = [
        ['Model', meta.model],
        ['Agent', meta.activeAgentName],
        ['Paper', meta.activePaperId || '-'],
        ['Strict', meta.strictReady === true ? 'PASS' : meta.strictReady === false ? 'FAIL' : '-'],
      ];
      els.metaGrid.innerHTML = items.map(([label, value]) => '<div class="meta-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value || '-')) + '</strong></div>').join('');
    }

    function renderValidationPanel() {
      if (!state.paperValidation || !state.paperValidation.paperId) {
        els.validationPanel.innerHTML = '';
        return;
      }
      const summary = state.paperValidation.summary || { passed: 0, failed: 0, warnings: 0 };
      const statusClass = state.paperValidation.ready === true ? 'pass' : state.paperValidation.ready === false ? 'fail' : 'pending';
      const statusText = state.paperValidation.ready === true ? 'Strict Pass' : state.paperValidation.ready === false ? 'Strict Fail' : 'Pending';
      const checklist = Array.isArray(state.paperValidation.checklist) ? state.paperValidation.checklist : [];
      const priorityItems = checklist
        .filter((item) => item.status !== 'passed')
        .concat(checklist.filter((item) => item.status === 'passed'))
        .slice(0, 6);
      const itemHtml = priorityItems.length === 0
        ? '<div class="empty">No strict-validation checklist found for the active paper workspace.</div>'
        : priorityItems.map((item) =>
          '<article class="validation-item">' +
            '<div class="validation-item-head">' +
              '<div class="validation-item-label">' + escapeHtml(item.label || item.id || 'Check') + '</div>' +
              '<span class="badge ' + escapeHtml(item.status) + '">' + escapeHtml(item.status) + '</span>' +
            '</div>' +
            '<div class="validation-item-detail">' + escapeHtml(item.detail || '-') + '</div>' +
          '</article>'
        ).join('');
      const strictPath = state.paperValidation.strictValidationPath
        ? '<div><span>Strict validation</span><code>' + escapeHtml(state.paperValidation.strictValidationPath) + '</code></div>'
        : '';
      const evidencePath = state.paperValidation.evidenceManifestPath
        ? '<div><span>Evidence manifest</span><code>' + escapeHtml(state.paperValidation.evidenceManifestPath) + '</code></div>'
        : '';

      els.validationPanel.innerHTML =
        '<section class="validation-panel">' +
          '<div class="panel-header" style="padding:0 0 10px; border:0;">' +
            '<h2>Paper Validation</h2>' +
            '<div class="validation-status ' + statusClass + '">' + escapeHtml(statusText) + '</div>' +
          '</div>' +
          '<div class="validation-meta">' +
            '<div class="validation-stat"><span>Paper</span><strong>' + escapeHtml(state.paperValidation.paperId) + '</strong></div>' +
            '<div class="validation-stat"><span>Passed / Failed</span><strong>' + escapeHtml(String(summary.passed)) + ' / ' + escapeHtml(String(summary.failed)) + '</strong></div>' +
            '<div class="validation-stat"><span>Warnings</span><strong>' + escapeHtml(String(summary.warnings)) + '</strong></div>' +
          '</div>' +
          '<div class="validation-list">' + itemHtml + '</div>' +
          '<div class="validation-paths">' + strictPath + evidencePath + '</div>' +
        '</section>';
    }

    function renderAgents() {
      if (!state.agents.length) {
        els.agentStrip.innerHTML = '<div class="empty">No agents registered.</div>';
        return;
      }
      const runtimeMap = new Map(state.runtimeStates.map((item) => [item.agentId, item]));
      els.agentStrip.innerHTML = state.agents.map((agent) => {
        const rt = runtimeMap.get(agent.id) || {};
        const status = rt.status || 'idle';
        const active = status !== 'idle' && status !== 'completed';
        return '<article class="agent-card ' + escapeHtml(status) + ' ' + (active ? 'active' : '') + '">' +
          '<span class="agent-dot" aria-hidden="true"></span>' +
          '<h3 class="agent-name">' + escapeHtml(agent.name) + '</h3>' +
          (active ? '<span class="badge ' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>' : '') +
          '</article>';
      }).join('');
    }

    function renderMessages() {
      if (!state.messages.length) {
        els.messageList.innerHTML = '<div class="empty">No conversation yet. Send a task to start the web workspace.</div>';
        return;
      }
      els.messageList.innerHTML = state.messages.map((message) =>
        '<article class="message ' + escapeHtml(message.role) + '">' +
          '<div class="message-head">' +
            '<span class="message-role">' + escapeHtml(message.role) + '</span>' +
            '<span class="message-time">' + escapeHtml(timeOnly(message.timestamp)) + '</span>' +
          '</div>' +
          '<div class="message-content">' + renderMarkdown(message.content) + '</div>' +
        '</article>'
      ).join('');
      const scroller = els.messageList.parentElement;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }

    function renderLogs() {
      if (!state.logs.length) {
        els.logList.innerHTML = '<div class="empty">Runtime logs will appear here when agents reason, call tools, or hand off work.</div>';
        return;
      }
      els.logList.innerHTML = state.logs.map((entry) =>
        '<article class="log-entry ' + escapeHtml(entry.type) + '">' +
          '<div class="log-head">' +
            '<span class="log-kind">' + escapeHtml(entry.title) + '</span>' +
            '<span class="log-time">' + escapeHtml(timeOnly(entry.timestamp)) + '</span>' +
          '</div>' +
          '<div class="log-content">' + escapeHtml(entry.content) + '</div>' +
        '</article>'
      ).join('');
    }

    function renderSessions() {
      if (!state.sessions.length) {
        els.sessionList.innerHTML = '<div class="empty">No saved sessions yet.</div>';
        return;
      }
      els.sessionList.innerHTML = state.sessions.map((session) =>
        '<article class="session-card ' + (state.activeSessionId === session.id ? 'active' : '') + '" data-session-id="' + escapeHtml(session.id) + '">' +
          '<div class="session-row">' +
            '<h3 class="session-title">' + escapeHtml(session.title) + '</h3>' +
            '<div class="session-tools">' +
              '<button class="ghost" data-action="rename" data-session-id="' + escapeHtml(session.id) + '" type="button">Rename</button>' +
              '<button class="ghost" data-action="delete" data-session-id="' + escapeHtml(session.id) + '" type="button">Delete</button>' +
            '</div>' +
          '</div>' +
          '<div class="session-preview">' + escapeHtml(session.preview || 'No messages yet.') + '</div>' +
          '<div class="session-meta"><span>' + escapeHtml(timeOnly(session.createdAt)) + '</span><span>' + escapeHtml(String(session.messageCount)) + ' msgs</span></div>' +
        '</article>'
      ).join('');
    }

    function syncAgentSelect() {
      const options = state.agents.map((agent) => '<option value="' + escapeHtml(agent.id) + '"' + (state.activeAgentId === agent.id ? ' selected' : '') + '>' + escapeHtml(agent.name) + '</option>');
      els.agentSelect.innerHTML = options.join('');
    }

    function cloneSettings(settings) {
      return settings ? JSON.parse(JSON.stringify(settings)) : null;
    }

    function markSettingsDirty() {
      if (!state.settingsOpen) return;
      state.settingsDirty = true;
    }

    function renderSettings(force = false) {
      if (state.settingsOpen && state.settingsDirty && !force) return;
      const settings = state.settingsDraft || state.settings;
      if (!settings) return;
      els.settingsWorkspacePath.value = settings.workspacePath || '';
      els.settingsBaseUrl.value = settings.config?.baseUrl || '';
      els.settingsApiKey.value = settings.config?.apiKey || '';
      els.settingsModel.value = settings.config?.model || '';
      els.settingsRoutingBaseUrl.value = settings.routing?.baseUrl || '';
      els.settingsRoutingApiKey.value = settings.routing?.apiKey || '';
      els.settingsRoutingModel.value = settings.routing?.model || '';
      els.settingsThink.checked = settings.config?.think !== false;
      els.settingsMcpList.innerHTML = (settings.mcpServers || []).map((server) =>
        '<label class="checkbox-row">' +
          '<span><strong>' + escapeHtml(server.name) + '</strong><br><span class="status-inline">' + escapeHtml(server.type || 'stdio') + ' | ' + escapeHtml(server.running ? 'running' : 'stopped') + '</span><br><span class="status-inline">' + escapeHtml(server.description || '') + '</span></span>' +
          '<span style="display:flex; gap:8px; align-items:center;"><input type="checkbox" data-mcp-name="' + escapeHtml(server.name) + '"' + (server.enabled ? ' checked' : '') + ' /><button class="ghost" type="button" data-mcp-remove="' + escapeHtml(server.name) + '">Remove</button></span>' +
        '</label>'
      ).join('') || '<div class="empty">No MCP servers configured.</div>';
      els.settingsSkillList.innerHTML = (settings.skills || []).map((skill) =>
        '<article class="session-card" style="cursor:default;">' +
          '<div class="session-row">' +
            '<h3 class="session-title">' + escapeHtml(skill.name) + '</h3>' +
            '<div class="session-tools">' +
              '<button class="ghost" type="button" data-skill-update="' + escapeHtml(skill.name) + '">Update</button>' +
              '<button class="ghost" type="button" data-skill-remove="' + escapeHtml(skill.name) + '">Remove</button>' +
            '</div>' +
          '</div>' +
          '<div class="session-preview">' + escapeHtml(skill.description || '') + '</div>' +
          '<div class="session-meta"><span>v' + escapeHtml(skill.version || '0.0.0') + '</span><span>' + escapeHtml((skill.commands || []).join(', ')) + '</span></div>' +
        '</article>'
      ).join('') || '<div class="empty">No skills loaded.</div>';
    }

    function setSettingsOpen(open) {
      state.settingsOpen = open;
      els.settingsDrawer.classList.toggle('open', open);
      els.settingsDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        state.settingsDirty = false;
        state.settingsDraft = cloneSettings(state.settings);
        renderSettings(true);
      } else {
        state.settingsDirty = false;
        state.settingsDraft = null;
      }
    }

    async function fetchState() {
      const res = await fetch('/api/state');
      const payload = await res.json();
      state.agents = payload.agents || [];
      state.messages = payload.messages || [];
      state.logs = payload.logs || [];
      state.runtimeStates = payload.runtimeStates || [];
      state.activeAgentId = payload.activeAgentId || 'advisor';
      state.activeSessionId = payload.activeSessionId || '';
      state.sessions = payload.sessions || [];
      state.paperValidation = payload.paperValidation || null;
      state.settings = payload.settings || state.settings;
      renderMeta(payload.meta || {});
      renderAgents();
      renderSessions();
      renderValidationPanel();
      renderMessages();
      renderLogs();
      if (!state.settingsOpen || !state.settingsDirty) {
        state.settingsDraft = cloneSettings(state.settings);
        renderSettings(true);
      }
      syncAgentSelect();
      els.conversationStatus.textContent = state.sending ? 'Waiting for model response' : 'Ready';
      els.runtimeStatus.textContent = (payload.logs || []).length ? 'Runtime telemetry active' : 'Awaiting agent activity';
      els.sendStatus.textContent = payload.meta?.runtimeReady ? 'Connected' : 'Runtime unavailable';
      els.sessionStatus.textContent = state.sessions.length ? (state.activeSessionId ? 'Session loaded' : 'Select a session') : 'Local history';
    }

    function connectEventStream() {
      const stream = new EventSource('/api/events');
      stream.addEventListener('runtime', (event) => {
        const payload = JSON.parse(event.data || '{}');
        state.runtimeStates = payload.runtimeStates || state.runtimeStates;
        renderAgents();
      });
      stream.addEventListener('log', (event) => {
        const payload = JSON.parse(event.data || '{}');
        if (payload.entry) {
          state.logs.push(payload.entry);
          if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
          renderLogs();
        }
        if (payload.runtimeStates) {
          state.runtimeStates = payload.runtimeStates;
          renderAgents();
        }
      });
      stream.onerror = () => {
        els.runtimeStatus.textContent = 'Runtime stream reconnecting...';
      };
      stream.onopen = () => {
        els.runtimeStatus.textContent = 'Runtime stream live';
      };
    }

    function reportUiFailure(error, context) {
      const message = (error && error.message) ? error.message : String(error);
      els.conversationStatus.textContent = 'UI error';
      els.runtimeStatus.textContent = 'UI error';
      els.sendStatus.textContent = context + ': ' + message;
      console.error('[tzukwan-web]', context, error);
    }

    async function sendMessage() {
      const message = els.composerInput.value.trim();
      if (!message || state.sending) return;
      const agentId = els.agentSelect.value || state.activeAgentId;
      const sessionId = state.activeSessionId;
      state.sending = true;
      els.sendButton.disabled = true;
      els.conversationStatus.textContent = 'Streaming response. Queue/steer is not available in Web yet.';
      els.sendStatus.textContent = 'Sending';
      els.composerInput.value = '';
      state.messages.push({
        id: 'local_user_' + Date.now(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        agentId,
      });
      renderMessages();
      try {
        if (message.startsWith('/')) {
          const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, agentId, sessionId }),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || 'Request failed');
          await fetchState();
        } else {
          const assistantEntry = {
            id: 'local_assistant_' + Date.now(),
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            agentId,
          };
          state.messages.push(assistantEntry);
          renderMessages();
          const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, agentId, sessionId }),
          });
          if (!res.ok || !res.body) {
            const payload = await res.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(payload.error || 'Request failed');
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let streamed = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            streamed += decoder.decode(value, { stream: true });
            assistantEntry.content = streamed;
            renderMessages();
          }
          assistantEntry.content = streamed.trim();
          renderMessages();
          await fetchState();
        }
      } catch (error) {
        state.messages.push({
          id: 'local_error_' + Date.now(),
          role: 'system',
          content: 'Error: ' + (error.message || String(error)),
          timestamp: new Date().toISOString(),
        });
        renderMessages();
        alert(error.message || String(error));
      } finally {
        state.sending = false;
        els.sendButton.disabled = false;
        els.sendStatus.textContent = 'Ready';
        els.conversationStatus.textContent = 'Ready';
      }
    }

    els.sendButton.addEventListener('click', sendMessage);
    els.refreshButton.addEventListener('click', fetchState);
    els.settingsButton.addEventListener('click', () => setSettingsOpen(true));
    els.settingsCloseButton.addEventListener('click', () => setSettingsOpen(false));
    els.settingsDrawer.addEventListener('input', (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.settings-body')) {
        markSettingsDirty();
      }
    });
    els.settingsDrawer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.settings-body')) {
        markSettingsDirty();
      }
    });
    els.settingsMcpList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const name = target.getAttribute('data-mcp-remove');
      if (!name) return;
      if (!window.confirm('Remove MCP server ' + name + '?')) return;
      const res = await fetch('/api/mcp/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await res.json();
      els.settingsMcpStatus.textContent = res.ok ? ('Removed ' + name + ' and reloaded runtime.') : (payload.error || 'Remove failed');
      if (res.ok) await fetchState();
    });
    els.settingsSkillList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeName = target.getAttribute('data-skill-remove');
      const updateName = target.getAttribute('data-skill-update');
      if (removeName) {
        if (!window.confirm('Remove skill ' + removeName + '?')) return;
        const res = await fetch('/api/skills/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: removeName }),
        });
        const payload = await res.json();
        els.settingsSkillStatus.textContent = res.ok ? ('Removed ' + removeName + ' and reloaded runtime.') : (payload.error || 'Remove failed');
        if (res.ok) await fetchState();
        return;
      }
      if (updateName) {
        const res = await fetch('/api/skills/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceOrName: updateName }),
        });
        const payload = await res.json();
        els.settingsSkillStatus.textContent = res.ok ? ('Updated ' + updateName + ' and reloaded runtime.') : (payload.error || 'Update failed');
        if (res.ok) await fetchState();
      }
    });
    els.newSessionButton.addEventListener('click', async () => {
      await fetch('/api/sessions', { method: 'POST' });
      await fetchState();
    });
    els.agentSelect.addEventListener('change', async () => {
      await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: els.agentSelect.value }),
      });
      await fetchState();
    });
    els.composerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    els.sessionList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const sessionId = target.dataset.sessionId || target.closest('[data-session-id]')?.getAttribute('data-session-id');
      if (!sessionId) return;
      if (action === 'rename') {
        event.stopPropagation();
        const current = state.sessions.find((item) => item.id === sessionId);
        const title = window.prompt('Rename session', current?.title || '');
        if (!title) return;
        await fetch('/api/sessions/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, title }),
        });
        await fetchState();
        return;
      }
      if (action === 'delete') {
        event.stopPropagation();
        if (!window.confirm('Delete this session?')) return;
        await fetch('/api/sessions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        await fetchState();
        return;
      }
      await fetch('/api/sessions/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await fetchState();
    });

    els.settingsTestButton.addEventListener('click', async () => {
      els.settingsStatus.textContent = 'Testing connection...';
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'main',
          baseUrl: els.settingsBaseUrl.value.trim(),
          apiKey: els.settingsApiKey.value,
          model: els.settingsModel.value.trim(),
          think: els.settingsThink.checked,
        }),
      });
      const payload = await res.json();
      els.settingsStatus.textContent = res.ok ? 'Connection test passed.' : ('Connection test failed: ' + (payload.error || 'Unknown error'));
    });

    els.settingsRoutingTestButton.addEventListener('click', async () => {
      els.settingsRoutingStatus.textContent = 'Testing routing model...';
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'routing',
          baseUrl: els.settingsRoutingBaseUrl.value.trim(),
          apiKey: els.settingsRoutingApiKey.value,
          model: els.settingsRoutingModel.value.trim(),
        }),
      });
      const payload = await res.json();
      els.settingsRoutingStatus.textContent = res.ok ? 'Routing model test passed.' : ('Routing model test failed: ' + (payload.error || 'Unknown error'));
    });

    els.settingsSaveButton.addEventListener('click', async () => {
      els.settingsStatus.textContent = 'Saving settings...';
      const mcpServers = Array.from(els.settingsMcpList.querySelectorAll('input[data-mcp-name]')).map((input) => ({
        name: input.getAttribute('data-mcp-name'),
        enabled: input.checked,
      }));
      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspacePath: els.settingsWorkspacePath.value.trim(),
          baseUrl: els.settingsBaseUrl.value.trim(),
          apiKey: els.settingsApiKey.value,
          model: els.settingsModel.value.trim(),
          routing: {
            baseUrl: els.settingsRoutingBaseUrl.value.trim(),
            apiKey: els.settingsRoutingApiKey.value,
            model: els.settingsRoutingModel.value.trim(),
          },
          think: els.settingsThink.checked,
          mcpServers,
        }),
      });
      const payload = await res.json();
      els.settingsStatus.textContent = res.ok ? 'Saved and runtime reloaded.' : (payload.error || 'Save failed');
      if (res.ok) {
        state.settingsDirty = false;
        state.settingsDraft = null;
        await fetchState();
      }
    });
    els.settingsMcpAddButton.addEventListener('click', async () => {
      els.settingsMcpStatus.textContent = 'Adding MCP server...';
      const args = els.settingsMcpArgs.value.trim()
        ? els.settingsMcpArgs.value.trim().split(/\\s+/).filter(Boolean)
        : [];
      const res = await fetch('/api/mcp/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: els.settingsMcpName.value.trim(),
          command: els.settingsMcpCommand.value.trim(),
          args,
          description: els.settingsMcpDescription.value.trim(),
          enabled: true,
        }),
      });
      const payload = await res.json();
      els.settingsMcpStatus.textContent = res.ok ? 'MCP added and runtime reloaded.' : (payload.error || 'Add failed');
      if (res.ok) {
        els.settingsMcpName.value = '';
        els.settingsMcpCommand.value = '';
        els.settingsMcpArgs.value = '';
        els.settingsMcpDescription.value = '';
        await fetchState();
      }
    });
    els.settingsMcpRefreshButton.addEventListener('click', async () => {
      const res = await fetch('/api/mcp/refresh', { method: 'POST' });
      const payload = await res.json();
      els.settingsMcpStatus.textContent = res.ok ? 'MCP registry reloaded.' : (payload.error || 'Reload failed');
      if (res.ok) await fetchState();
    });
    els.settingsSkillInstallButton.addEventListener('click', async () => {
      els.settingsSkillStatus.textContent = 'Installing skill...';
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: els.settingsSkillSource.value.trim() }),
      });
      const payload = await res.json();
      els.settingsSkillStatus.textContent = res.ok ? 'Skill installed and runtime reloaded.' : (payload.error || 'Install failed');
      if (res.ok) {
        els.settingsSkillSource.value = '';
        await fetchState();
      }
    });
    els.settingsSkillRefreshButton.addEventListener('click', async () => {
      const res = await fetch('/api/skills/refresh', { method: 'POST' });
      const payload = await res.json();
      els.settingsSkillStatus.textContent = res.ok ? 'Skill registry reloaded.' : (payload.error || 'Reload failed');
      if (res.ok) await fetchState();
    });

    fetchState().catch((error) => reportUiFailure(error, 'Initial state load failed'));
    try {
      connectEventStream();
    } catch (error) {
      reportUiFailure(error, 'Runtime stream failed');
    }
    setInterval(() => {
      fetchState().catch((error) => reportUiFailure(error, 'State refresh failed'));
    }, 10000);
  </script>
</body>
</html>`;
}

export async function startWebServer(options: WebServerOptions): Promise<void> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3847;
  const autoOpenBrowser = options.autoOpenBrowser !== false;
  const existing = getActiveWebProcessState(host, port);
  if (existing && existing.pid !== process.pid) {
    process.stdout.write(`Tzukwan Web already running on http://${existing.host}:${existing.port} (pid ${existing.pid})\n`);
    return;
  }
  const persistedWebSettings = readWebSettings();
  let currentWorkspacePath = (() => {
    const candidate = persistedWebSettings.workspacePath?.trim();
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
    return process.cwd();
  })();
  if (process.cwd() !== currentWorkspacePath) {
    process.chdir(currentWorkspacePath);
  }
  let runtime = await loadCLIRuntime(options.config, { cwd: currentWorkspacePath });
  let mergedConfig = await new ConfigLoader().loadConfig(currentWorkspacePath);
  const sessionManager = new SessionManager();
  const logs: WebLogEntry[] = [];
  const eventClients = new Set<http.ServerResponse>();
  let activeAgentId = runtime.orchestrator.getActiveAgent().id;
  let sessionTitles = readSessionTitles();
  let activeSession = (await sessionManager.listSessions())[0] ?? sessionManager.createSession(mergedConfig);
  const webState: REPLState = {
    conversationHistory: toChatHistory(activeSession),
    multiLineBuffer: '',
    isMultiLine: false,
    currentAgent: activeAgentId,
    agentMode: false,
    thinkMode: options.config.think !== false,
    sessionName: activeSession.id,
    sessionStart: activeSession.createdAt,
    activePaperId: null,
    activeTaskId: null,
    approvalMode: 'suggest',
  };

  await sessionManager.saveSession(activeSession);
  runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);

  const appendLog = (entry: Omit<WebLogEntry, 'id'>): void => {
    const nextEntry = { id: uid('log'), ...entry };
    logs.push(nextEntry);
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    const payload = JSON.stringify({
      entry: nextEntry,
      runtimeStates: getAgentRuntimeStates().map(formatRuntimeState),
    });
    for (const client of eventClients) {
      client.write(`event: log\n`);
      client.write(`data: ${payload}\n\n`);
    }
  };

  const persistActiveSession = async (): Promise<void> => {
    await sessionManager.saveSession(activeSession);
    webState.conversationHistory = toChatHistory(activeSession);
    webState.sessionName = activeSession.id;
    if (!sessionTitles[activeSession.id] || sessionTitles[activeSession.id] === 'Untitled Session') {
      sessionTitles[activeSession.id] = inferSessionTitle(toWebMessages(activeSession));
      writeSessionTitles(sessionTitles);
    }
  };

  const reloadRuntime = async (nextConfig?: Config): Promise<void> => {
    if (nextConfig) {
      options.config = nextConfig;
    }
    resetRuntimeCache();
    runtime.mcpManager.stopAll();
    if (process.cwd() !== currentWorkspacePath) {
      process.chdir(currentWorkspacePath);
    }
    mergedConfig = await new ConfigLoader().loadConfig(currentWorkspacePath);
    runtime = await loadCLIRuntime(options.config, { cwd: currentWorkspacePath, useCache: false });
    if (!runtime.orchestrator.setActiveAgent(activeAgentId)) {
      activeAgentId = runtime.orchestrator.getActiveAgent().id;
    }
    runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
    runtime.orchestrator.setThinkMode(options.config.think !== false);
    webState.currentAgent = activeAgentId;
    webState.thinkMode = options.config.think !== false;
  };

  const integrationWatchers: fs.FSWatcher[] = [];
  let integrationReloadTimer: NodeJS.Timeout | null = null;
  const scheduleIntegrationReload = (reason: string): void => {
    if (integrationReloadTimer) clearTimeout(integrationReloadTimer);
    integrationReloadTimer = setTimeout(async () => {
      await reloadRuntime();
      appendLog({
        type: 'agent',
        title: 'Runtime',
        content: `Reloaded integrations after change: ${reason}`,
        timestamp: new Date().toISOString(),
      });
    }, 300);
  };
  for (const watchPath of [
    path.join(WEB_META_DIR, 'mcp-servers.json'),
    path.join(WEB_META_DIR, 'skills'),
    path.join(currentWorkspacePath, '.tzukwan', 'skills'),
    path.join(currentWorkspacePath, 'skills'),
  ]) {
    try {
      if (fs.existsSync(watchPath)) {
        integrationWatchers.push(fs.watch(
          watchPath,
          { recursive: fs.statSync(watchPath).isDirectory() },
          () => scheduleIntegrationReload(watchPath),
        ));
      }
    } catch {
      // Best-effort only.
    }
  }

  const loadSessionIntoRuntime = async (sessionId: string): Promise<boolean> => {
    const loaded = await sessionManager.loadSession(sessionId);
    if (!loaded) return false;
    activeSession = loaded;
    runtime.orchestrator.resetAllConversations();
    runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
    webState.conversationHistory = toChatHistory(activeSession);
    webState.sessionName = activeSession.id;
    webState.sessionStart = activeSession.createdAt;
    return true;
  };

  const createSession = async (): Promise<Session> => {
    const session = sessionManager.createSession(mergedConfig);
    await sessionManager.saveSession(session);
    sessionTitles[session.id] = 'Untitled Session';
    writeSessionTitles(sessionTitles);
    activeSession = session;
    runtime.orchestrator.resetAllConversations();
    runtime.orchestrator.restoreSessionMessages(activeAgentId, []);
    webState.conversationHistory = [];
    webState.sessionName = activeSession.id;
    webState.sessionStart = activeSession.createdAt;
    return session;
  };

  const buildStatePayload = async () => {
    const skillsModule = await import('@tzukwan/skills');
    const skillRegistry = skillsModule.SkillRegistry.getInstance();
    skillRegistry.clear();
    await skillRegistry.initializeDefault(currentWorkspacePath);
    const loadedSkills = skillRegistry.list();
    const currentPaperValidation: WebPaperValidationSummary | null = (() => {
      if (!webState.activePaperId) return null;
      try {
        const workspaceDir = runtime.paperWorkspace.getWorkspaceDir(webState.activePaperId);
        const strictPath = path.join(workspaceDir, 'strict-validation.json');
        const evidencePath = path.join(workspaceDir, 'evidence-manifest.json');
        const strict = fs.existsSync(strictPath)
          ? JSON.parse(fs.readFileSync(strictPath, 'utf-8').replace(/^\uFEFF/, '')) as {
            ready?: boolean;
            checklist?: WebPaperValidationItem[];
            summary?: { passed?: number; failed?: number; warnings?: number };
          }
          : null;
        return {
          paperId: webState.activePaperId,
          ready: strict?.ready ?? null,
          strictValidationPath: fs.existsSync(strictPath) ? strictPath : null,
          evidenceManifestPath: fs.existsSync(evidencePath) ? evidencePath : null,
          checklist: Array.isArray(strict?.checklist) ? strict.checklist : [],
          summary: strict?.summary
            ? {
              passed: strict.summary.passed ?? 0,
              failed: strict.summary.failed ?? 0,
              warnings: strict.summary.warnings ?? 0,
            }
            : null,
        };
      } catch {
        return null;
      }
    })();
    const productionState = readProductionState();
    const agents = runtime.orchestrator.getAgents().map((agent) => ({
      id: agent.id,
      name: stripEmoji(agent.name),
      role: agent.role,
      description: agent.description,
    }));
    const runtimeStates = getAgentRuntimeStates().map(formatRuntimeState);
    const sessions = (await sessionManager.listSessions())
      .map((session) => buildSessionSummary(session, sessionTitles))
      .sort((a, b) => {
        const aHasContent = a.messageCount > 0 ? 1 : 0;
        const bHasContent = b.messageCount > 0 ? 1 : 0;
        if (aHasContent !== bHasContent) return bHasContent - aHasContent;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    return {
      agents,
      messages: toWebMessages(activeSession),
      logs,
      runtimeStates,
      activeAgentId,
      activeSessionId: activeSession.id,
      sessions,
      settings: {
        config: {
          baseUrl: options.config.baseUrl,
          apiKey: options.config.apiKey,
          model: options.config.model,
          think: options.config.think !== false,
        },
        workspacePath: currentWorkspacePath,
        routing: (() => {
          const routing = getRoutingConfig();
          return routing ? {
            baseUrl: routing.baseUrl,
            apiKey: routing.apiKey,
            model: routing.model,
          } : null;
        })(),
        mcpServers: runtime.mcpManager.listServers().map((server) => ({
          name: server.name,
          enabled: server.enabled,
          type: server.type,
          description: server.description ?? '',
          command: server.command ?? '',
          args: server.args ?? [],
          running: runtime.mcpManager.isRunning(server.name),
        })),
        skills: loadedSkills.map((skill) => ({
          name: skill.name,
          version: skill.version,
          description: skill.description,
          author: skill.author ?? '',
          commands: skill.commands.map((command) => command.name),
          loaded: true,
          sourceDir: skill.sourceDir ?? '',
        })),
      },
      meta: {
        model: options.config.model,
        endpoint: describeEndpoint(options.config.baseUrl),
        provider: options.config.provider,
        runtimeReady: true,
        activeAgentName: stripEmoji(runtime.orchestrator.getActiveAgent().name),
        activePaperId: webState.activePaperId,
        strictReady: currentPaperValidation?.ready,
        productionReady: productionState?.isProductionReady ?? null,
        qualityScore: productionState?.qualityScore ?? null,
      },
      paperValidation: currentPaperValidation,
    };
  };

  setAgentCommListener((event) => {
    appendLog({
      type: 'agent',
      title: `${stripEmoji(event.from)} -> ${stripEmoji(event.to)}`,
      content: event.content,
      timestamp: event.timestamp,
    });
  });

  setAgentRuntimeListener((event) => {
    const runtimePayload = JSON.stringify({
      runtimeStates: getAgentRuntimeStates().map(formatRuntimeState),
    });
    for (const client of eventClients) {
      client.write(`event: runtime\n`);
      client.write(`data: ${runtimePayload}\n\n`);
    }
    if (event.kind === 'thinking') {
      appendLog({
        type: 'think',
        title: stripEmoji(event.agentName),
        content: event.detail,
        timestamp: event.timestamp,
        agentId: event.agentId,
      });
      return;
    }
    if (event.kind === 'tool-start' || event.kind === 'tool-end') {
      appendLog({
        type: 'tool',
        title: `${stripEmoji(event.agentName)} :: ${stripEmoji(event.toolName ?? 'tool')}`,
        content: event.detail,
        timestamp: event.timestamp,
        agentId: event.agentId,
      });
      return;
    }
    if ((event as { kind: string }).kind === 'routing') {
      appendLog({
        type: 'route',
        title: `${stripEmoji(event.agentName)} :: routing`,
        content: event.detail,
        timestamp: event.timestamp,
        agentId: event.agentId,
      });
      return;
    }
    appendLog({
      type: 'agent',
      title: stripEmoji(event.agentName),
      content: event.detail,
      timestamp: event.timestamp,
      agentId: event.agentId,
    });
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);

      if (req.method === 'GET' && url.pathname === '/') {
        text(res, 200, makeHtml(), 'text/html');
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`event: runtime\n`);
        res.write(`data: ${JSON.stringify({ runtimeStates: getAgentRuntimeStates().map(formatRuntimeState) })}\n\n`);
        eventClients.add(res);
        req.on('close', () => {
          eventClients.delete(res);
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, await buildStatePayload());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/agent') {
        try {
          const payload = await readJsonBody(req);
          const agentId = String(payload.agentId ?? '').trim();
          if (!agentId || !runtime.orchestrator.setActiveAgent(agentId)) {
            json(res, 400, { error: 'Unknown agent' });
            return;
          }
          activeAgentId = agentId;
          webState.currentAgent = agentId;
          runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
          json(res, 200, { ok: true, agentId });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/settings/test') {
        try {
          const payload = await readJsonBody(req);
          const nextConfig = buildDirectConfig({
            baseUrl: String(payload.baseUrl ?? '').trim(),
            apiKey: String(payload.apiKey ?? ''),
            model: String(payload.model ?? '').trim(),
            think: Boolean(payload.think ?? true),
          });
          const target = String(payload.target ?? 'main');
          const result = target === 'routing'
            ? await testRoutingConnection(nextConfig)
            : await testConfigConnection(nextConfig);
          if (!result.success) {
            json(res, 400, { error: result.error ?? 'Connection failed' });
            return;
          }
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/settings/save') {
        try {
          const payload = await readJsonBody(req);
          const workspacePath = String(payload.workspacePath ?? '').trim();
          if (workspacePath) {
            const resolvedWorkspacePath = path.resolve(workspacePath);
            const stats = fs.statSync(resolvedWorkspacePath);
            if (!stats.isDirectory()) {
              json(res, 400, { error: 'Workspace path must be a directory' });
              return;
            }
            fs.accessSync(resolvedWorkspacePath, fs.constants.R_OK | fs.constants.W_OK);
            currentWorkspacePath = resolvedWorkspacePath;
            writeWebSettings({ workspacePath: currentWorkspacePath });
            process.chdir(currentWorkspacePath);
          }
          const nextConfig = buildDirectConfig({
            baseUrl: String(payload.baseUrl ?? '').trim(),
            apiKey: String(payload.apiKey ?? ''),
            model: String(payload.model ?? '').trim(),
            think: Boolean(payload.think ?? true),
          });
          saveConfig(nextConfig);
          const routingPayload = (payload.routing ?? {}) as Record<string, unknown>;
          if (String(routingPayload.baseUrl ?? '').trim() && String(routingPayload.apiKey ?? '').trim() && String(routingPayload.model ?? '').trim()) {
            saveRoutingConfig(buildDirectConfig({
              baseUrl: String(routingPayload.baseUrl ?? '').trim(),
              apiKey: String(routingPayload.apiKey ?? ''),
              model: String(routingPayload.model ?? '').trim(),
            }));
          }
          options.config = nextConfig;
          const mcpServers = Array.isArray(payload.mcpServers) ? payload.mcpServers as Array<{ name?: string; enabled?: boolean }> : [];
          for (const server of mcpServers) {
            if (server.name) {
              runtime.mcpManager.setEnabled(server.name, Boolean(server.enabled));
            }
          }
          await reloadRuntime(nextConfig);
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/skills/install') {
        try {
          const payload = await readJsonBody(req);
          const source = String(payload.source ?? '').trim();
          if (!source) {
            json(res, 400, { error: 'source is required' });
            return;
          }
          const skillsModule = await import('@tzukwan/skills');
          await skillsModule.installOrUpdateSkill(source);
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/skills/update') {
        try {
          const payload = await readJsonBody(req);
          const sourceOrName = String(payload.sourceOrName ?? '').trim();
          if (!sourceOrName) {
            json(res, 400, { error: 'sourceOrName is required' });
            return;
          }
          const skillsModule = await import('@tzukwan/skills');
          await skillsModule.updateSkill(sourceOrName);
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/skills/uninstall') {
        try {
          const payload = await readJsonBody(req);
          const name = String(payload.name ?? '').trim();
          if (!name) {
            json(res, 400, { error: 'name is required' });
            return;
          }
          const skillsModule = await import('@tzukwan/skills');
          await skillsModule.uninstallSkill(name);
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/skills/refresh') {
        await reloadRuntime();
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/mcp/toggle') {
        try {
          const payload = await readJsonBody(req);
          const name = String(payload.name ?? '').trim();
          const enabled = Boolean(payload.enabled);
          if (!name) {
            json(res, 400, { error: 'name is required' });
            return;
          }
          if (!runtime.mcpManager.setEnabled(name, enabled)) {
            json(res, 404, { error: 'Unknown MCP server' });
            return;
          }
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/mcp/remove') {
        try {
          const payload = await readJsonBody(req);
          const name = String(payload.name ?? '').trim();
          if (!name) {
            json(res, 400, { error: 'name is required' });
            return;
          }
          if (!runtime.mcpManager.removeServer(name)) {
            json(res, 404, { error: 'Unknown MCP server' });
            return;
          }
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/mcp/add') {
        try {
          const payload = await readJsonBody(req);
          const name = String(payload.name ?? '').trim();
          const command = String(payload.command ?? '').trim();
          const description = String(payload.description ?? '').trim();
          const args = Array.isArray(payload.args) ? payload.args.map((arg) => String(arg)) : [];
          const enabled = payload.enabled !== false;
          if (!name || !command) {
            json(res, 400, { error: 'name and command are required' });
            return;
          }
          runtime.mcpManager.addServer({
            name,
            type: 'stdio',
            command,
            args,
            description,
            enabled,
            installedAt: new Date().toISOString(),
          });
          await reloadRuntime();
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/mcp/refresh') {
        await reloadRuntime();
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        await createSession();
        json(res, 200, { ok: true, sessionId: activeSession.id });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions/select') {
        try {
          const payload = await readJsonBody(req);
          const sessionId = String(payload.sessionId ?? '').trim();
          if (!sessionId || !(await loadSessionIntoRuntime(sessionId))) {
            json(res, 404, { error: 'Unknown session' });
            return;
          }
          json(res, 200, { ok: true, sessionId });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions/rename') {
        try {
          const payload = await readJsonBody(req);
          const sessionId = String(payload.sessionId ?? '').trim();
          const title = String(payload.title ?? '').trim();
          if (!sessionId || !title) {
            json(res, 400, { error: 'sessionId and title are required' });
            return;
          }
          sessionTitles[sessionId] = title.slice(0, 120);
          writeSessionTitles(sessionTitles);
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sessions/delete') {
        try {
          const payload = await readJsonBody(req);
          const sessionId = String(payload.sessionId ?? '').trim();
          if (!sessionId) {
            json(res, 400, { error: 'sessionId is required' });
            return;
          }
          await sessionManager.deleteSession(sessionId);
          delete sessionTitles[sessionId];
          writeSessionTitles(sessionTitles);
          if (activeSession.id === sessionId) {
            const nextSession = (await sessionManager.listSessions())[0] ?? await createSession();
            activeSession = nextSession;
            runtime.orchestrator.resetAllConversations();
            runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
          }
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/chat/stream') {
        try {
          const payload = await readJsonBody(req);
          const message = String(payload.message ?? '').trim();
          const requestedAgentId = String(payload.agentId ?? '').trim();
          const requestedSessionId = String(payload.sessionId ?? '').trim();
          if (!message) {
            json(res, 400, { error: 'message is required' });
            return;
          }
          if (requestedSessionId && requestedSessionId !== activeSession.id) {
            const loaded = await loadSessionIntoRuntime(requestedSessionId);
            if (!loaded) {
              json(res, 404, { error: 'Unknown session' });
              return;
            }
          }
          if (requestedAgentId && runtime.orchestrator.setActiveAgent(requestedAgentId)) {
            activeAgentId = requestedAgentId;
            webState.currentAgent = requestedAgentId;
            runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
          }
          activeSession.messages.push({ role: 'user', content: message });
          webState.conversationHistory = toChatHistory(activeSession);

          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Transfer-Encoding': 'chunked',
          });

          const response = await streamWithOrchestratorTUI(
            message,
            webState,
            runtime.orchestrator,
            runtime.hookManager,
            runtime.memManager,
            runtime.paperWorkspace,
            (chunk) => res.write(chunk),
          );
          activeSession.messages.push({ role: 'assistant', content: response });
          await persistActiveSession();
          res.end();
        } catch (error) {
          if (!res.headersSent) {
            json(res, 500, { error: error instanceof Error ? error.message : String(error) });
          } else {
            res.write(`\n\n[stream-error] ${error instanceof Error ? error.message : String(error)}`);
            res.end();
          }
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        try {
          const payload = await readJsonBody(req);
          const message = String(payload.message ?? '').trim();
          const requestedAgentId = String(payload.agentId ?? '').trim();
          const requestedSessionId = String(payload.sessionId ?? '').trim();
          if (!message) {
            json(res, 400, { error: 'message is required' });
            return;
          }
          if (requestedSessionId && requestedSessionId !== activeSession.id) {
            const loaded = await loadSessionIntoRuntime(requestedSessionId);
            if (!loaded) {
              json(res, 404, { error: 'Unknown session' });
              return;
            }
          }
          if (requestedAgentId && runtime.orchestrator.setActiveAgent(requestedAgentId)) {
            activeAgentId = requestedAgentId;
            webState.currentAgent = requestedAgentId;
            runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
          }
          activeSession.messages.push({ role: 'user', content: message });
          webState.conversationHistory = toChatHistory(activeSession);
          const response = await runtime.orchestrator.chat(message);
          activeSession.messages.push({ role: 'assistant', content: response });
          await persistActiveSession();
          json(res, 200, { ok: true, response });
        } catch (error) {
          activeSession.messages.push({
            role: 'system',
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          });
          await persistActiveSession();
          json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/command') {
        try {
          const payload = await readJsonBody(req);
          const message = String(payload.message ?? '').trim();
          const requestedSessionId = String(payload.sessionId ?? '').trim();
          const requestedAgentId = String(payload.agentId ?? '').trim();
          if (!message.startsWith('/')) {
            json(res, 400, { error: 'Slash command is required' });
            return;
          }
          if (requestedSessionId && requestedSessionId !== activeSession.id) {
            const loaded = await loadSessionIntoRuntime(requestedSessionId);
            if (!loaded) {
              json(res, 404, { error: 'Unknown session' });
              return;
            }
          }
          if (requestedAgentId && runtime.orchestrator.setActiveAgent(requestedAgentId)) {
            activeAgentId = requestedAgentId;
            webState.currentAgent = requestedAgentId;
            runtime.orchestrator.restoreSessionMessages(activeAgentId, activeSession.messages);
          }
          const captured = await captureTerminalOutput(() => handleSlashCommand(message, webState, options.config, runtime));
          activeSession.messages.push({
            role: 'system',
            content: captured.output || `Executed ${message}`,
          });
          await persistActiveSession();
          if (captured.result === 'reload-runtime') {
            await reloadRuntime();
          }
          const refreshed = await getConfig();
          if (refreshed && (
            refreshed.baseUrl !== options.config.baseUrl ||
            refreshed.apiKey !== options.config.apiKey ||
            refreshed.model !== options.config.model ||
            refreshed.think !== options.config.think
          )) {
            await reloadRuntime(refreshed);
          }
          json(res, 200, { ok: true, output: captured.output, result: captured.result });
        } catch (error) {
          json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const serverUrl = `http://${host}:${port}`;
  writeWebProcessState({
    pid: process.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  });
  process.stdout.write(`Tzukwan Web listening on ${serverUrl}\n`);
  if (autoOpenBrowser) {
    openBrowser(serverUrl);
  }

  const shutdown = (): void => {
    clearWebProcessState();
    if (integrationReloadTimer) clearTimeout(integrationReloadTimer);
    for (const watcher of integrationWatchers) watcher.close();
    setAgentCommListener(null);
    setAgentRuntimeListener(null);
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await new Promise(() => {});
}

export async function waitForWebServer(host: string, port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canConnect(host, port, 800)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
