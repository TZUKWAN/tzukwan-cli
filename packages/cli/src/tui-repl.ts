import readline from 'readline';
import figlet from 'figlet';
import gradientString from 'gradient-string';
import chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CMD_HISTORY_FILE, CONFIG_PATH, MAX_CMD_HISTORY_SIZE, TZUKWAN_DIR } from './shared/constants.js';
import type { Config } from './commands/config.js';
import { getRoutingConfig, saveConfig } from './commands/config.js';
import {
  ALL_SLASH_COMMANDS,
  activatePaperWorkspace,
  captureTerminalOutput,
  handleSlashCommand,
  loadCore,
  normalizeApiKey,
  normalizeProvider,
  streamWithOrchestratorTUI,
  type CommandResult,
  type REPLState,
} from './repl.js';
import { resetRuntimeCache } from './shared/runtime.js';

export interface REPLOptions { config: Config; model?: string; }
type Keypress = { name?: string; shift?: boolean; ctrl?: boolean; meta?: boolean };
type TUIEntryKind = 'user' | 'assistant' | 'thinking' | 'system' | 'error';

interface TUIEntry {
  kind: TUIEntryKind;
  title: string;
  content: string;
}

interface InputViewport {
  visibleText: string;
  cursorColumn: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface AgentCommEntry {
  timestamp: string;
  from: string;
  to: string;
  type: 'delegate' | 'return' | 'broadcast' | 'tool';
  content: string;
}

interface ThinkLogEntry {
  timestamp: string;
  type: 'think';
  content: string;
  agentName: string;
}

interface ToolCallLogEntry {
  timestamp: string;
  type: 'tool';
  content: string;
  agentName: string;
  toolName: string;
}

interface RouteLogEntry {
  timestamp: string;
  type: 'route';
  content: string;
  agentName: string;
}

interface AgentCardState {
  agentId: string;
  agentName: string;
  status: 'idle' | 'running' | 'thinking' | 'tool' | 'completed' | 'error';
  detail: string;
  updatedAt: string;
  startedAt: string;
  stepName: string;
  toolName?: string;
  lastToolName?: string;
}

interface OverlayItem {
  id: string;
  label: string;
  description: string;
  preview?: string;
}

interface BoxSpec {
  width: number;
  height: number;
  title: string;
  titleColor?: (text: string) => string;
}

interface ActivePaperValidationSummary {
  paperId: string;
  ready: boolean | null;
  checklist: Array<{ label: string; status: 'passed' | 'failed' | 'warning'; detail: string }>;
  strictPath?: string;
  evidencePath?: string;
}

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const SPLASH_GRADIENT = gradientString(['#7dd3fc', '#38bdf8', '#0ea5e9']);
const SUGGESTIONS_PAGE = 5;
const MAX_LOG_ENTRIES = 40;
const DEFAULT_CONTEXT_WINDOW = 128000;
const PRODUCTION_STATE_PATH = path.join(process.cwd(), '.production-readiness-state.json');
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  '/help': 'Show help',
  '/clear': 'Clear the screen',
  '/history': 'Browse and restore saved sessions',
  '/compress': 'Compact long conversations',
  '/reset': 'Reset current conversation',
  '/config': 'Inspect or update runtime config',
  '/config routing': 'Inspect or update routing model config',
  '/model': 'Switch active model',
  '/think': 'Toggle think mode',
  '/agents': 'List available agents',
  '/agent': 'Switch active agent',
  '/chat': 'Switch current chat agent',
  '/collaborate': 'Run multi-agent collaboration',
  '/skills': 'Manage installed skills',
  '/search': 'Search literature',
  '/dataset': 'Search datasets',
  '/paper:new': 'Create a paper workspace',
  '/paper:list': 'List paper workspaces',
  '/paper:open': 'Open a paper workspace',
  '/paper:notes': 'View or append notes',
  '/paper:export': 'Export current workspace',
  '/tools': 'List active tools',
  '/permissions': 'Show tool permissions',
  '/mcp': 'Manage MCP servers',
  '/loop': 'Manage loops',
  '/hooks': 'Manage hooks',
  '/setup': 'Open setup wizard',
  '/profile:edit': 'Edit user profile',
  '/approve': 'Change approval mode',
  '/exit': 'Exit Tzukwan',
  '/quit': 'Exit Tzukwan',
};

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4.1': 128000,
  'gpt-4o-mini': 128000,
  'o1': 128000,
  'o3': 128000,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16385,
  'anthropic/claude-opus-4-5': 200000,
  'anthropic/claude-sonnet-4-5': 200000,
  'anthropic/claude-3-7-sonnet': 200000,
  'anthropic/claude-3-5-haiku': 200000,
  'glm-4-plus': 128000,
  'glm-4-air': 128000,
  'glm-4-flash': 128000,
  'glm-4-alltools': 128000,
  'glm-4-long': 1000000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'moonshot-v1-8k': 8192,
  'moonshot-v1-32k': 32768,
  'moonshot-v1-128k': 128000,
  'qwen-plus': 128000,
  'qwen-turbo': 128000,
  'qwen-max': 32768,
  'qwen-long': 1000000,
  'qwen2.5-72b-instruct': 128000,
  'gemini-2.0-flash': 1000000,
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
  'llama-3.3-70b-versatile': 128000,
  'llama-3.1-8b-instant': 128000,
  'mixtral-8x7b-32768': 32768,
  'gemma2-9b-it': 8192,
  'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo': 128000,
  'mistralai/Mixtral-8x22B-Instruct-v0.1': 65536,
  'deepseek-ai/DeepSeek-R1': 64000,
  'accounts/fireworks/models/llama-v3p1-70b-instruct': 128000,
  'accounts/fireworks/models/mixtral-8x22b-instruct': 65536,
  'openai/gpt-4o': 128000,
  'anthropic/claude-3-5-sonnet': 200000,
  'google/gemini-pro-1.5': 1000000,
  'meta-llama/llama-3.1-405b-instruct': 128000,
  'llama3.2': 128000,
  'llama3.1': 128000,
  'mistral': 32768,
  'codellama': 16384,
  'phi3': 128000,
  'qwen2.5': 128000,
};

let agentCommLog: AgentCommEntry[] = [];
let thinkLog: ThinkLogEntry[] = [];
let toolCallLog: ToolCallLogEntry[] = [];
let routeLog: RouteLogEntry[] = [];

function persistRuntimeConfig(config: Config): void {
  saveConfig(config);
}

export function setThinkLog(content: string, agentName: string): void {
  const timestamp = new Date().toISOString();
  const normalized = content.slice(0, 320);
  const lastEntry = thinkLog[thinkLog.length - 1];
  if (lastEntry && lastEntry.agentName === agentName && lastEntry.type === 'think') {
    const ageMs = Date.now() - new Date(lastEntry.timestamp).getTime();
    if (ageMs < 15000) {
      lastEntry.timestamp = timestamp;
      lastEntry.content = normalized;
      return;
    }
  }
  thinkLog.push({
    timestamp,
    type: 'think',
    content: normalized,
    agentName,
  });
  if (thinkLog.length > MAX_LOG_ENTRIES) thinkLog.shift();
}

export function setToolCallLog(toolName: string, content: string, agentName: string): void {
  toolCallLog.push({
    timestamp: new Date().toISOString(),
    type: 'tool',
    content: content.slice(0, 320),
    agentName,
    toolName,
  });
  if (toolCallLog.length > MAX_LOG_ENTRIES) toolCallLog.shift();
}

