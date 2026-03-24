import * as fs from 'fs';
import * as path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import type {
  AgentOrchestrator,
  HookManager,
  MemoryManager,
  PaperMeta,
  PaperWorkspace,
} from '@tzukwan/core';
import {
  CitationVerifier,
  exportPaperWorkspace,
  type Citation,
  type SourceCodeArtifact,
  type VerificationResult,
} from '@tzukwan/research';
import type { Config } from './commands/config.js';
import { configSet, configShow, ensureConfig, getRoutingConfig, saveConfig, saveRoutingConfig, testConfigConnection, testRoutingConnection } from './commands/config.js';
import { skillsList, skillsInstall, skillsUpdate, skillsUninstall } from './commands/skills.js';
import { searchDatasets as searchDatasetsCmd, searchLiterature as searchLiteratureCmd } from './commands/search.js';
import { runSetupWizard } from './setup-wizard.js';
import { CONFIG_PATH } from './shared/constants.js';
import { loadCLIRuntime, resetRuntimeCache, type CLIRuntime } from './shared/runtime.js';
import { inferProviderFromBaseUrl, normalizeApiKey, normalizeProvider } from './shared/provider-utils.js';
import { displayError, displayInfo, displayResult, displaySuccess, displayDiff, displayChange, displayToolCall, displayThinking } from './ui/display.js';

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export interface REPLState {
  conversationHistory: ChatMessage[];
  multiLineBuffer: string;
  isMultiLine: boolean;
  currentAgent: string;
  agentMode: boolean;
  thinkMode: boolean;
  sessionName: string;
  sessionStart: Date;
  activePaperId: string | null;
  activeTaskId: string | null;
  approvalMode: ApprovalMode;
}

/** Approval mode for tool execution: suggest (confirm all), auto (confirm writes), full (auto all) */
export type ApprovalMode = 'suggest' | 'auto' | 'full';

export type CommandResult = 'handled' | 'exit' | 'reload-runtime';

export const ALL_SLASH_COMMANDS = [
  '/',
  '/help',
  '/clear',
  '/history',
  '/compress',
  '/reset',
  '/config',
  '/model',
  '/think',
  '/agents',
  '/agent',
  '/chat',
  '/collaborate',
  '/skills',
  '/search',
  '/dataset',
  '/paper:new',
  '/paper:open',
  '/paper:close',
  '/paper:list',
  '/paper:notes',
  '/paper:agents',
  '/paper:delete',
  '/paper:export',
  '/tools',
  '/permissions',
  '/mcp',
  '/loop',
  '/loops',
  '/stop',
  '/hook',
  '/hooks',
  '/setup',
  '/profile:edit',
  '/approve',
  '/exit',
  '/quit',
] as const;

function splitCommand(input: string): { command: string; rest: string } {
  const trimmed = input.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { command: trimmed, rest: '' };
  }
  return {
    command: trimmed.slice(0, spaceIndex),
    rest: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function parseSearchArgs(rest: string): { query: string; source?: import('./commands/search.js').SearchSource; limit?: number } {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const queryParts: string[] = [];
  let source: import('./commands/search.js').SearchSource | undefined;
  let limit: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--source' && tokens[index + 1]) {
      source = tokens[index + 1] as import('./commands/search.js').SearchSource;
      index += 1;
      continue;
    }
    if (token === '--limit' && tokens[index + 1]) {
      const parsed = Number(tokens[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
      index += 1;
      continue;
    }
    queryParts.push(token);
  }

  return {
    query: queryParts.join(' ').trim(),
    source,
    limit,
  };
}

function readStoredConfig(): Record<string, unknown> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function persistRuntimeConfig(config: Config): void {
  saveConfig(config);
}

export async function loadCore(config: Config): Promise<CLIRuntime | null> {
  try {
    const runtime = await loadCLIRuntime(config, { cwd: process.cwd() });
    return runtime;
  } catch (error) {
    displayError(`Failed to initialize runtime: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function buildMemoryContext(memManager: MemoryManager, query: string): string {
  const hits = memManager.search(query, 5);
  if (hits.length === 0) {
    return '';
  }

  const lines = hits.map((hit, index) =>
    `${index + 1}. [${hit.entry.type}] ${hit.entry.content.slice(0, 240)}`,
  );
  return `## Relevant Memory\n${lines.join('\n')}`;
}

function buildPaperContext(state: REPLState, paperWorkspace: PaperWorkspace): string {
  if (!state.activePaperId) {
    return '';
  }
  return paperWorkspace.buildPaperContext(state.activePaperId);
}

export async function activatePaperWorkspace(
  paperId: string,
  state: REPLState,
  core: CLIRuntime,
): Promise<PaperMeta> {
  const meta = core.paperWorkspace.open(paperId);
  if (!meta) {
    throw new Error(`Paper workspace not found: ${paperId}`);
  }

  const workspaceDir = core.paperWorkspace.getWorkspaceDir(paperId);
  const memoryPath = path.join(workspaceDir, 'memory.jsonl');
  core.memManager.switchFile(memoryPath);

  const ensemble = core.paperWorkspace.getAgentEnsemble(paperId);
  const firstEnsemble = ensemble[0];
  if (firstEnsemble) {
    core.orchestrator.loadPaperEnsemble(paperId, ensemble);
    core.orchestrator.setActiveAgent(firstEnsemble.agentId);
    state.currentAgent = firstEnsemble.agentId;
  }

  state.activePaperId = paperId;
  return meta;
}

function deactivatePaperWorkspace(state: REPLState, core: CLIRuntime): void {
  core.paperWorkspace.close();
  core.orchestrator.unloadPaperEnsemble();
  core.orchestrator.setActiveAgent('advisor');
  core.memManager.switchFile(core.memManager.getGlobalFilePath());
  state.activePaperId = null;
  state.currentAgent = 'advisor';
}

function sanitizeExportStem(value: string): string {
  const stem = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'artifact';
}

function stripLeadingTitle(markdown: string, title: string): string {
  const trimmed = markdown.trimStart();
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`^#\\s+${escaped}\\s*\\n+`, 'i'), '');
}

function stripReferenceSection(markdown: string): string {
  const normalized = markdown.replace(/\r/g, '');
  const pattern = /\n##\s+(references|bibliography|参考文献)\s*\n[\s\S]*$/i;
  return normalized.replace(pattern, '').trim();
}

function readJsonlFile(filePath: string): unknown[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
}

function detectFileExtension(language: string): string {
  switch (language.toLowerCase()) {
    case 'python':
    case 'py':
      return 'py';
    case 'typescript':
    case 'ts':
      return 'ts';
    case 'javascript':
    case 'js':
      return 'js';
    case 'bash':
    case 'sh':
    case 'shell':
      return 'sh';
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yml';
    case 'markdown':
    case 'md':
      return 'md';
    default:
      return 'txt';
  }
}

function extractCodeArtifactsFromText(text: string, stem: string): SourceCodeArtifact[] {
  const artifacts: SourceCodeArtifact[] = [];
  const matches = text.matchAll(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g);
  let index = 0;

  for (const match of matches) {
    const language = match[1] ?? 'txt';
    const content = (match[2] ?? '').trim();
    if (!content) {
      continue;
    }

    index += 1;
    artifacts.push({
      filename: `${stem}/snippet_${String(index).padStart(2, '0')}.${detectFileExtension(language)}`,
      content,
    });
  }

  return artifacts;
}

function extractReferenceLines(text: string): string[] {
  const normalized = text.replace(/\r/g, '');
  const headingMatch = normalized.match(/\n##\s+(references|bibliography|参考文献)\s*\n([\s\S]*)$/i);
  if (!headingMatch) {
    return [];
  }

  return headingMatch[2]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractCitationCandidatesFromText(text: string): Citation[] {
  const candidates: Citation[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: Citation): void => {
    const key = `${candidate.doi ?? ''}|${candidate.arxivId ?? ''}|${candidate.title}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(candidate);
  };

  const doiMatches = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi) ?? [];
  for (const doiMatch of doiMatches) {
    const doi = doiMatch.replace(/[.,;)\]]+$/g, '');
    addCandidate({ title: doi, doi });
  }

  const arxivMatches = text.match(/\b\d{4}\.\d{4,5}(?:v\d+)?\b/g) ?? [];
  for (const arxivId of arxivMatches) {
    addCandidate({ title: arxivId, arxivId });
  }

  for (const line of extractReferenceLines(text).slice(0, 40)) {
    const title = line.replace(/^\[\d+\]\s*/, '').trim();
    if (title.length < 12) {
      continue;
    }
    const doi = title.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0];
    const arxivId = title.match(/\b\d{4}\.\d{4,5}(?:v\d+)?\b/)?.[0];
    addCandidate({
      title: title.replace(/\s+/g, ' '),
      ...(doi ? { doi } : {}),
      ...(arxivId ? { arxivId } : {}),
    });
  }

  return candidates.slice(0, 60);
}

function normalizeVerifiedRecord(result: VerificationResult) {
  return {
    title: result.resolvedTitle,
    authors: result.resolvedAuthors,
    year: result.resolvedYear,
    journal: result.resolvedJournal,
    doi: result.resolvedDoi,
    arxivId: result.resolvedArxivId,
    url: result.resolvedUrl,
    bibliographyEntry: result.bibliographyEntry,
    confidence: result.confidence,
    source: result.source,
  };
}

async function exportPaperWorkspaceBundle(
  paperId: string,
  core: CLIRuntime,
): Promise<{
  workspaceDir: string;
  markdownPath: string;
  docxPath: string;
  bibliographyPath: string;
  manifestPath: string;
  evidenceManifestPath?: string;
  strictValidationPath?: string;
}> {
  const workspaceDir = core.paperWorkspace.getWorkspaceDir(paperId);
  const meta = core.paperWorkspace.list().find((paper) => paper.id === paperId);
  if (!meta) {
    throw new Error(`Paper workspace not found: ${paperId}`);
  }

  const notesPath = path.join(workspaceDir, 'notes.md');
  let notes = '';
  try { notes = fs.readFileSync(notesPath, 'utf-8'); } catch { /* notes.md may not exist yet */ }
  const cleanedNotes = stripReferenceSection(stripLeadingTitle(notes, meta.title)).trim();

  const agentsDir = path.join(workspaceDir, 'agents');
  const agentSummaries: string[] = [];
  let agentsDirEntries: fs.Dirent[] = [];
  try { agentsDirEntries = fs.readdirSync(agentsDir, { withFileTypes: true }); } catch { /* dir may not exist */ }
  for (const entry of agentsDirEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(agentsDir, entry.name);
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }
      if (entry.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content) as { messages?: Array<{ role?: string; content?: string }> };
          const messages = parsed.messages ?? [];
          const summarized = messages
            .slice(-12)
            .map((message) => `${message.role ?? 'unknown'}: ${(message.content ?? '').trim()}`)
            .filter(Boolean)
            .join('\n');
          if (summarized) {
            agentSummaries.push(`### ${path.basename(entry.name, '.json')}\n${summarized}`);
          }
        } catch {
          continue;
        }
      } else if (entry.name.endsWith('.jsonl')) {
        const items = readJsonlFile(filePath)
          .map((item) => JSON.stringify(item))
          .slice(-12)
          .join('\n');
        if (items) {
          agentSummaries.push(`### ${path.basename(entry.name, '.jsonl')}\n${items}`);
        }
      }
  }

  const markdownSections = [
    `# ${meta.title}`,
    '',
    cleanedNotes || '## Notes\n\nNo structured notes are available yet for this workspace.',
  ];

  if (agentSummaries.length > 0) {
    markdownSections.push('', '## Agent Trace', '', agentSummaries.join('\n\n'));
  }

  const markdown = markdownSections.join('\n').trim() + '\n';
  const sourceText = `${notes}\n\n${agentSummaries.join('\n\n')}`;
  const memoryEntries = readJsonlFile(path.join(workspaceDir, 'memory.jsonl'));
  const sourceCode = extractCodeArtifactsFromText(sourceText, sanitizeExportStem(meta.title));

  const existingVerifiedPath = path.join(workspaceDir, 'citations', 'verified-citations.json');
  let verifiedRecords: Array<{
    title?: string;
    authors?: string[];
    year?: string | number;
    journal?: string;
    doi?: string;
    arxivId?: string;
    url?: string;
    bibliographyEntry?: string;
    confidence: number;
    source: string;
  }> = [];

  try {
    verifiedRecords = JSON.parse(fs.readFileSync(existingVerifiedPath, 'utf-8')) as typeof verifiedRecords;
  } catch {
    verifiedRecords = [];
  }

  if (verifiedRecords.length === 0) {
    const verifier = new CitationVerifier();
    const candidates = extractCitationCandidatesFromText(sourceText);
    const results = await verifier.verifyBatch(candidates);
    verifiedRecords = results
      .filter((result) => result.valid)
      .map((result) => normalizeVerifiedRecord(result));
  }

  const bibliography = verifiedRecords.map((record, index) => {
    if (record.bibliographyEntry) {
      return record.bibliographyEntry.startsWith(`[${index + 1}]`)
        ? record.bibliographyEntry
        : `[${index + 1}] ${record.bibliographyEntry}`;
    }
    const verifier = new CitationVerifier();
    return verifier.formatCitation({
      title: record.title,
      authors: record.authors,
      year: record.year,
      journal: record.journal,
      doi: record.doi,
      arxivId: record.arxivId,
    }, 'GB/T 7714', index + 1);
  });

  const result = await exportPaperWorkspace({
    workspaceDir,
    title: meta.title,
    markdown,
    bibliography,
    citationRecords: verifiedRecords,
    rawData: {
      meta,
      notes,
      memoryEntries,
      exportedAt: new Date().toISOString(),
    },
    sourceCode,
    metadata: {
      paperId,
      exportedBy: 'repl.paper:export',
      workspaceDir,
    },
  });

  return {
    workspaceDir,
    markdownPath: result.markdownPath,
    docxPath: result.docxPath,
    bibliographyPath: result.bibliographyPath,
    manifestPath: result.manifestPath,
    evidenceManifestPath: result.evidenceManifestPath,
    strictValidationPath: result.strictValidationPath,
  };
}