function stripAnsiText(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function normalizeContent(value: string): string {
  return stripAnsiText(value).replace(/\r/g, '').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function toChars(value: string): string[] {
  return Array.from(value);
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (!char || code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 0;
  return code > 0xff ? 2 : 1;
}

function displayWidth(value: string): number {
  return toChars(stripAnsiText(value)).reduce((sum, char) => sum + charWidth(char), 0);
}

function getContextWindow(model: string): number {
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.includes(key) || key.includes(model)) return value;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

function describeEndpoint(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return parsed.host || baseUrl;
  } catch {
    return baseUrl || 'unknown-endpoint';
  }
}

function formatTokenCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function getTokenUsageColor(percentage: number): (text: string) => string {
  if (percentage >= 90) return chalk.red;
  if (percentage >= 75) return chalk.yellow;
  if (percentage >= 50) return chalk.cyan;
  return chalk.green;
}

function formatElapsedShort(startedAt: string): string {
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return '--';
  const elapsedMs = Math.max(0, Date.now() - started);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}m`;
}

function deriveStepName(status: AgentCardState['status'], detail: string, toolName?: string): string {
  const firstLine = normalizeContent(detail).split('\n')[0] ?? '';
  if (status === 'thinking') return 'Reasoning';
  if (status === 'tool') return toolName ? 'Tool Execution' : 'Using Tool';
  if (status === 'completed') return 'Completed';
  if (status === 'error') return 'Error';
  if (/collaborat/i.test(firstLine)) return 'Coordination';
  if (/synthes/i.test(firstLine)) return 'Synthesis';
  if (/selected|idle/i.test(firstLine)) return 'Standby';
  if (/planning|plan/i.test(firstLine)) return 'Planning';
  if (/analy/i.test(firstLine)) return 'Analysis';
  if (/draft|write|author/i.test(firstLine)) return 'Drafting';
  if (/research|search|retriev/i.test(firstLine)) return 'Research';
  return status === 'running' ? 'Working' : 'Standby';
}

function truncateDisplay(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  const plain = stripAnsiText(value);
  let result = '';
  let used = 0;
  for (const char of toChars(plain)) {
    const width = charWidth(char);
    if (used + width > maxWidth) break;
    result += char;
    used += width;
  }
  return result;
}

function padDisplay(value: string, width: number): string {
  const clipped = truncateDisplay(value, width);
  return clipped + ' '.repeat(Math.max(0, width - displayWidth(clipped)));
}

function fitDisplay(value: string, width: number): string {
  if (width <= 0) return '';
  const plain = stripAnsiText(value);
  if (displayWidth(plain) <= width) return padDisplay(plain, width);
  if (width <= 1) return ' '.repeat(width);
  return padDisplay(`${truncateDisplay(plain, width - 1)}>`, width);
}

function wrapPlainText(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  const lines = normalizeContent(text).split('\n');
  const wrapped: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      wrapped.push('');
      continue;
    }
    let current = '';
    let currentWidth = 0;
    for (const char of toChars(line.trimEnd())) {
      const nextWidth = charWidth(char);
      if (current && currentWidth + nextWidth > safeWidth) {
        wrapped.push(current.trimEnd());
        current = char;
        currentWidth = nextWidth;
        continue;
      }
      current += char;
      currentWidth += nextWidth;
    }
    wrapped.push(current.trimEnd());
  }
  return wrapped;
}

function formatEntry(entry: TUIEntry, width: number): string[] {
  const palette: Record<TUIEntryKind, { label: string; color: (text: string) => string; contentColor: (text: string) => string }> = {
    user: { label: 'YOU', color: chalk.cyanBright, contentColor: chalk.white },
    assistant: { label: 'AI', color: chalk.greenBright, contentColor: chalk.white },
    thinking: { label: 'THINK', color: chalk.gray, contentColor: chalk.gray },
    system: { label: 'SYS', color: chalk.yellowBright, contentColor: chalk.white },
    error: { label: 'ERR', color: chalk.redBright, contentColor: chalk.white },
  };
  const style = palette[entry.kind];
  const prefixText = `[${style.label}] ${entry.title}`.trim();
  const prefix = style.color(`${prefixText} `);
  const indent = ' '.repeat(displayWidth(stripAnsiText(prefix)));
  const bodyWidth = Math.max(8, width - displayWidth(stripAnsiText(prefix)));
  const wrapped = wrapPlainText(entry.content, bodyWidth);
  if (wrapped.length === 0) return [prefix];
  return wrapped.map((line, index) => index === 0 ? `${prefix}${style.contentColor(line)}` : `${indent}${style.contentColor(line)}`);
}

function pushEntry(entries: TUIEntry[], kind: TUIEntryKind, title: string, content: string): void {
  const normalized = normalizeContent(content);
  if (normalized) entries.push({ kind, title, content: normalized });
}

function parseThinkingEnvelope(raw: string): { answer: string; thinking: string } {
  let answer = '';
  let thinking = '';
  let inside = false;
  for (let i = 0; i < raw.length;) {
    if (raw.startsWith('<think>', i)) { inside = true; i += 7; continue; }
    if (raw.startsWith('</think>', i)) { inside = false; i += 8; continue; }
    if (raw.startsWith('<thinking>', i)) { inside = true; i += 10; continue; }
    if (raw.startsWith('</thinking>', i)) { inside = false; i += 11; continue; }
    if (raw.startsWith('<reasoning>', i)) { inside = true; i += 11; continue; }
    if (raw.startsWith('</reasoning>', i)) { inside = false; i += 12; continue; }
    const char = raw[i] ?? '';
    if (inside) thinking += char; else answer += char;
    i += 1;
  }
  return { answer: answer.trimStart(), thinking: thinking.trimStart() };
}

function buildInputViewport(text: string, cursorIndex: number, maxWidth: number): InputViewport {
  const safeWidth = Math.max(8, maxWidth);
  const chars = toChars(text);
  const clamped = Math.max(0, Math.min(cursorIndex, chars.length));
  const cursorDisplay = chars.slice(0, clamped).reduce((sum, char) => sum + charWidth(char), 0);
  const totalDisplay = chars.reduce((sum, char) => sum + charWidth(char), 0);
  let start = cursorDisplay >= safeWidth ? cursorDisplay - safeWidth + 1 : 0;
  if (totalDisplay - start < safeWidth) start = Math.max(0, totalDisplay - safeWidth);
  let consumed = 0;
  let visible = '';
  let visibleWidth = 0;
  let cursorColumn = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    const width = charWidth(char);
    const next = consumed + width;
    if (next <= start) {
      consumed = next;
      continue;
    }
    if (visibleWidth + width > safeWidth) break;
    if (index < clamped) cursorColumn += width;
    visible += char;
    visibleWidth += width;
    consumed = next;
  }
  if (start > 0 && visible) {
    visible = `>${visible.slice(1)}`;
    cursorColumn = Math.max(1, cursorColumn);
  }
  return { visibleText: visible, cursorColumn: Math.min(cursorColumn, displayWidth(visible)) };
}

function centerAnsiLine(line: string, width: number): string {
  const visible = displayWidth(stripAnsiText(line));
  if (visible >= width) return line;
  return `${' '.repeat(Math.max(0, Math.floor((width - visible) / 2)))}${line}`;
}

function sliceFromBottom(lines: string[], height: number, scrollOffset: number): string[] {
  const safeHeight = Math.max(0, height);
  if (safeHeight === 0) return [];
  const maxScroll = Math.max(0, lines.length - safeHeight);
  const clamped = Math.max(0, Math.min(scrollOffset, maxScroll));
  const start = Math.max(0, lines.length - safeHeight - clamped);
  return lines.slice(start, start + safeHeight);
}

function renderBox(spec: BoxSpec, body: string[]): string[] {
  const width = Math.max(10, spec.width);
  const height = Math.max(3, spec.height);
  const innerWidth = width - 2;
  const title = ` ${spec.title} `;
  const titleColor = spec.titleColor ?? chalk.white;
  const lines: string[] = [chalk.gray('+') + titleColor(fitDisplay(title, innerWidth)) + chalk.gray('+')];
  const usableRows = Math.max(0, height - 2);
  for (let i = 0; i < usableRows; i += 1) {
    lines.push(chalk.gray('|') + fitDisplay(body[i] ?? '', innerWidth) + chalk.gray('|'));
  }
  lines.push(chalk.gray('+') + chalk.gray('-'.repeat(innerWidth)) + chalk.gray('+'));
  return lines;
}

function buildAgentCards(
  agents: Array<{ id: string; name: string; emoji?: string; role?: string }>,
  activeAgentId: string | null,
  states: Map<string, AgentCardState>,
  width: number,
): string[] {
  const gap = 1;
  const minCardWidth = 22;
  const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  const cardWidth = Math.max(minCardWidth, Math.floor((width - (Math.max(0, columns - 1) * gap)) / columns));
  const output: string[] = [];

  const statusColor = (status: AgentCardState['status']): ((text: string) => string) => {
    switch (status) {
      case 'thinking': return chalk.gray;
      case 'tool': return chalk.cyanBright;
      case 'completed': return chalk.greenBright;
      case 'error': return chalk.redBright;
      case 'running': return chalk.yellowBright;
      default: return chalk.gray;
    }
  };

  for (let rowStart = 0; rowStart < agents.length; rowStart += columns) {
    const rowAgents = agents.slice(rowStart, rowStart + columns);
    const rowBuffers = ['', '', '', '', ''];
    for (let i = 0; i < rowAgents.length; i += 1) {
      const agent = rowAgents[i]!;
      const isActive = agent.id === activeAgentId;
      const state = states.get(agent.id);
      const badge = statusColor(state?.status ?? 'idle')((state?.status ?? (isActive ? 'running' : 'idle')).toUpperCase());
      const line1 = `${agent.emoji ?? 'AI'} ${agent.name}`;
      const line2 = `Step: ${state?.stepName ?? (isActive ? 'Selected' : 'Standby')}`;
      const line3 = `Tool: ${state?.lastToolName ?? state?.toolName ?? '-'}`;
      const line4 = `${badge} ${formatElapsedShort(state?.startedAt ?? state?.updatedAt ?? new Date().toISOString())}`;
      const cardLines = [
        chalk.gray('+') + chalk.gray('-'.repeat(cardWidth - 2)) + chalk.gray('+'),
        chalk.gray('|') + fitDisplay(line1, cardWidth - 2) + chalk.gray('|'),
        chalk.gray('|') + fitDisplay(line2, cardWidth - 2) + chalk.gray('|'),
        chalk.gray('|') + fitDisplay(line3, cardWidth - 2) + chalk.gray('|'),
        chalk.gray('|') + fitDisplay(line4, cardWidth - 2) + chalk.gray('|'),
      ];
      for (let row = 0; row < rowBuffers.length; row += 1) {
        rowBuffers[row] += cardLines[row] ?? ''.padEnd(cardWidth, ' ');
        if (i < rowAgents.length - 1) rowBuffers[row] += ' '.repeat(gap);
      }
    }
    output.push(...rowBuffers.map((line) => fitDisplay(line, width)));
  }

  return output;
}

function mergeAgentCardState(
  previous: AgentCardState | undefined,
  next: {
    agentId: string;
    agentName: string;
    status: AgentCardState['status'];
    detail: string;
    updatedAt: string;
    toolName?: string;
  },
): AgentCardState {
  const stepName = deriveStepName(next.status, next.detail, next.toolName);
  const statusChanged = previous?.status !== next.status;
  const stepChanged = previous?.stepName !== stepName;
  const toolChanged = next.toolName !== undefined && previous?.lastToolName !== next.toolName;
  const startedAt = statusChanged || stepChanged || toolChanged
    ? next.updatedAt
    : (previous?.startedAt ?? next.updatedAt);

  return {
    agentId: next.agentId,
    agentName: next.agentName,
    status: next.status,
    detail: next.detail,
    updatedAt: next.updatedAt,
    startedAt,
    stepName,
    ...(next.toolName ? { toolName: next.toolName, lastToolName: next.toolName } : previous?.lastToolName ? { lastToolName: previous.lastToolName } : {}),
  };
}

async function renderSplash(config: Config, state: REPLState): Promise<void> {
  const cols = Math.max(80, process.stdout.columns ?? 100);
  const rows = Math.max(24, process.stdout.rows ?? 30);
  const endpointLabel = describeEndpoint(config.baseUrl);
  let art = 'TZUKWAN';
  try {
    art = figlet.textSync('TZUKWAN', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    });
  } catch {}
  const lines = [
    ...art.split('\n').map((line) => SPLASH_GRADIENT(line)),
    '',
    chalk.bold.white('Academic Research AI Agent'),
    chalk.gray(`Endpoint: ${endpointLabel}`),
    chalk.gray(`Model: ${config.model}`),
    chalk.gray(`Session: ${state.sessionName}`),
    chalk.gray('Top: agents | Left: conversation | Right: logs | Bottom: input'),
  ];
  const topPadding = Math.max(1, Math.floor((rows - lines.length) / 2));
  process.stdout.write('\x1b[2J\x1b[H');
  process.stdout.write([...Array.from({ length: topPadding }, () => ''), ...lines.map((line) => centerAnsiLine(line, cols))].join('\n'));
  await new Promise((resolve) => setTimeout(resolve, 850));
}

export async function startRepl(options: REPLOptions): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    console.log(chalk.yellow('Interactive chat now uses fullscreen TUI mode and requires a TTY terminal.'));
    return;
  }

  const config: Config = options.model ? { ...options.config, model: options.model } : { ...options.config };
  const state: REPLState = {
    conversationHistory: [],
    multiLineBuffer: '',
    isMultiLine: false,
    currentAgent: 'advisor',
    agentMode: false,
    thinkMode: config.think !== false,
    sessionName: `session_${Date.now()}`,
    sessionStart: new Date(),
    activePaperId: null,
    activeTaskId: null,
    approvalMode: 'suggest',
  };

  let core = await loadCore(config);
  if (core && state.activePaperId) await activatePaperWorkspace(state.activePaperId, state, core);
  try {
    await core?.hookManager?.trigger('session-start', { sessionName: state.sessionName });
  } catch (hookErr) {
    console.warn('[TUI] session-start hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
  }

  const coreModule = await import('@tzukwan/core');
  coreModule.setAgentCommListener((event) => {
    agentCommLog.push(event);
    if (agentCommLog.length > MAX_LOG_ENTRIES) agentCommLog.shift();
    scheduleRender();
  });

  const entries: TUIEntry[] = [];
  const agentStates = new Map<string, AgentCardState>();
  let scheduleRender = (): void => {};
  coreModule.setAgentRuntimeListener((event: {
    kind: 'state' | 'thinking' | 'tool-start' | 'tool-end' | 'routing';
    agentId: string;
    agentName: string;
    status?: AgentCardState['status'];
    detail: string;
    toolName?: string;
    timestamp: string;
    success?: boolean;
  }) => {
    const previous = agentStates.get(event.agentId);
    if (event.kind === 'thinking') {
      setThinkLog(event.detail, event.agentName);
      agentStates.set(event.agentId, mergeAgentCardState(previous, {
        agentId: event.agentId,
        agentName: event.agentName,
        status: 'thinking',
        detail: event.detail.split('\n')[0] ?? 'reasoning',
        updatedAt: event.timestamp,
      }));
    } else if (event.kind === 'tool-start') {
      setToolCallLog(event.toolName ?? 'tool', event.detail, event.agentName);
      agentStates.set(event.agentId, mergeAgentCardState(previous, {
        agentId: event.agentId,
        agentName: event.agentName,
        status: 'tool',
        detail: event.toolName ?? 'tool',
        updatedAt: event.timestamp,
        ...(event.toolName ? { toolName: event.toolName } : {}),
      }));
    } else if (event.kind === 'tool-end') {
      agentStates.set(event.agentId, mergeAgentCardState(previous, {
        agentId: event.agentId,
        agentName: event.agentName,
        status: event.success === false ? 'error' : 'running',
        detail: event.detail,
        updatedAt: event.timestamp,
        ...(previous?.lastToolName ? { toolName: previous.lastToolName } : {}),
      }));
    } else if (event.kind === 'routing') {
      routeLog.push({
        timestamp: event.timestamp,
        type: 'route',
        content: event.detail,
        agentName: event.agentName,
      });
      if (routeLog.length > MAX_LOG_ENTRIES) routeLog.shift();
    } else if (event.kind === 'state' && event.status) {
      agentStates.set(event.agentId, mergeAgentCardState(previous, {
        agentId: event.agentId,
        agentName: event.agentName,
        status: event.status,
        detail: event.detail,
        updatedAt: event.timestamp,
        ...(event.toolName ? { toolName: event.toolName } : {}),
      }));
    }
    scheduleRender();
  });
  for (const runtimeState of coreModule.getAgentRuntimeStates()) {
    agentStates.set(runtimeState.agentId, mergeAgentCardState(undefined, {
      agentId: runtimeState.agentId,
      agentName: runtimeState.agentName,
      status: runtimeState.status,
      detail: runtimeState.detail,
      updatedAt: runtimeState.updatedAt,
      ...(runtimeState.toolName ? { toolName: runtimeState.toolName } : {}),
    }));
  }

  const runFrontierLoop = async (): Promise<void> => {
    try {
      const dynamicCore = await import('@tzukwan/core');
      const profile = new dynamicCore.UserProfileManager().load();
      const keywords = (profile?.researchDirection ?? '')
        .split(/[,\s]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
      const loopLLMClient = (() => {
        try {
          return new dynamicCore.LLMClient({
            provider: normalizeProvider(config.provider),
            baseUrl: config.baseUrl,
            apiKey: normalizeApiKey(config.provider, config.apiKey),
            model: config.model,
          });
        } catch {
          return undefined;
        }
      })();
      const observer = new dynamicCore.FrontierObserver(
        profile?.field ?? 'Academic research',
        keywords.length > 0 ? keywords : ['machine learning', 'deep learning'],
        loopLLMClient,
      );
      const today = new Date().toISOString().split('T')[0];
      if (observer.loadReport(today)) return;
      const reportEntries = await observer.fetchLatest(30);
      const report = await observer.generateReport(reportEntries);
      const tgBridge = (core?.telegramBridge ?? null) as { isConfigured?(): boolean; sendMessage?(text: string): Promise<unknown> } | null;
      if (tgBridge?.isConfigured?.() && report.entries.length > 0) {
        const digest = observer.buildDigestText(report);
        for (const chunk of digest.match(/[\s\S]{1,4000}/g) ?? [digest]) await tgBridge.sendMessage?.(chunk);
      }
    } catch (error) {
      console.error('[TUI] Frontier loop error:', error instanceof Error ? error.message : String(error));
    }
  };

  const handleLoopTick = async (loop: { name: string; command: string }, iteration: number): Promise<void> => {
    if (loop.command === 'fetch-frontier') {
      await runFrontierLoop();
      return;
    }
    pushEntry(entries, 'system', 'Loop', `[${loop.name}] #${iteration}: ${loop.command}`);
    scheduleRender();
  };

  if (core?.loopManager) {
    try {
      if (!core.loopManager.list().some((loop) => loop.command === 'fetch-frontier')) {
        core.loopManager.create(
          { name: 'daily-frontier', command: 'fetch-frontier', intervalMs: 6 * 60 * 60 * 1000 },
          async () => runFrontierLoop(),
        );
      }
      if (!core.hookManager?.list().some((hook) => hook.event === 'post-message' && hook.command === 'autosave')) {
        core.hookManager?.register({ event: 'post-message', command: 'autosave', description: 'Autosave chat history', enabled: true });
      }
      (core.loopManager as { restoreLoops?: (cb: (loop: { name: string; command: string }, iteration: number) => Promise<void>) => void }).restoreLoops?.(handleLoopTick);
    } catch {}
  }

  const tgBridgeForPolling = core?.telegramBridge as {
    isConfigured?(): boolean;
    startPolling?(fn: (text: string, chatId: string) => Promise<string>): Promise<void>;
    stopPolling?(): void;
  } | null;

  if (tgBridgeForPolling?.isConfigured?.() && tgBridgeForPolling.startPolling && core?.orchestrator) {
    const pollingOrchestrator = core.orchestrator;
    try {
      void tgBridgeForPolling.startPolling(async (text: string): Promise<string> => {
        try {
          const reply = await pollingOrchestrator.chat(text, () => {});
          return reply ? reply.slice(0, 4000) : '(no reply)';
        } catch (error) {
          return `Error: ${String(error).slice(0, 200)}`;
        }
      });
    } catch {}
  }

  let commandHistory: string[] = [];
  try {
    commandHistory = fs.readFileSync(CMD_HISTORY_FILE, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-MAX_CMD_HISTORY_SIZE);
  } catch {}

  const persistHistory = (): void => {
    try {
      fs.mkdirSync(TZUKWAN_DIR, { recursive: true });
      fs.writeFileSync(CMD_HISTORY_FILE, `${commandHistory.slice(-MAX_CMD_HISTORY_SIZE).join('\n')}\n`, 'utf-8');
    } catch {}
  };

  pushEntry(entries, core ? 'system' : 'error', 'Tzukwan', core ? 'TUI ready. Type /help for commands.' : 'LLM core is not available. Run /setup or inspect your configuration.');
  pushEntry(entries, 'system', 'Runtime', `Loaded model ${config.model} via ${describeEndpoint(config.baseUrl)} from ${CONFIG_PATH}.`);

  let inputBuffer = '';
  let cursorIndex = 0;
  let historyIndex = commandHistory.length;
  let historyDraft = '';
  let suggestionSeed: string | null = null;
  let suggestionIndex = 0;
  let messageScrollOffset = 0;
  let logScrollOffset = 0;
  let lastMessageBodyHeight = 8;
  let focusedPane: 'messages' | 'logs' = 'messages';
  let overlayMode: 'commands' | 'sessions' | 'agents' | 'papers' | 'models' | 'tools' | 'permissions' | 'mcp' | 'skills' | 'loops' | 'hooks' | 'literature-sources' | 'settings' | null = null;
  let overlayItems: OverlayItem[] = [];
  let overlayIndex = 0;
  let statusLine = core ? 'Ready' : 'LLM unavailable';
  let tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let busy = false;
  let busyLock = false;
  let exiting = false;
  let suspended = false;
  let ctrlCCount = 0;
  let renderTimer: NodeJS.Timeout | null = null;
  let resizeTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let resolveSession: (() => void) | null = null;

  interface QueuedMessage {
    text: string;
    timestamp: number;
    type: 'queue' | 'steer';
  }
  let queuedMessages: QueuedMessage[] = [];
  let pendingSteer: string | null = null;
  let interruptRequested = false;
  let currentAbortController: AbortController | null = null;
  const sessionConfig = await new coreModule.ConfigLoader().loadConfig().catch(() => null);
  const sessionManager = new coreModule.SessionManager();
  let currentSession = sessionManager.createSession((sessionConfig ?? {
    llm: {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeout: 60000,
    },
    research: { defaultLanguage: 'English', citationStyle: 'APA', preferredSources: [], datasetCategories: [] },
    permissions: { allow: ['**'], deny: [] },
    rules: [],
  }) as Parameters<typeof sessionManager.createSession>[0]);

  const setInputBuffer = (nextValue: string): void => {
    inputBuffer = nextValue;
    cursorIndex = toChars(nextValue).length;
    syncCommandOverlayFromInput();
  };

  const resetSuggestionCycle = (): void => {
    suggestionSeed = null;
    suggestionIndex = 0;
  };

  const getSuggestionFilter = (): string | null => suggestionSeed ?? (inputBuffer.startsWith('/') ? inputBuffer : null);

  const getFilteredCommands = (): string[] => {
    const filter = getSuggestionFilter();
    if (!filter) return [];
    if (filter === '/') return ALL_SLASH_COMMANDS.filter((command) => command !== '/');
    return ALL_SLASH_COMMANDS
      .filter((command) => command !== '/')
      .filter((command) => command.toLowerCase().startsWith(filter.toLowerCase()) || command.toLowerCase().slice(1).includes(filter.toLowerCase().slice(1)));
  };

  const refreshCommandOverlay = (): void => {
    const filtered = getFilteredCommands();
    if (filtered.length === 0) {
      overlayMode = null;
      overlayItems = [];
      overlayIndex = 0;
      return;
    }
    overlayMode = 'commands';
    overlayItems = filtered.map((command) => ({
      id: command,
      label: command,
      description: COMMAND_DESCRIPTIONS[command] ?? 'Command',
    }));
    overlayIndex = Math.min(overlayIndex, Math.max(0, overlayItems.length - 1));
  };

  const syncCommandOverlayFromInput = (): void => {
    if (inputBuffer.startsWith('/') && !/\s/.test(inputBuffer.trim())) refreshCommandOverlay();
    else if (overlayMode === 'commands') closeOverlay();
  };

  const closeOverlay = (): void => {
    overlayMode = null;
    overlayItems = [];
    overlayIndex = 0;
  };

  const syncSessionFromConversation = async (): Promise<void> => {
    currentSession.messages = state.conversationHistory.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    await sessionManager.saveSession(currentSession);
  };

  const rebuildEntriesFromConversation = (): void => {
    entries.length = 0;
    for (const message of state.conversationHistory) {
      if (message.role === 'user') pushEntry(entries, 'user', 'You', String(message.content ?? ''));
      else if (message.role === 'assistant') pushEntry(entries, 'assistant', 'Assistant', String(message.content ?? ''));
      else pushEntry(entries, 'system', 'System', String(message.content ?? ''));
    }
  };

  const openSessionOverlay = async (): Promise<void> => {
    const sessions = await sessionManager.listSessions();
    overlayMode = 'sessions';
    overlayItems = sessions.map((session) => {
      const preview = [...session.messages].reverse().find((message) => message.role === 'user' || message.role === 'assistant');
      return {
        id: session.id,
        label: `${session.id.slice(0, 8)}  ${session.createdAt.toISOString().replace('T', ' ').slice(0, 19)}`,
        description: `${session.messages.length} messages`,
        preview: typeof preview?.content === 'string' ? preview.content.slice(0, 120) : '',
      };
    });
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Select a session to restore' : 'No saved sessions found';
    scheduleRender();
  };

  const openAgentOverlay = (): void => {
    if (!core) return;
    overlayMode = 'agents';
    overlayItems = core.orchestrator.getAgents().map((agent) => ({
      id: agent.id,
      label: `${agent.emoji} ${agent.name}`,
      description: `${agent.id} · ${agent.role}`,
      preview: agent.description,
    }));
    overlayIndex = Math.max(0, overlayItems.findIndex((item) => item.id === state.currentAgent));
    statusLine = 'Select an agent';
    scheduleRender();
  };

  const openPaperOverlay = (): void => {
    if (!core) return;
    overlayMode = 'papers';
    overlayItems = core.paperWorkspace.list().map((paper) => ({
      id: paper.id,
      label: paper.title,
      description: paper.id,
      preview: `Last accessed ${paper.lastAccessedAt}`,
    }));
    overlayIndex = Math.max(0, overlayItems.findIndex((item) => item.id === state.activePaperId));
    statusLine = overlayItems.length > 0 ? 'Select a paper workspace' : 'No paper workspaces found';
    scheduleRender();
  };

  const openModelOverlay = (): void => {
    overlayMode = 'models';
    overlayItems = [...new Set([config.model, ...Object.keys(coreModule.KNOWN_MODELS)])].slice(0, 60).map((model: string) => ({
      id: model,
      label: model,
      description: model === config.model ? 'current model' : 'known model',
    }));
    overlayIndex = Math.max(0, overlayItems.findIndex((item) => item.id === config.model));
    statusLine = 'Select a model';
    scheduleRender();
  };

  const openToolsOverlay = (): void => {
    if (!core) return;
    overlayMode = 'tools';
    overlayItems = core.orchestrator.getToolRegistry().listTools().map((tool) => ({
      id: tool.name,
      label: tool.name,
      description: tool.description,
      preview: 'Active runtime tool',
    }));
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Browse active tools' : 'No active tools found';
    scheduleRender();
  };

  const openPermissionsOverlay = (): void => {
    if (!core) return;
    overlayMode = 'permissions';
    overlayItems = core.permManager.list().map((permission) => ({
      id: permission.name,
      label: `${permission.allowed ? '[allow]' : '[deny] '} ${permission.name}`,
      description: permission.description,
      preview: 'Enter toggles permission state',
    }));
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Browse and toggle permissions' : 'No permissions found';
    scheduleRender();
  };

  const openMcpOverlay = (): void => {
    if (!core) return;
    overlayMode = 'mcp';
    overlayItems = core.mcpManager.listServers().map((server) => ({
      id: server.name,
      label: `${server.enabled ? '[on] ' : '[off]'} ${server.name}`,
      description: `${server.type}${server.description ? ` - ${server.description}` : ''}`,
      preview: 'Enter toggles enabled state',
    }));
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Browse and toggle MCP servers' : 'No MCP servers found';
    scheduleRender();
  };

  const openSkillsOverlay = async (): Promise<void> => {
    overlayMode = 'skills';
    try {
      const skillsModule = await import('@tzukwan/skills');
      const installed = await skillsModule.listInstalledSkills();
      overlayItems = installed.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.version ? `v${skill.version}` : 'installed skill',
        preview: skill.description,
      }));
      statusLine = overlayItems.length > 0 ? 'Browse installed skills' : 'No installed skills found';
    } catch (error) {
      overlayItems = [];
      statusLine = `Failed to load skills: ${error instanceof Error ? error.message : String(error)}`;
    }
    overlayIndex = 0;
    scheduleRender();
  };

  const openLoopsOverlay = (): void => {
    if (!core) return;
    overlayMode = 'loops';
    overlayItems = core.loopManager.list().map((loop) => ({
      id: loop.id,
      label: `${loop.active ? '[on] ' : '[off]'} ${loop.name}`,
      description: `${loop.iterations} runs @ ${loop.intervalMs}ms`,
      preview: loop.command,
    }));
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Browse loops. Enter stops an active loop.' : 'No loops found';
    scheduleRender();
  };

  const openHooksOverlay = (): void => {
    if (!core) return;
    overlayMode = 'hooks';
    overlayItems = core.hookManager.list().map((hook) => ({
      id: hook.id,
      label: `${hook.enabled ? '[on] ' : '[off]'} ${hook.event}`,
      description: hook.description,
      preview: 'Enter toggles enabled state',
    }));
    overlayIndex = 0;
    statusLine = overlayItems.length > 0 ? 'Browse and toggle hooks' : 'No hooks found';
    scheduleRender();
  };

  const openLiteratureSourceOverlay = (): void => {
    overlayMode = 'literature-sources';
    overlayItems = [
      { id: 'all', label: 'All Sources', description: 'Mixed ranking across all enabled literature sources', preview: 'arXiv + Semantic Scholar + PubMed + OpenAlex' },
      { id: 'arxiv', label: 'arXiv', description: 'Preprints and open-access CS/ML papers' },
      { id: 'semantic-scholar', label: 'Semantic Scholar', description: 'Academic graph search with citations and metadata' },
      { id: 'pubmed', label: 'PubMed', description: 'Biomedical and life sciences literature' },
      { id: 'openalex', label: 'OpenAlex', description: 'Cross-domain scholarly works and metadata' },
    ];
    overlayIndex = 0;
    statusLine = 'Select literature sources, then enter your query';
    scheduleRender();
  };

  const openSettingsOverlay = (): void => {
    const routing = getRoutingConfig();
    overlayMode = 'settings';
    overlayItems = [
      {
        id: 'main_show',
        label: 'Main LLM',
        description: `${config.model} @ ${describeEndpoint(config.baseUrl)}`,
        preview: 'Enter to inspect current config',
      },
      {
        id: 'main_test',
        label: 'Test Main LLM',
        description: 'Run /config test',
        preview: 'Checks current main model connectivity',
      },
      {
        id: 'main_edit',
        label: 'Edit Main LLM',
        description: 'Prefill /config set ... command',
        preview: 'Base URL / API Key / Model',
      },
      {
        id: 'routing_show',
        label: 'Routing LLM',
        description: routing ? `${routing.model} @ ${describeEndpoint(routing.baseUrl)}` : 'not configured',
        preview: 'Enter to inspect current routing config',
      },
      {
        id: 'routing_test',
        label: 'Test Routing LLM',
        description: 'Run /config routing test',
        preview: 'Checks router model connectivity',
      },
      {
        id: 'routing_edit',
        label: 'Edit Routing LLM',
        description: 'Prefill /config routing set ... command',
        preview: 'Base URL / API Key / Model',
      },
    ];
    overlayIndex = 0;
    statusLine = 'Settings panel: Enter to inspect/test, Tab or arrows to navigate';
    scheduleRender();
  };

  const restoreSessionFromOverlay = async (): Promise<void> => {
    const selected = overlayItems[overlayIndex];
    if (!selected) return;
    const session = await sessionManager.loadSession(selected.id);
    if (!session) {
      statusLine = 'Selected session could not be loaded';
      closeOverlay();
      scheduleRender();
      return;
    }
    currentSession = session;
    state.conversationHistory = session.messages
      .filter((message): message is { role: 'user' | 'assistant' | 'system'; content: string } => (
        (message.role === 'user' || message.role === 'assistant' || message.role === 'system') && typeof message.content === 'string'
      ))
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    rebuildEntriesFromConversation();
    core?.orchestrator.restoreSessionMessages(state.currentAgent, session.messages);
    messageScrollOffset = 0;
    closeOverlay();
    statusLine = `Restored session ${session.id.slice(0, 8)}`;
    scheduleRender();
  };

  const restoreOverlaySelection = async (): Promise<void> => {
    if (overlayMode === 'sessions') {
      await restoreSessionFromOverlay();
      return;
    }
    const selected = overlayItems[overlayIndex];
    if (!selected) return;
    if (overlayMode === 'agents' && core) {
      if (core.orchestrator.setActiveAgent(selected.id)) {
        state.currentAgent = selected.id;
        statusLine = `Switched to agent ${selected.id}`;
      }
      closeOverlay();
      scheduleRender();
      return;
    }
    if (overlayMode === 'papers' && core) {
      await activatePaperWorkspace(selected.id, state, core);
      closeOverlay();
      statusLine = `Opened paper workspace ${selected.id}`;
      scheduleRender();
      return;
    }
    if (overlayMode === 'models') {
      config.model = selected.id;
      persistRuntimeConfig(config);
      resetRuntimeCache();
      await reloadCore();
      closeOverlay();
      statusLine = `Model switched to ${selected.id}`;
      scheduleRender();
      return;
    }
    if (overlayMode === 'permissions' && core) {
      const permission = core.permManager.list().find((entry) => entry.name === selected.id);
      if (permission?.allowed) {
        core.permManager.deny(selected.id);
        statusLine = `Permission denied: ${selected.id}`;
      } else {
        core.permManager.allow(selected.id);
        statusLine = `Permission allowed: ${selected.id}`;
      }
      openPermissionsOverlay();
      return;
    }
    if (overlayMode === 'mcp' && core) {
      const server = core.mcpManager.listServers().find((entry) => entry.name === selected.id);
      if (!server) return;
      core.mcpManager.setEnabled(selected.id, !server.enabled);
      resetRuntimeCache();
      await reloadCore();
      openMcpOverlay();
      statusLine = `${server.enabled ? 'Disabled' : 'Enabled'} MCP server ${selected.id}`;
      return;
    }
    if (overlayMode === 'tools' || overlayMode === 'skills') {
      closeOverlay();
      statusLine = `Selected ${selected.id}`;
      scheduleRender();
      return;
    }
    if (overlayMode === 'loops' && core) {
      const loop = core.loopManager.get(selected.id);
      if (!loop) return;
      if (!loop.active) {
        statusLine = `Loop ${selected.id} is already stopped`;
        openLoopsOverlay();
        return;
      }
      core.loopManager.stop(selected.id);
      statusLine = `Stopped loop ${selected.id}`;
      openLoopsOverlay();
      return;
    }
    if (overlayMode === 'hooks' && core) {
      const hook = core.hookManager.list().find((entry) => entry.id === selected.id);
      if (!hook) return;
      if (hook.enabled) {
        core.hookManager.disable(selected.id);
        statusLine = `Disabled hook ${selected.id}`;
      } else {
        core.hookManager.enable(selected.id);
        statusLine = `Enabled hook ${selected.id}`;
      }
      openHooksOverlay();
      return;
    }
    if (overlayMode === 'literature-sources') {
      setInputBuffer(`/search --source ${selected.id} `);
      closeOverlay();
      statusLine = `Search source set to ${selected.id}`;
      scheduleRender();
      return;
    }
    if (overlayMode === 'settings') {
      if (selected.id === 'main_show') {
        closeOverlay();
        setInputBuffer('/config show');
      } else if (selected.id === 'main_test') {
        closeOverlay();
        setInputBuffer('/config test');
      } else if (selected.id === 'main_edit') {
        closeOverlay();
        setInputBuffer('/config set base_url ');
      } else if (selected.id === 'routing_show') {
        closeOverlay();
        setInputBuffer('/config routing show');
      } else if (selected.id === 'routing_test') {
        closeOverlay();
        setInputBuffer('/config routing test');
      } else if (selected.id === 'routing_edit') {
        closeOverlay();
        setInputBuffer('/config routing set base_url ');
      }
      statusLine = 'Settings command prepared in input box';
      scheduleRender();
      return;
    }
  };

  const buildLogLines = (width: number): string[] => {
    const normalizedWidth = Math.max(12, width);
    const merged = [
      ...routeLog.map((entry) => ({
        timestamp: entry.timestamp,
        category: 'ROUTE',
        title: `${entry.agentName}`,
        content: entry.content,
        color: chalk.yellowBright,
      })),
      ...toolCallLog.map((entry) => ({
        timestamp: entry.timestamp,
        category: 'TOOL',
        title: `${entry.agentName} -> ${entry.toolName}`,
        content: entry.content,
        color: chalk.cyanBright,
      })),
      ...thinkLog.map((entry) => ({
        timestamp: entry.timestamp,
        category: 'THINK',
        title: `${entry.agentName}`,
        content: entry.content,
        color: chalk.gray,
      })),
      ...agentCommLog
        .filter((entry) => entry.type !== 'tool')
        .map((entry) => ({
        timestamp: entry.timestamp,
        category: 'AGENT',
        title: `${entry.from} -> ${entry.to}`,
        content: `${entry.type}: ${entry.content}`,
        color: chalk.magentaBright,
      })),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (merged.length === 0) {
      return [chalk.gray('No runtime logs yet.')];
    }

    return merged.flatMap((entry) => {
      const time = entry.timestamp.slice(11, 19);
      const head = entry.color(`[${entry.category}] ${time} ${entry.title}`);
      const body = wrapPlainText(entry.content, Math.max(10, normalizedWidth - 2)).map((line) => `  ${line}`);
      return [head, ...body, ''];
    });
  };

  const getActivePaperValidationBadge = (): string => {
    if (!core || !state.activePaperId) {
      return chalk.gray('paper:none');
    }
    try {
      const workspaceDir = core.paperWorkspace.getWorkspaceDir(state.activePaperId);
      const strictPath = path.join(workspaceDir, 'strict-validation.json');
      if (!fs.existsSync(strictPath)) {
        return chalk.gray(`paper:${state.activePaperId}`);
      }
      const strict = JSON.parse(fs.readFileSync(strictPath, 'utf-8')) as { ready?: boolean };
      if (strict.ready === true) return chalk.green(`paper:${state.activePaperId} PASS`);
      if (strict.ready === false) return chalk.red(`paper:${state.activePaperId} FAIL`);
      return chalk.yellow(`paper:${state.activePaperId} pending`);
    } catch {
      return chalk.yellow(`paper:${state.activePaperId} unknown`);
    }
  };

  const getProductionReadinessBadge = (): string => {
    try {
      if (!fs.existsSync(PRODUCTION_STATE_PATH)) return chalk.gray('prod:unknown');
      const stateJson = JSON.parse(fs.readFileSync(PRODUCTION_STATE_PATH, 'utf-8').replace(/^\uFEFF/, '')) as {
        isProductionReady?: boolean;
        qualityScore?: number;
      };
      const score = typeof stateJson.qualityScore === 'number' ? ` q=${stateJson.qualityScore}` : '';
      if (stateJson.isProductionReady === true) return chalk.green(`prod:PASS${score}`);
      if (stateJson.isProductionReady === false) return chalk.red(`prod:FAIL${score}`);
      return chalk.yellow(`prod:pending${score}`);
    } catch {
      return chalk.yellow('prod:error');
    }
  };

  const getActivePaperValidationSummary = (): ActivePaperValidationSummary | null => {
    if (!core || !state.activePaperId) {
      return null;
    }
    try {
      const workspaceDir = core.paperWorkspace.getWorkspaceDir(state.activePaperId);
      const strictPath = path.join(workspaceDir, 'strict-validation.json');
      const evidencePath = path.join(workspaceDir, 'evidence-manifest.json');
      if (!fs.existsSync(strictPath)) {
        return null;
      }
      const strict = JSON.parse(fs.readFileSync(strictPath, 'utf-8').replace(/^\uFEFF/, '')) as {
        ready?: boolean;
        checklist?: Array<{ label?: string; id?: string; status?: 'passed' | 'failed' | 'warning'; detail?: string }>;
      };
      return {
        paperId: state.activePaperId,
        ready: strict.ready ?? null,
        checklist: Array.isArray(strict.checklist)
          ? strict.checklist.map((item) => ({
            label: item.label ?? item.id ?? 'check',
            status: item.status ?? 'warning',
            detail: item.detail ?? '',
          }))
          : [],
        strictPath: fs.existsSync(strictPath) ? strictPath : undefined,
        evidencePath: fs.existsSync(evidencePath) ? evidencePath : undefined,
      };
    } catch {
      return null;
    }
  };

  const buildValidationSummaryLines = (width: number): string[] => {
    const summary = getActivePaperValidationSummary();
    if (!summary) return [];
    const headerStatus = summary.ready === true
      ? chalk.green('PASS')
      : summary.ready === false
        ? chalk.red('FAIL')
        : chalk.yellow('PENDING');
    const failed = summary.checklist.filter((item) => item.status === 'failed');
    const warnings = summary.checklist.filter((item) => item.status === 'warning');
    const focus = [...failed, ...warnings, ...summary.checklist.filter((item) => item.status === 'passed')].slice(0, 3);
    const lines: string[] = [
      chalk.bold.white(`Paper Validation | ${summary.paperId} | ${headerStatus}`),
    ];
    if (focus.length === 0) {
      lines.push(chalk.gray('No strict-validation checklist items found.'));
    } else {
      for (const item of focus) {
        const icon = item.status === 'passed' ? chalk.green('PASS') : item.status === 'failed' ? chalk.red('FAIL') : chalk.yellow('WARN');
        lines.push(`${icon} ${item.label}: ${item.detail || '-'}`);
      }
    }
    if (summary.strictPath) lines.push(chalk.gray(`Strict: ${summary.strictPath}`));
    if (summary.evidencePath) lines.push(chalk.gray(`Evidence: ${summary.evidencePath}`));
    return lines.flatMap((line) => wrapPlainText(line, Math.max(12, width - 2)));
  };

  const render = (): void => {
    if (suspended || exiting) return;

    const cols = process.stdout.columns ?? 100;
    const rows = process.stdout.rows ?? 30;
    const compactMode = cols < 84 || rows < 24;
    const showMonitor = !compactMode && cols >= 120;
    const rightWidth = showMonitor ? Math.max(32, Math.floor(cols * 0.3)) : 0;
    const leftWidth = cols - rightWidth - (showMonitor ? 1 : 0);
    const activeAgent = core?.orchestrator?.getActiveAgent() ?? null;
    const agents = core?.orchestrator?.getAgents() ?? [];
    const cardLines = buildAgentCards(
      agents.map((agent) => ({ id: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role })),
      activeAgent?.id ?? null,
      agentStates,
      leftWidth,
    );
    const topCardsHeight = compactMode ? Math.min(8, Math.max(4, 2 + cardLines.length)) : Math.min(14, Math.max(6, 2 + cardLines.length));
    const footerHeight = compactMode ? 4 : 5;
    const bodyHeight = Math.max(compactMode ? 6 : 10, rows - topCardsHeight - footerHeight);
    const logBodyHeight = Math.max(compactMode ? 4 : 6, bodyHeight - 2);
    const messageBodyHeight = Math.max(compactMode ? 5 : 8, bodyHeight - 2);
    lastMessageBodyHeight = messageBodyHeight;
    const contextWindow = getContextWindow(config.model);
    const usagePct = contextWindow > 0 ? Math.min(100, Math.round((tokenUsage.totalTokens / contextWindow) * 100)) : 0;
    const usageColor = getTokenUsageColor(usagePct);
    const queueBadge = queuedMessages.length > 0 ? chalk.yellow(` queued:${queuedMessages.length}`) : chalk.gray(' queued:0');
    const promptPrefix = state.isMultiLine ? chalk.yellow('... ') : chalk.cyan('> ');
    const promptWidth = displayWidth(stripAnsiText(promptPrefix));
    const promptViewport = buildInputViewport(inputBuffer, cursorIndex, Math.max(6, leftWidth - promptWidth - 4));

    const filteredCommands = getFilteredCommands();
    const pageStart = filteredCommands.length <= SUGGESTIONS_PAGE
      ? 0
      : Math.min(
        Math.max(0, suggestionIndex - Math.floor(SUGGESTIONS_PAGE / 2)),
        Math.max(0, filteredCommands.length - SUGGESTIONS_PAGE),
      );
    const suggestionText = filteredCommands.length === 0
      ? chalk.gray('Commands: /help /tools /agents /setup /paper:new /paper:export')
      : filteredCommands
        .slice(pageStart, pageStart + SUGGESTIONS_PAGE)
        .map((command, index) => {
          const absolute = pageStart + index;
          return absolute === suggestionIndex && suggestionSeed !== null
            ? chalk.cyanBright(command)
            : chalk.gray(command);
        })
        .join(chalk.gray(' | '));

    const validationLines = buildValidationSummaryLines(Math.max(12, leftWidth - 4));
    const messageLines = [
      ...validationLines,
      ...(validationLines.length > 0 ? [''] : []),
      ...entries.flatMap((entry) => formatEntry(entry, Math.max(12, leftWidth - 4))),
    ];
    const visibleMessages = sliceFromBottom(messageLines, messageBodyHeight, messageScrollOffset);
    const logLines = buildLogLines(Math.max(12, rightWidth - 4));
    const visibleLogs = sliceFromBottom(logLines, logBodyHeight, logScrollOffset);

    const topHeaderLines = [
      fitDisplay(
        `${chalk.bold.cyan('TZUKWAN')} ${chalk.gray('|')} ${chalk.white(config.model)} ${chalk.gray('@')} ${chalk.white(describeEndpoint(config.baseUrl))} ${chalk.gray('|')} ${chalk.white(config.provider.toUpperCase())}`,
        leftWidth,
      ),
      fitDisplay(
        `${chalk.gray('Agent')} ${chalk.white(activeAgent ? `${activeAgent.emoji ?? 'AI'} ${activeAgent.name}` : 'offline')} ${chalk.gray('|')} ${chalk.gray('Tokens')} ${usageColor(`${formatTokenCount(tokenUsage.totalTokens)}/${formatTokenCount(contextWindow)} ${usagePct}%`)} ${chalk.gray('|')} ${getActivePaperValidationBadge()} ${chalk.gray('|')} ${getProductionReadinessBadge()}`,
        leftWidth,
      ),
      ...cardLines,
    ].slice(0, topCardsHeight);

    while (topHeaderLines.length < topCardsHeight) topHeaderLines.push(' '.repeat(leftWidth));

    const leftBodyBox = renderBox({
      width: leftWidth,
      height: bodyHeight,
      title: focusedPane === 'messages' ? 'Conversation *' : 'Conversation',
      titleColor: chalk.cyanBright,
    }, visibleMessages);

    const rightBodyBox = showMonitor
      ? renderBox({
        width: rightWidth,
        height: bodyHeight,
        title: focusedPane === 'logs' ? 'Runtime Logs *' : 'Runtime Logs',
        titleColor: chalk.magentaBright,
      }, visibleLogs)
      : [];

    const overlayVisibleCount = Math.max(1, Math.min(8, overlayItems.length));
    const overlayWindowStart = Math.max(0, Math.min(overlayIndex - Math.floor(overlayVisibleCount / 2), Math.max(0, overlayItems.length - overlayVisibleCount)));
    const overlayWindowItems = overlayItems.slice(overlayWindowStart, overlayWindowStart + overlayVisibleCount);
    const overlayTitle = overlayMode === 'commands'
      ? 'Command Palette'
      : overlayMode === 'sessions'
        ? 'Session History'
        : overlayMode === 'agents'
          ? 'Agent Picker'
          : overlayMode === 'papers'
            ? 'Paper Workspaces'
            : overlayMode === 'models'
              ? 'Model Picker'
              : overlayMode === 'tools'
                ? 'Active Tools'
                : overlayMode === 'permissions'
                  ? 'Permissions'
                  : overlayMode === 'mcp'
                    ? 'MCP Servers'
                    : overlayMode === 'skills'
                      ? 'Installed Skills'
                      : overlayMode === 'loops'
                        ? 'Loops'
                          : overlayMode === 'hooks'
                            ? 'Hooks'
                            : overlayMode === 'settings'
                              ? 'Settings'
                              : 'Literature Sources';
    const overlayLines = overlayMode && overlayItems.length > 0
      ? renderBox({
        width: Math.max(18, Math.min(leftWidth - 2, Math.max(24, Math.floor(leftWidth * 0.78)))),
        height: Math.min(bodyHeight - 1, Math.max(6, overlayVisibleCount + 3)),
        title: overlayTitle,
        titleColor: overlayMode === 'commands' ? chalk.cyanBright : chalk.yellowBright,
      }, overlayWindowItems.map((item, index) => {
        const absoluteIndex = overlayWindowStart + index;
        const selected = absoluteIndex === overlayIndex;
        const base = `${selected ? '>' : ' '} ${item.label} - ${item.description}`;
        const preview = item.preview ? ` :: ${item.preview}` : '';
        return selected ? chalk.cyanBright(`${base}${preview}`) : `${base}${preview}`;
      }))
      : [];
    const overlayLeft = overlayLines.length > 0 ? Math.max(0, Math.floor((leftWidth - displayWidth(stripAnsiText(overlayLines[0] ?? ''))) / 2)) : 0;
    const overlayTop = overlayLines.length > 0 ? Math.max(0, Math.floor((bodyHeight - overlayLines.length) / 2)) : 0;

    const footerLines = [
      fitDisplay(`${chalk.gray('Status')} ${statusLine}${queueBadge}${busy ? chalk.yellow(' | running') : chalk.green(' | idle')} ${chalk.gray(`| focus:${focusedPane}`)}`, leftWidth),
      fitDisplay(chalk.gray(compactMode ? 'Keys: / palette | Ctrl+O pane | F12 logs' : 'Keys: / opens palette | Enter selects overlay item | Ctrl+O switch pane | F12 logs | /setup'), leftWidth),
      fitDisplay(suggestionText, leftWidth),
      fitDisplay(`${promptPrefix}${promptViewport.visibleText}`, leftWidth),
      fitDisplay(chalk.gray(state.isMultiLine ? 'Multiline mode active.' : 'Enter sends. Esc clears input. Ctrl+C twice exits.'), leftWidth),
    ];

    const screenLines: string[] = [];
    for (let i = 0; i < topCardsHeight; i += 1) {
      const left = fitDisplay(topHeaderLines[i] ?? '', leftWidth);
      if (showMonitor) {
        const rightTitle = i === 0
          ? fitDisplay(chalk.bold.white('TOOL / THINK / AGENT LOG'), rightWidth)
          : i === 1
            ? fitDisplay(chalk.gray('Logs stay in the right panel and scroll there only.'), rightWidth)
            : ' '.repeat(rightWidth);
        screenLines.push(`${left}${chalk.gray('|')}${rightTitle}`);
      } else {
        screenLines.push(left);
      }
    }

    for (let i = 0; i < bodyHeight; i += 1) {
      let left = fitDisplay(leftBodyBox[i] ?? '', leftWidth);
      if (overlayLines.length > 0 && i >= overlayTop && i < overlayTop + overlayLines.length) {
        const overlayLine = overlayLines[i - overlayTop] ?? '';
        const prefix = ' '.repeat(overlayLeft);
        left = fitDisplay(`${prefix}${overlayLine}`, leftWidth);
      }
      if (showMonitor) {
        const right = fitDisplay(rightBodyBox[i] ?? '', rightWidth);
        screenLines.push(`${left}${chalk.gray('|')}${right}`);
      } else {
        screenLines.push(left);
      }
    }

    for (let i = 0; i < footerHeight; i += 1) {
      const left = fitDisplay(footerLines[i] ?? '', leftWidth);
      if (showMonitor) {
        const right = i === 0
          ? fitDisplay(chalk.gray(`log scroll:${logScrollOffset}`), rightWidth)
          : i === 1
            ? fitDisplay(chalk.gray(`msg scroll:${messageScrollOffset}`), rightWidth)
            : ' '.repeat(rightWidth);
        screenLines.push(`${left}${chalk.gray('|')}${right}`);
      } else {
        screenLines.push(left);
      }
    }

    while (screenLines.length < rows) screenLines.push(' '.repeat(cols));
    const frame = screenLines.slice(0, rows).map((line) => `${line}\x1b[0m\x1b[K`).join('\n');
    process.stdout.write(`\x1b[?25l\x1b[H\x1b[J${frame}`);
    readline.cursorTo(process.stdout, promptWidth + promptViewport.cursorColumn, rows - 2);
    process.stdout.write('\x1b[?25h');
  };

  scheduleRender = (): void => {
    if (suspended || exiting) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 16);
  };

  const handleResize = (): void => {
    if (suspended || exiting) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      render();
    }, 50);
  };

  const cycleAgent = (direction: 1 | -1): void => {
    if (!core?.orchestrator) return;
    const agents = core.orchestrator.getAgents();
    const current = core.orchestrator.getActiveAgent();
    const currentIndex = agents.findIndex((agent) => agent.id === current.id);
    const nextAgent = agents[((currentIndex + direction) + agents.length) % agents.length];
    if (!nextAgent) return;
    core.orchestrator.setActiveAgent(nextAgent.id);
    state.currentAgent = nextAgent.id;
    state.agentMode = true;
    statusLine = `Switched to ${nextAgent.name}`;
    scheduleRender();
  };

  const cycleSuggestion = (direction: 1 | -1): void => {
    const filter = inputBuffer.startsWith('/') ? inputBuffer : null;
    if (!filter) {
      cycleAgent(direction);
      return;
    }
    const filtered = suggestionSeed
      ? getFilteredCommands()
      : ALL_SLASH_COMMANDS
        .filter((command) => command !== '/')
        .filter((command) => filter === '/' || command.toLowerCase().startsWith(filter.toLowerCase()) || command.toLowerCase().slice(1).includes(filter.toLowerCase().slice(1)));
    if (filtered.length === 0) {
      cycleAgent(direction);
      return;
    }
    if (!suggestionSeed) {
      suggestionSeed = filter;
      suggestionIndex = direction === 1 ? 0 : filtered.length - 1;
    } else {
      suggestionIndex = ((suggestionIndex + direction) + filtered.length) % filtered.length;
    }
    const selected = filtered[suggestionIndex];
    if (!selected) return;
    setInputBuffer(`${selected} `);
    historyIndex = commandHistory.length;
    statusLine = 'Command suggestion selected';
    scheduleRender();
  };

  const browseHistory = (direction: 1 | -1): void => {
    if (commandHistory.length === 0) return;
    if (historyIndex === commandHistory.length) historyDraft = inputBuffer;
    historyIndex = Math.min(commandHistory.length, Math.max(0, historyIndex + direction));
    setInputBuffer(historyIndex === commandHistory.length ? historyDraft : (commandHistory[historyIndex] ?? ''));
    resetSuggestionCycle();
    scheduleRender();
  };

  const insertTextAtCursor = (text: string): void => {
    const chars = toChars(inputBuffer);
    chars.splice(cursorIndex, 0, ...toChars(text));
    inputBuffer = chars.join('');
    cursorIndex += toChars(text).length;
  };

  const deleteBeforeCursor = (): void => {
    if (cursorIndex === 0) return;
    const chars = toChars(inputBuffer);
    chars.splice(cursorIndex - 1, 1);
    inputBuffer = chars.join('');
    cursorIndex -= 1;
  };

  const deleteAtCursor = (): void => {
    const chars = toChars(inputBuffer);
    if (cursorIndex >= chars.length) return;
    chars.splice(cursorIndex, 1);
    inputBuffer = chars.join('');
  };

  const moveCursor = (delta: number): void => {
    cursorIndex = Math.max(0, Math.min(toChars(inputBuffer).length, cursorIndex + delta));
  };

  const moveCursorToEdge = (edge: 'start' | 'end'): void => {
    cursorIndex = edge === 'start' ? 0 : toChars(inputBuffer).length;
  };

  const reloadCore = async (): Promise<void> => {
      const nextCore = await loadCore(config);
      if (nextCore && nextCore !== core && state.activePaperId) await activatePaperWorkspace(state.activePaperId, state, nextCore);
      core = nextCore;
    };

  const integrationWatchers: fs.FSWatcher[] = [];
  let reloadDebounce: NodeJS.Timeout | null = null;
  const scheduleIntegrationReload = (): void => {
    if (reloadDebounce) clearTimeout(reloadDebounce);
    reloadDebounce = setTimeout(async () => {
      await reloadCore();
      statusLine = 'Runtime integrations reloaded';
      scheduleRender();
    }, 300);
  };
  for (const watchPath of [
    path.join(TZUKWAN_DIR, 'mcp-servers.json'),
    path.join(TZUKWAN_DIR, 'skills'),
    path.join(process.cwd(), '.tzukwan', 'skills'),
    path.join(process.cwd(), 'skills'),
    path.join(os.homedir(), '.tzukwan', 'skills'),
  ]) {
    try {
      if (fs.existsSync(watchPath)) {
        integrationWatchers.push(fs.watch(watchPath, { recursive: fs.statSync(watchPath).isDirectory() }, scheduleIntegrationReload));
      }
    } catch {
      // Best-effort only.
    }
  }

  const leaveFullscreen = (): void => {
    process.stdout.write('\x1b[?1049l\x1b[?25h');
  };

  const cleanup = async (): Promise<void> => {
    if (exiting) return;
    exiting = true;
    if (renderTimer) clearTimeout(renderTimer);
    if (resizeTimer) clearTimeout(resizeTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reloadDebounce) clearTimeout(reloadDebounce);
      for (const watcher of integrationWatchers) watcher.close();
      process.stdout.off('resize', handleResize);
    process.stdin.off('keypress', keypressHandler);
    process.stdin.setRawMode(false);
    coreModule.setAgentCommListener(null);
    coreModule.setAgentRuntimeListener(null);
    leaveFullscreen();
    core?.orchestrator?.saveConversations();
    (core?.loopManager as { stopAll?: (options?: { preserveActiveState?: boolean }) => void } | null)?.stopAll?.({ preserveActiveState: true });
    tgBridgeForPolling?.stopPolling?.();
    try { await syncSessionFromConversation(); } catch {}
    persistHistory();
    try {
      await core?.hookManager?.trigger('session-end', { sessionName: state.sessionName });
    } catch (hookErr) {
      console.warn('[TUI] session-end hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
    }
    resolveSession?.();
  };

  const runInteractiveCommand = async (command: string): Promise<CommandResult> => {
    suspended = true;
    process.stdin.off('keypress', keypressHandler);
    process.stdin.setRawMode(false);
    leaveFullscreen();
    try {
      return await handleSlashCommand(command, state, config, core);
    } finally {
      if (!exiting) {
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', keypressHandler);
        suspended = false;
        process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25h');
        render();
      }
    }
  };

  const submitInput = async (): Promise<void> => {
    if (busyLock) return;
    busyLock = true;
    const raw = inputBuffer.trimEnd();
    inputBuffer = '';
    cursorIndex = 0;
    closeOverlay();
    historyIndex = commandHistory.length;
    historyDraft = '';
    resetSuggestionCycle();
    if (!raw) {
      statusLine = 'Ready';
      busyLock = false;
      render();
      return;
    }
    if (raw.endsWith('\\')) {
      state.multiLineBuffer += `${raw.slice(0, -1)}\n`;
      state.isMultiLine = true;
      statusLine = 'Multiline mode. Finish with Enter on a final line.';
      busyLock = false;
      render();
      return;
    }
    const userInput = state.isMultiLine ? `${state.multiLineBuffer}${raw}`.trim() : raw.trim();
    state.multiLineBuffer = '';
    state.isMultiLine = false;
    if (!userInput) {
      statusLine = 'Ready';
      busyLock = false;
      render();
      return;
    }
    if (commandHistory[commandHistory.length - 1] !== userInput) {
      commandHistory.push(userInput);
      if (commandHistory.length > MAX_CMD_HISTORY_SIZE) {
        commandHistory.splice(0, commandHistory.length - MAX_CMD_HISTORY_SIZE);
      }
    }

    messageScrollOffset = 0;
    busy = true;
    interruptRequested = false;
    currentAbortController = new AbortController();
    ctrlCCount = 0;

    try {
      if (userInput === '/history') {
        busy = false;
        busyLock = false;
        await openSessionOverlay();
        return;
      }
      if (userInput === '/agent' || userInput === '/chat' || userInput === '/agents') {
        busy = false;
        busyLock = false;
        openAgentOverlay();
        return;
      }
      if (userInput === '/paper:open' || userInput === '/paper:list') {
        busy = false;
        busyLock = false;
        openPaperOverlay();
        return;
      }
      if (userInput === '/model') {
        busy = false;
        busyLock = false;
        openModelOverlay();
        return;
      }
      if (userInput === '/config') {
        busy = false;
        busyLock = false;
        openSettingsOverlay();
        return;
      }
      if (userInput === '/search') {
        busy = false;
        busyLock = false;
        openLiteratureSourceOverlay();
        return;
      }
      if (userInput === '/tools') {
        busy = false;
        busyLock = false;
        openToolsOverlay();
        return;
      }
      if (userInput === '/permissions') {
        busy = false;
        busyLock = false;
        openPermissionsOverlay();
        return;
      }
      if (userInput === '/mcp') {
        busy = false;
        busyLock = false;
        openMcpOverlay();
        return;
      }
      if (userInput === '/skills' || userInput === '/skills list') {
        busy = false;
        busyLock = false;
        await openSkillsOverlay();
        return;
      }
      if (userInput === '/loop' || userInput === '/loops') {
        busy = false;
        busyLock = false;
        openLoopsOverlay();
        return;
      }
      if (userInput === '/hook' || userInput === '/hooks') {
        busy = false;
        busyLock = false;
        openHooksOverlay();
        return;
      }
      if (userInput.startsWith('/')) {
        if (userInput === '/clear') {
          entries.length = 0;
          pushEntry(entries, 'system', 'Tzukwan', 'Screen cleared.');
          statusLine = 'Cleared';
          busy = false;
          busyLock = false;
          render();
          return;
        }
        pushEntry(entries, 'system', 'Command', userInput);
        const interactive = /^\/(?:setup|profile:edit)\b/i.test(userInput);
        let result: CommandResult = 'handled';
        let output = '';
        try {
          if (interactive) {
            result = await runInteractiveCommand(userInput);
          } else {
            const captured = await captureTerminalOutput(() => handleSlashCommand(userInput, state, config, core));
            result = captured.result;
            output = captured.output;
          }
        } catch (error) {
          output = `Command failed: ${String(error)}`;
        }
        if (output) pushEntry(entries, output.toLowerCase().includes('error') ? 'error' : 'system', 'Output', output);
        if (result === 'exit') {
          await cleanup();
          return;
        }
        await reloadCore();
        pushEntry(entries, 'system', 'Runtime', `Active provider: ${config.provider} | model: ${config.model}`);
        statusLine = 'Command completed';
        busy = false;
        busyLock = false;
        await syncSessionFromConversation();
        render();
        return;
      }

      state.conversationHistory.push({ role: 'user', content: userInput });
      pushEntry(entries, 'user', 'You', userInput);
      if (!core?.orchestrator || !core.hookManager) {
        pushEntry(entries, 'error', 'LLM', 'LLM core is not available. Run /setup or inspect your configuration.');
        statusLine = 'LLM unavailable';
        busy = false;
        busyLock = false;
        render();
        return;
      }

      const activeAgent = core.orchestrator.getActiveAgent();
      const assistantEntry: TUIEntry = { kind: 'assistant', title: activeAgent?.name ?? 'Assistant', content: '' };
      entries.push(assistantEntry);
      let rawStream = '';
      let lastThinkingContent = '';
      statusLine = `Thinking with ${assistantEntry.title}... [Esc interrupt | Tab queue]`;
      render();

      const checkSteerInput = (): string | null => {
        if (!pendingSteer) return null;
        const steer = pendingSteer;
        pendingSteer = null;
        return steer;
      };

      const response = await streamWithOrchestratorTUI(
        userInput,
        state,
        core.orchestrator,
        core.hookManager,
        core.memManager,
        core.paperWorkspace,
        (chunk: string) => {
          rawStream += chunk;
          const parsed = parseThinkingEnvelope(rawStream);
          assistantEntry.content = parsed.answer;
          const normalizedThinking = normalizeContent(parsed.thinking);
          if (normalizedThinking && normalizedThinking !== lastThinkingContent) {
            lastThinkingContent = normalizedThinking;
            setThinkLog(normalizedThinking, assistantEntry.title);
          }
          const steerInput = checkSteerInput();
          if (steerInput) {
            const steerThinking = [normalizedThinking, `[User steer: ${steerInput}]`].filter(Boolean).join('\n');
            lastThinkingContent = steerThinking;
            setThinkLog(steerThinking, assistantEntry.title);
          }
          scheduleRender();
        },
        currentAbortController.signal,
      );

      if (interruptRequested) {
        pushEntry(entries, 'system', 'Interrupt', 'Execution interrupted by user.');
        statusLine = 'Interrupted';
      } else {
        assistantEntry.content = response;
        state.conversationHistory.push({ role: 'assistant', content: response });
        await syncSessionFromConversation();
        const lastUsage = core.orchestrator?.lastUsage;
        if (lastUsage) {
          tokenUsage = {
            promptTokens: lastUsage.promptTokens,
            completionTokens: lastUsage.completionTokens,
            totalTokens: lastUsage.promptTokens + lastUsage.completionTokens,
          };
        }
        statusLine = 'Ready';
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        pushEntry(entries, 'system', 'Interrupt', 'Execution interrupted by user.');
        statusLine = 'Interrupted';
      } else {
        pushEntry(entries, 'error', 'Error', String(error));
        statusLine = `Error: ${String(error)}`;
        state.conversationHistory.pop();
      }
    } finally {
      busy = false;
      busyLock = false;
      currentAbortController = null;
      interruptRequested = false;

      if (queuedMessages.length > 0) {
        const nextMessage = queuedMessages.shift();
        if (nextMessage) {
          inputBuffer = nextMessage.text;
          cursorIndex = toChars(inputBuffer).length;
          statusLine = `Processing queued message [${queuedMessages.length} remaining]...`;
          render();
          setTimeout(() => submitInput(), 100);
        }
      } else {
        render();
      }
    }
  };

  const keypressHandler = (str: string | undefined, key: Keypress | undefined): void => {
    if (suspended || exiting) return;

    const hasTypedInput = inputBuffer.trim().length > 0;
    const commandPaletteSelecting = overlayMode === 'commands'
      && overlayItems.length > 0
      && inputBuffer.startsWith('/')
      && !/\s/.test(inputBuffer.trim());
    const chooserSelecting = overlayMode !== null && overlayMode !== 'commands';
    const isRawSubmitKey = str === '\r' || str === '\n';
    const isSubmitKey = isRawSubmitKey || key?.name === 'return' || key?.name === 'enter';

    if (isSubmitKey && !busy && hasTypedInput && !commandPaletteSelecting && !chooserSelecting) {
      void submitInput();
      return;
    }

    if (!key) return;

    if (overlayMode && overlayMode !== 'commands') {
      if (key.name === 'escape') { closeOverlay(); statusLine = 'Chooser closed'; render(); return; }
      if (key.name === 'up') { overlayIndex = Math.max(0, overlayIndex - 1); render(); return; }
      if (key.name === 'down') { overlayIndex = Math.min(Math.max(0, overlayItems.length - 1), overlayIndex + 1); render(); return; }
      if (key.name === 'pageup') { overlayIndex = Math.max(0, overlayIndex - 5); render(); return; }
      if (key.name === 'pagedown') { overlayIndex = Math.min(Math.max(0, overlayItems.length - 1), overlayIndex + 5); render(); return; }
      if (key.name === 'return' || key.name === 'enter') { void restoreOverlaySelection(); return; }
    }

    if (overlayMode === 'commands' && overlayItems.length > 0) {
      if (key.name === 'escape') { closeOverlay(); statusLine = 'Command palette closed'; render(); return; }
      if (key.name === 'up') { overlayIndex = Math.max(0, overlayIndex - 1); render(); return; }
      if (key.name === 'down' || key.name === 'tab') {
        overlayIndex = (overlayIndex + 1) % overlayItems.length;
        render();
        return;
      }
      if ((key.name === 'return' || key.name === 'enter') && !busy) {
        const selected = overlayItems[overlayIndex];
        if (selected) {
          setInputBuffer(`${selected.id} `);
          closeOverlay();
          statusLine = `Selected ${selected.id}`;
          render();
        }
        return;
      }
    }

    if (key.ctrl && key.name === 'c') {
      if (state.isMultiLine) {
        state.multiLineBuffer = '';
        state.isMultiLine = false;
        statusLine = 'Multiline input cleared';
        render();
        return;
      }
      ctrlCCount += 1;
      if (ctrlCCount >= 2) {
        void cleanup();
        return;
      }
      statusLine = 'Press Ctrl+C again to exit.';
      render();
      setTimeout(() => {
        ctrlCCount = 0;
        if (!busy && !exiting) {
          statusLine = 'Ready';
          render();
        }
      }, 2000);
      return;
    }

    if (busy) {
      if (key.name === 'escape') {
        interruptRequested = true;
        currentAbortController?.abort();
        statusLine = 'Interrupt requested...';
        render();
        return;
      }
      if (key.name === 'tab' && inputBuffer.trim()) {
        queuedMessages.push({ text: inputBuffer.trim(), timestamp: Date.now(), type: 'queue' });
        inputBuffer = '';
        cursorIndex = 0;
        statusLine = `[${queuedMessages.length}] message(s) queued`;
        render();
        return;
      }
      if (isSubmitKey) {
        if (inputBuffer.trim()) {
          pendingSteer = inputBuffer.trim();
          inputBuffer = '';
          cursorIndex = 0;
          statusLine = 'Steering input sent...';
          render();
        }
        return;
      }
    }

    ctrlCCount = 0;
    if (key.ctrl && key.name === 'a') { moveCursorToEdge('start'); render(); return; }
    if (key.ctrl && key.name === 'e') { moveCursorToEdge('end'); render(); return; }
    if (key.ctrl && key.name === 'l') { render(); return; }
    if (key.ctrl && key.name === 'o') {
      focusedPane = focusedPane === 'messages' ? 'logs' : 'messages';
      statusLine = focusedPane === 'messages' ? 'Conversation pane focused' : 'Log pane focused';
      render();
      return;
    }
    if (key.name === 'f12' || (key.name === 'm' && key.ctrl)) {
      focusedPane = 'logs';
      statusLine = 'Log pane focused';
      render();
      return;
    }
    if (key.name === 'return' || key.name === 'enter') return;
    if (key.name === 'tab' && !busy) { cycleSuggestion(key.shift ? -1 : 1); return; }
    if (key.name === 'up') {
      if (inputBuffer.startsWith('/') || suggestionSeed !== null) {
        cycleSuggestion(-1);
      } else if (focusedPane === 'messages') {
        messageScrollOffset += 1;
        scheduleRender();
      } else {
        logScrollOffset += 1;
        scheduleRender();
      }
      return;
    }
    if (key.name === 'down') {
      if (inputBuffer.startsWith('/') || suggestionSeed !== null) {
        cycleSuggestion(1);
      } else if (focusedPane === 'messages') {
        messageScrollOffset = Math.max(0, messageScrollOffset - 1);
        scheduleRender();
      } else {
        logScrollOffset = Math.max(0, logScrollOffset - 1);
        scheduleRender();
      }
      return;
    }
    if (key.name === 'pageup') {
      if (focusedPane === 'messages') messageScrollOffset += Math.max(1, Math.floor(lastMessageBodyHeight / 2));
      else logScrollOffset += Math.max(1, Math.floor(lastMessageBodyHeight / 2));
      scheduleRender();
      return;
    }
    if (key.name === 'pagedown') {
      if (focusedPane === 'messages') messageScrollOffset = Math.max(0, messageScrollOffset - Math.max(1, Math.floor(lastMessageBodyHeight / 2)));
      else logScrollOffset = Math.max(0, logScrollOffset - Math.max(1, Math.floor(lastMessageBodyHeight / 2)));
      scheduleRender();
      return;
    }
    if (key.ctrl && key.name === 'p') { browseHistory(-1); return; }
    if (key.ctrl && key.name === 'n') { browseHistory(1); return; }
    if (key.name === 'left') { moveCursor(-1); resetSuggestionCycle(); render(); return; }
    if (key.name === 'right') { moveCursor(1); resetSuggestionCycle(); syncCommandOverlayFromInput(); render(); return; }
    if (key.name === 'home') { moveCursorToEdge('start'); resetSuggestionCycle(); syncCommandOverlayFromInput(); render(); return; }
    if (key.name === 'end') { moveCursorToEdge('end'); resetSuggestionCycle(); syncCommandOverlayFromInput(); render(); return; }
    if (key.name === 'delete') { deleteAtCursor(); historyIndex = commandHistory.length; resetSuggestionCycle(); syncCommandOverlayFromInput(); render(); return; }
    if (key.name === 'backspace') { deleteBeforeCursor(); historyIndex = commandHistory.length; resetSuggestionCycle(); syncCommandOverlayFromInput(); render(); return; }
    if (key.name === 'escape') { inputBuffer = ''; cursorIndex = 0; resetSuggestionCycle(); closeOverlay(); statusLine = 'Input cleared'; render(); return; }
    if (str && !key.ctrl && !key.meta) {
      insertTextAtCursor(str);
      historyIndex = commandHistory.length;
      resetSuggestionCycle();
      syncCommandOverlayFromInput();
      statusLine = 'Ready';
      render();
    }
  };

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', keypressHandler);
  process.stdout.on('resize', handleResize);
  heartbeatTimer = setInterval(() => {
    if (!suspended && !exiting) scheduleRender();
  }, 1000);

  const exitHandler = (): void => {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    leaveFullscreen();
  };

  process.on('exit', exitHandler);
  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);

  process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25h');
  await renderSplash(config, state);
  render();

  await new Promise<void>((resolve) => {
    resolveSession = resolve;
  });

  process.off('exit', exitHandler);
  process.off('SIGINT', exitHandler);
  process.off('SIGTERM', exitHandler);
}