export async function streamWithOrchestratorTUI(
  userMessage: string,
  state: REPLState,
  orchestrator: AgentOrchestrator,
  hookManager: HookManager,
  memManager: MemoryManager,
  paperWorkspace: PaperWorkspace,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const extraBlocks = [
    buildPaperContext(state, paperWorkspace),
    buildMemoryContext(memManager, userMessage),
  ].filter(Boolean);
  const extraSystemPrompt = extraBlocks.join('\n\n');

  try {
    await hookManager.trigger('pre-message', {
      agentId: orchestrator.getActiveAgent().id,
      message: userMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (hookErr) {
    console.warn('[REPL] pre-message hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
  }

  const response = await orchestrator.chat(
    userMessage,
    { onChunk, raw: true },
    {
      extraSystemPrompt: extraSystemPrompt || undefined,
      useSharedContext: true,
      persistConversation: true,
      signal,
    },
  );

  memManager.add({
    type: 'context',
    content: `User: ${userMessage}\nAssistant: ${response.slice(0, 800)}`,
    tags: ['chat', orchestrator.getActiveAgent().id, ...(state.activePaperId ? [state.activePaperId] : [])],
    source: 'repl',
    importance: state.activePaperId ? 4 : 3,
  });
  const extracted = [
    ...memManager.autoExtract(userMessage, 'repl:user'),
    ...memManager.autoExtract(response, `repl:${orchestrator.getActiveAgent().id}`),
  ];
  memManager.promoteReusableEntries(extracted);

  try {
    await hookManager.trigger('post-message', {
      agentId: orchestrator.getActiveAgent().id,
      message: userMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (hookErr) {
    console.warn('[REPL] post-message hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
  }

  return response;
}

export async function captureTerminalOutput<T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; output: string }> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const chunks: string[] = [];

  const captureWrite: typeof process.stdout.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | null) => void), cb?: (error?: Error | null) => void) => {
    if (typeof encoding === 'function') {
      encoding();
    } else if (cb) {
      cb();
    }
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf-8'));
    return true;
  }) as typeof process.stdout.write;

  process.stdout.write = captureWrite;
  process.stderr.write = captureWrite;

  try {
    const result = await fn();
    return {
      result,
      output: chunks.join('').replace(/\u001b\[[0-9;]*m/g, '').trim(),
    };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

function printHelp(): void {
  console.log(chalk.bold.cyan('\nTzukwan Commands\n'));
  console.log('  /help                 Show this help');
  console.log('  /setup                Run guided setup and reload provider/model');
  console.log('  /config               Show current config');
  console.log('  /model <id>           Switch active model');
  console.log('  /think [on|off]       Toggle think mode');
  console.log('  /compress             Compact agent/shared conversation history');
  console.log('  /agents               List available agents');
  console.log('  /agent <id>           Switch active agent');
  console.log('  /collaborate <task>   Run sequential multi-agent collaboration');
  console.log('  /search <query>       Search literature');
  console.log('  /dataset <query>      Search datasets');
  console.log('  /paper:new <title>    Create and open a paper workspace');
  console.log('  /paper:list           List paper workspaces');
  console.log('  /paper:open <id>      Open a paper workspace');
  console.log('  /paper:notes [text]   Show or append notes for the active workspace');
  console.log('  /paper:export [id]    Export the workspace to markdown/docx via unified exporter');
  console.log('  /tools                List active tools');
  console.log('  /permissions          Show permission status');
  console.log('  /mcp                  Show configured MCP servers');
  console.log('  /exit                 Exit the session\n');
}

export async function handleSlashCommand(
  input: string,
  state: REPLState,
  config: Config,
  core: CLIRuntime | null,
): Promise<CommandResult> {
  const { command, rest } = splitCommand(input);

  switch (command) {
    case '/help':
      printHelp();
      return 'handled';
    case '/clear':
      process.stdout.write('\x1b[2J\x1b[0f');
      state.conversationHistory = [];
      return 'handled';
    case '/history': {
      if (state.conversationHistory.length === 0) {
        displayInfo('No conversation history yet.');
        return 'handled';
      }
      const lines = state.conversationHistory.map((message, index) => {
        const contentStr = Array.isArray(message.content)
          ? message.content.map((p: unknown) => (typeof p === 'object' && p !== null && 'text' in p ? (p as { text: string }).text : '')).join(' ')
          : String(message.content ?? '');
        return `${index + 1}. ${message.role}: ${contentStr.slice(0, 240)}`;
      });
      console.log(lines.join('\n'));
      return 'handled';
    }
    case '/compress':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      {
        const reports = core.orchestrator.compressConversations();
        const totalBefore = reports.reduce((sum, report) => sum + report.beforeMessages, 0);
        const totalAfter = reports.reduce((sum, report) => sum + report.afterMessages, 0);
        displaySuccess(`Conversation history compacted: ${totalBefore} -> ${totalAfter} messages across ${reports.length} agents.`);
      }
      return 'handled';
    case '/reset':
      state.conversationHistory = [];
      core?.orchestrator.resetAllConversations();
      core?.orchestrator.saveConversations();
      displaySuccess('Conversation history cleared.');
      return 'handled';
    case '/config':
      if (rest === 'routing' || rest === 'routing show') {
        const routing = getRoutingConfig();
        if (!routing) displayInfo('No routing model configured.');
        else displayInfo(`Routing model: ${routing.model} @ ${routing.baseUrl}`);
        return 'handled';
      }
      if (rest === 'routing test') {
        const routing = getRoutingConfig();
        if (!routing) {
          displayError('No routing model configured.');
          return 'handled';
        }
        const result = await testRoutingConnection(routing);
        if (result.success) displaySuccess('Routing model connection test passed.');
        else displayError(`Routing model connection test failed: ${result.error}`);
        return 'handled';
      }
      if (rest.startsWith('routing set ')) {
        const [, , key, ...valueParts] = rest.split(/\s+/);
        const value = valueParts.join(' ').trim();
        if (!key || !value) {
          displayError('Usage: /config routing set <base_url|api_key|model> <value>');
          return 'handled';
        }
        const routing = getRoutingConfig() ?? {
          provider: 'custom',
          baseUrl: '',
          apiKey: '',
          model: '',
        };
        const keyMap: Record<string, keyof typeof routing> = {
          base_url: 'baseUrl',
          api_key: 'apiKey',
          model: 'model',
        };
        if (!keyMap[key]) {
          displayError('Usage: /config routing set <base_url|api_key|model> <value>');
          return 'handled';
        }
        (routing as unknown as Record<string, string>)[keyMap[key] as string] = value;
        routing.provider = inferProviderFromBaseUrl(routing.baseUrl);
        saveRoutingConfig(routing);
        resetRuntimeCache();
        displaySuccess(`Set routing ${key} = ${key === 'api_key' ? '***' : value}`);
        return 'handled';
      }
      if (!rest || rest === 'show') {
        await configShow();
        return 'handled';
      }
      if (rest === 'test') {
        const result = await testConfigConnection(config);
        if (result.success) displaySuccess('LLM connection test passed.');
        else displayError(`LLM connection test failed: ${result.error}`);
        return 'handled';
      }
      if (rest.startsWith('set ')) {
        const [, key, ...valueParts] = rest.split(/\s+/);
        const value = valueParts.join(' ').trim();
        if (!key || !value) {
          displayError('Usage: /config set <base_url|api_key|model> <value>');
          return 'handled';
        }
        await configSet(key, value);
        if (key === 'base_url') config.baseUrl = value;
        if (key === 'api_key') config.apiKey = value;
        if (key === 'model') config.model = value;
        config.provider = inferProviderFromBaseUrl(config.baseUrl);
        persistRuntimeConfig(config);
        resetRuntimeCache();
        return 'handled';
      }
      displayInfo('Use /config show|test|set ... and /config routing show|test|set ...');
      return 'handled';
    case '/model':
      if (!rest) {
        displayInfo(`Current model: ${config.model}`);
        return 'handled';
      }
      config.model = rest;
      persistRuntimeConfig(config);
      resetRuntimeCache();
      displaySuccess(`Model switched to ${rest}`);
      return 'handled';
    case '/think': {
      const next = rest ? /^(on|true|1)$/i.test(rest) : !(config.think !== false);
      config.think = next;
      state.thinkMode = next;
      core?.orchestrator.setThinkMode(next);
      persistRuntimeConfig(config);
      displaySuccess(`Think mode ${next ? 'enabled' : 'disabled'}`);
      return 'handled';
    }
    case '/agents': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      for (const agent of core.orchestrator.getAgents()) {
        const marker = agent.id === core.orchestrator.getActiveAgent().id ? '*' : ' ';
        console.log(`${marker} ${agent.emoji} ${agent.name} (${agent.id}) - ${agent.role}`);
      }
      return 'handled';
    }
    case '/agent':
    case '/chat': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        const active = core.orchestrator.getActiveAgent();
        displayInfo(`Active agent: ${active.name} (${active.id})`);
        return 'handled';
      }
      if (!core.orchestrator.setActiveAgent(rest)) {
        displayError(`Unknown agent: ${rest}`);
        return 'handled';
      }
      state.currentAgent = rest;
      displaySuccess(`Switched to agent ${rest}`);
      return 'handled';
    }
    case '/collaborate': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        displayError('Usage: /collaborate <task>');
        return 'handled';
      }
      const result = await core.orchestrator.collaborate(rest, undefined, (update) => process.stdout.write(update));
      console.log(`\n${result.synthesis}\n`);
      return 'handled';
    }
    case '/skills': {
      if (!rest || rest === 'list') {
        await skillsList();
        return 'handled';
      }
      const [subcommand, ...valueParts] = rest.split(/\s+/);
      const value = valueParts.join(' ').trim();
      if (subcommand === 'install' && value) {
        await skillsInstall(value);
        resetRuntimeCache();
        return 'reload-runtime';
      }
      if (subcommand === 'update' && value) {
        await skillsUpdate(value);
        resetRuntimeCache();
        return 'reload-runtime';
      }
      if (subcommand === 'uninstall' && value) {
        await skillsUninstall(value);
        resetRuntimeCache();
        return 'reload-runtime';
      }
      if (subcommand === 'refresh') {
        resetRuntimeCache();
        displaySuccess('Skills reloaded.');
        return 'reload-runtime';
      }
      displayInfo('Usage: /skills [list|install <source>|update <name>|uninstall <name>|refresh]');
      return 'handled';
    }
    case '/search':
      {
      const parsed = parseSearchArgs(rest);
      if (!parsed.query) {
        displayError('Usage: /search [--source <all|arxiv|pubmed|semantic-scholar|openalex>] [--limit <n>] <query>');
        return 'handled';
      }
      await searchLiteratureCmd(parsed.query, {
        ...(parsed.source ? { source: parsed.source } : {}),
        ...(parsed.limit ? { limit: parsed.limit } : {}),
      });
      return 'handled';
      }
    case '/dataset':
      if (!rest) {
        displayError('Usage: /dataset <query>');
        return 'handled';
      }
      await searchDatasetsCmd(rest, {});
      return 'handled';
    case '/paper:new': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      const title = rest || `Untitled Paper ${new Date().toISOString()}`;
      const id = `${sanitizeExportStem(title)}_${Date.now()}`;
      core.paperWorkspace.create(id, title, { source: 'manual' });
      await activatePaperWorkspace(id, state, core);
      displaySuccess(`Paper workspace created: ${id}`);
      return 'handled';
    }
    case '/paper:open': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        displayError('Usage: /paper:open <paperId>');
        return 'handled';
      }
      await activatePaperWorkspace(rest, state, core);
      displaySuccess(`Opened paper workspace: ${rest}`);
      return 'handled';
    }
    case '/paper:close':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!state.activePaperId) {
        displayInfo('No active paper workspace.');
        return 'handled';
      }
      deactivatePaperWorkspace(state, core);
      displaySuccess('Closed active paper workspace.');
      return 'handled';
    case '/paper:list':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (core.paperWorkspace.list().length === 0) {
        displayInfo('No paper workspaces found.');
        return 'handled';
      }
      for (const paper of core.paperWorkspace.list()) {
        const marker = paper.id === state.activePaperId ? '*' : ' ';
        console.log(`${marker} ${paper.id} | ${paper.title} | ${paper.lastAccessedAt}`);
      }
      return 'handled';
    case '/paper:notes':
      if (!core || !state.activePaperId) {
        displayError('Open a paper workspace first.');
        return 'handled';
      }
      if (!rest) {
        displayResult(core.paperWorkspace.getNotes(state.activePaperId));
        return 'handled';
      }
      core.paperWorkspace.updateNotes(
        state.activePaperId,
        `${core.paperWorkspace.getNotes(state.activePaperId).trimEnd()}\n\n${rest}\n`,
      );
      displaySuccess('Paper notes updated.');
      return 'handled';
    case '/paper:agents':
      if (!core || !state.activePaperId) {
        displayError('Open a paper workspace first.');
        return 'handled';
      }
      for (const agent of core.paperWorkspace.getAgentEnsemble(state.activePaperId)) {
        console.log(`${agent.emoji} ${agent.name} (${agent.agentId}) - ${agent.role}`);
      }
      return 'handled';
    case '/paper:delete':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        displayError('Usage: /paper:delete <paperId>');
        return 'handled';
      }
      if (!core.paperWorkspace.delete(rest)) {
        displayError(`Paper workspace not found: ${rest}`);
        return 'handled';
      }
      if (state.activePaperId === rest) {
        deactivatePaperWorkspace(state, core);
      }
      displaySuccess(`Deleted paper workspace: ${rest}`);
      return 'handled';
    case '/paper:export': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      const paperId = rest || state.activePaperId;
      if (!paperId) {
        displayError('Usage: /paper:export <paperId> or open a paper workspace first.');
        return 'handled';
      }
      try {
        const exported = await exportPaperWorkspaceBundle(paperId, core);
        console.log(chalk.bold.green('\nPaper workspace exported\n'));
        console.log(`  Workspace: ${exported.workspaceDir}`);
        console.log(`  Markdown:  ${exported.markdownPath}`);
        console.log(`  DOCX:      ${exported.docxPath}`);
        console.log(`  Refs:      ${exported.bibliographyPath}`);
        console.log(`  Manifest:  ${exported.manifestPath}\n`);
        if (exported.evidenceManifestPath) {
          console.log(`  Evidence:  ${exported.evidenceManifestPath}`);
        }
        if (exported.strictValidationPath) {
          console.log(`  Strict:    ${exported.strictValidationPath}`);
        }
        console.log('');
      } catch (err) {
        displayError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return 'handled';
    }
    case '/tools':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      for (const tool of core.orchestrator.getToolRegistry().listTools()) {
        console.log(`${tool.name} - ${tool.description}`);
      }
      return 'handled';
    case '/permissions': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        for (const permission of core.permManager.list()) {
          console.log(`${permission.allowed ? 'allow' : 'deny '} ${permission.name} - ${permission.description}`);
        }
        return 'handled';
      }
      const [subcommand, name] = rest.split(/\s+/, 2);
      if (!name) {
        displayInfo('Usage: /permissions [allow|deny] <name>');
        return 'handled';
      }
      if (subcommand === 'allow') {
        core.permManager.allow(name);
        displaySuccess(`Allowed permission: ${name}`);
      } else if (subcommand === 'deny') {
        core.permManager.deny(name);
        displaySuccess(`Denied permission: ${name}`);
      } else {
        displayInfo('Usage: /permissions [allow|deny] <name>');
      }
      return 'handled';
    }
    case '/mcp': {
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        for (const server of core.mcpManager.listServers()) {
          console.log(`${server.enabled ? 'on ' : 'off'} ${server.name} (${server.type}) ${server.description ?? ''}`.trim());
        }
        return 'handled';
      }
      const [subcommand, name] = rest.split(/\s+/, 2);
      if (subcommand === 'refresh') {
        resetRuntimeCache();
        displaySuccess('MCP registry reloaded.');
        return 'reload-runtime';
      }
      if (subcommand === 'add') {
        const parts = rest.split(/\s+/).slice(1);
        const mcpName = parts.shift();
        const command = parts.shift();
        if (!mcpName || !command) {
          displayInfo('Usage: /mcp add <name> <command> [args...]');
          return 'handled';
        }
        core.mcpManager.addServer({
          name: mcpName,
          command,
          args: parts,
          description: '',
          enabled: true,
          type: 'stdio',
          installedAt: new Date().toISOString(),
        });
        resetRuntimeCache();
        displaySuccess(`Added MCP server: ${mcpName}`);
        return 'reload-runtime';
      }
      if (!name) {
        displayInfo('Usage: /mcp [enable|disable|remove|add|refresh] <server>');
        return 'handled';
      }
      if (subcommand === 'enable') {
        core.mcpManager.setEnabled(name, true);
        resetRuntimeCache();
        displaySuccess(`Enabled MCP server: ${name}`);
        return 'reload-runtime';
      } else if (subcommand === 'disable') {
        core.mcpManager.setEnabled(name, false);
        resetRuntimeCache();
        displaySuccess(`Disabled MCP server: ${name}`);
        return 'reload-runtime';
      } else if (subcommand === 'remove') {
        if (!core.mcpManager.removeServer(name)) {
          displayError(`MCP server not found: ${name}`);
          return 'handled';
        }
        resetRuntimeCache();
        displaySuccess(`Removed MCP server: ${name}`);
        return 'reload-runtime';
      } else {
        displayInfo('Usage: /mcp [enable|disable|remove|add|refresh] <server>');
      }
      return 'handled';
    }
    case '/loop':
    case '/loops':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      for (const loop of core.loopManager.list()) {
        console.log(`${loop.active ? 'on ' : 'off'} ${loop.id} | ${loop.name} | every ${loop.intervalMs} ms | ${loop.command}`);
      }
      return 'handled';
    case '/stop':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      if (!rest) {
        displayError('Usage: /stop <loopId>');
        return 'handled';
      }
      if (!core.loopManager.stop(rest)) {
        displayError(`Loop not found: ${rest}`);
        return 'handled';
      }
      displaySuccess(`Stopped loop: ${rest}`);
      return 'handled';
    case '/hook':
    case '/hooks':
      if (!core) {
        displayError('Runtime is unavailable.');
        return 'handled';
      }
      for (const hook of core.hookManager.list()) {
        console.log(`${hook.enabled ? 'on ' : 'off'} ${hook.id} | ${hook.event} | ${hook.description}`);
      }
      return 'handled';
    case '/setup': {
      const nextConfig = await runSetupWizard();
      Object.assign(config, nextConfig);
      persistRuntimeConfig(config);
      resetRuntimeCache();
      displaySuccess('Setup completed and runtime cache cleared.');
      return 'handled';
    }
    case '/profile:edit':
      displayInfo('Profile editing is handled by the setup wizard in this build. Run /setup.');
      return 'handled';
    case '/approve': {
      if (!rest) {
        displayInfo(`Current approval mode: ${state.approvalMode}`);
        displayInfo('Usage: /approve [suggest|auto|full]');
        displayInfo('  suggest - Confirm all tool calls (default)');
        displayInfo('  auto    - Auto-approve read-only tools, confirm writes');
        displayInfo('  full    - Auto-approve all tool calls');
        return 'handled';
      }
      const mode = rest.toLowerCase().trim() as ApprovalMode;
      if (!['suggest', 'auto', 'full'].includes(mode)) {
        displayError(`Invalid approval mode: ${rest}`);
        displayInfo('Valid modes: suggest, auto, full');
        return 'handled';
      }
      state.approvalMode = mode;
      displaySuccess(`Approval mode set to: ${mode}`);
      return 'handled';
    }
    case '/exit':
    case '/quit':
      return 'exit';
    default:
      displayError(`Unknown command: ${command}`);
      return 'handled';
  }
}

export async function executeSinglePrompt(prompt: string, config: Config, model?: string): Promise<void> {
  const effectiveConfig = model ? { ...config, model } : { ...config };

  if (prompt.startsWith('/')) {
    const core = await loadCore(effectiveConfig);
    const state: REPLState = {
      conversationHistory: [],
      multiLineBuffer: '',
      isMultiLine: false,
      currentAgent: 'advisor',
      agentMode: false,
      thinkMode: effectiveConfig.think !== false,
      sessionName: `session_${Date.now()}`,
      sessionStart: new Date(),
      activePaperId: null,
      activeTaskId: null,
      approvalMode: 'suggest',
    };
    await handleSlashCommand(prompt, state, effectiveConfig, core);
    core?.mcpManager.stopAll();
    return;
  }

  const core = await loadCore(effectiveConfig);
  if (!core) {
    process.exitCode = 1;
    return;
  }

  const state: REPLState = {
    conversationHistory: [],
    multiLineBuffer: '',
    isMultiLine: false,
    currentAgent: 'advisor',
    agentMode: false,
    thinkMode: effectiveConfig.think !== false,
    sessionName: `session_${Date.now()}`,
    sessionStart: new Date(),
    activePaperId: null,
    activeTaskId: null,
    approvalMode: 'suggest',
  };

  const response = await streamWithOrchestratorTUI(
    prompt,
    state,
    core.orchestrator,
    core.hookManager,
    core.memManager,
    core.paperWorkspace,
    (chunk) => process.stdout.write(chunk),
  );

  if (!response.endsWith('\n')) {
    process.stdout.write('\n');
  }
  core.orchestrator.saveConversations();
  core.mcpManager.stopAll();
}

export async function startRepl(): Promise<void> {
  const config = await ensureConfig();
  let core = await loadCore(config);
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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  printHelp();

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve, reject) => {
      rl.question(prompt, resolve);
      rl.once('close', () => reject(new Error('REPL closed')));
    });

  // Handle SIGINT (Ctrl+C) gracefully
  let running = true;
  process.once('SIGINT', () => {
    console.log('\n' + chalk.gray('Use /exit to quit.'));
    // Re-register so the user can Ctrl+C twice to force exit
    process.once('SIGINT', () => {
      console.log(chalk.gray('\nForce quitting...'));
      rl.close();
      core?.mcpManager.stopAll();
      process.exit(0);
    });
  });

  while (running) {
    let line: string;
    try {
      line = await question(chalk.cyan('tzukwan > '));
    } catch {
      // readline closed (e.g. piped input exhausted or SIGINT)
      break;
    }
    try {
      const text = line.trim();
      if (!text) continue;
      if (text.startsWith('/')) {
        const result = await handleSlashCommand(text, state, config, core);
        if (result === 'exit') {
          rl.close();
          core?.mcpManager.stopAll();
          running = false;
          continue;
        }
        if (result === 'reload-runtime') {
          core = await loadCore(config);
          continue;
        }
      } else if (core) {
        const response = await streamWithOrchestratorTUI(
          text,
          state,
          core.orchestrator,
          core.hookManager,
          core.memManager,
          core.paperWorkspace,
          (chunk) => process.stdout.write(chunk),
        );
        if (!response.endsWith('\n')) {
          process.stdout.write('\n');
        }
      } else {
        displayError('Runtime is unavailable. Run /setup.');
      }
    } catch (error) {
      displayError(error instanceof Error ? error.message : String(error));
    }
  }
}

export { normalizeApiKey, normalizeProvider };
