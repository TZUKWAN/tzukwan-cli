import {
  AgentOrchestrator,
  BUILTIN_AGENTS,
  ConfigLoader,
  HookManager,
  LLMClient,
  LoopManager,
  MCPManager,
  MemoryManager,
  PaperWorkspace,
  PermissionManager,
  SelfEvolution,
  TelegramBridge,
  ToolRegistry,
  UserProfileManager,
  type AgentDefinition,
  type Tool as CoreTool,
  type TzukwanConfig,
} from '@tzukwan/core';
import { SkillRegistry } from '@tzukwan/skills';
import type { Config } from '../commands/config.js';
import { normalizeApiKey, normalizeProvider } from './provider-utils.js';

export interface RuntimeWarning {
  source: 'mcp' | 'skills';
  message: string;
}

export interface CLIRuntime {
  orchestrator: AgentOrchestrator;
  hookManager: HookManager;
  loopManager: LoopManager;
  permManager: PermissionManager;
  memManager: MemoryManager;
  paperWorkspace: PaperWorkspace;
  mcpManager: MCPManager;
  selfEvolution: SelfEvolution;
  telegramBridge: TelegramBridge;
  warnings: RuntimeWarning[];
}

let cachedRuntime: CLIRuntime | null = null;

function cloneAgent(agent: AgentDefinition): AgentDefinition {
  return {
    ...agent,
    capabilities: [...agent.capabilities],
    tools: [...agent.tools],
  };
}

function buildConfigRulesAddendum(config: TzukwanConfig): string {
  const lines: string[] = [];

  lines.push('\n\n## Project Rules From TZUKWAN.md');
  lines.push(`- Default output language: ${config.research.defaultLanguage}`);
  lines.push(`- Citation style: ${config.research.citationStyle}`);
  if (config.research.preferredSources.length > 0) {
    lines.push(`- Preferred sources: ${config.research.preferredSources.join(', ')}`);
  }
  if (config.research.datasetCategories.length > 0) {
    lines.push(`- Preferred dataset categories: ${config.research.datasetCategories.join(', ')}`);
  }
  if (config.rules.length > 0) {
    for (const rule of config.rules) {
      lines.push(`- ${rule}`);
    }
  }

  return lines.join('\n');
}

function buildProfiledAgents(config: TzukwanConfig): AgentDefinition[] {
  const profileManager = new UserProfileManager();
  const addendum = profileManager.buildSystemPromptAddendum();
  const configAddendum = buildConfigRulesAddendum(config);
  const mergedAddendum = `${configAddendum}${addendum}`;
  const overrides = profileManager.buildPersonalizedConfig() as Record<string, {
    temperature?: number;
    maxTokens?: number;
  }>;

  return BUILTIN_AGENTS.map((agent) => {
    const override = overrides[agent.id];
    return {
      ...cloneAgent(agent),
      systemPrompt: mergedAddendum ? `${agent.systemPrompt}${mergedAddendum}` : agent.systemPrompt,
      temperature: override?.temperature ?? agent.temperature,
      maxTokens: override?.maxTokens ?? agent.maxTokens,
    };
  });
}

function buildSkillContextLLM(config: Config) {
  const skillLLMClient = new LLMClient({
    provider: normalizeProvider(config.provider),
    baseUrl: config.baseUrl,
    apiKey: normalizeApiKey(config.provider, config.apiKey),
    model: config.model,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 8192,
  });

  return {
    chat: async (messages: { role: string; content: string }[], options?: Record<string, unknown>) =>
      skillLLMClient.chat(messages as never, options as never),
    chatStream: async (
      messages: { role: string; content: string }[],
      onChunk: (chunk: string) => void,
      options?: Record<string, unknown>,
    ) => skillLLMClient.chatStream(messages as never, onChunk, options as never),
    isAvailable: async () => skillLLMClient.isAvailable(),
  };
}

async function registerMCPTools(
  orchestrator: AgentOrchestrator,
  mcpManager: MCPManager,
): Promise<number> {
  const nameCount = new Map<string, number>();
  const tools = mcpManager.getAllTools().map<CoreTool>((tool) => {
    const baseName = `mcp_${tool.serverName}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const count = nameCount.get(baseName) ?? 0;
    nameCount.set(baseName, count + 1);
    // If collision, append suffix _2, _3, etc.
    const name = count === 0 ? baseName : `${baseName}_${count + 1}`;
    return {
      name,
      description: `${tool.description || tool.name} (MCP: ${tool.serverName})`,
      parameters: tool.parameters ?? { type: 'object', properties: {} },
      execute: async (args) => mcpManager.callTool(tool.serverName, tool.name, args),
    };
  });

  orchestrator.registerExternalTools(tools, { exposeToAllAgents: true });
  return tools.length;
}

async function registerSkillTools(
  orchestrator: AgentOrchestrator,
  config: Config,
  cwd: string,
): Promise<RuntimeWarning[]> {
  const warnings: RuntimeWarning[] = [];
  const registry = SkillRegistry.getInstance();
  registry.clear();
  await registry.initializeDefault(cwd);

  const loadedSkills = registry.list();
  if (loadedSkills.length === 0) return warnings;

  const mergedConfig = await new ConfigLoader().loadConfig(cwd) as TzukwanConfig;
  const skillContextLLM = buildSkillContextLLM(config);
  const tools = loadedSkills.flatMap((skill) =>
    skill.commands.map<CoreTool>((command) => ({
      name: `skill_${skill.name}_${command.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: `${command.description} (skill: ${skill.name})`,
      parameters: { type: 'object', properties: {}, additionalProperties: true },
      execute: async (args) => command.execute(args, {
        llmClient: skillContextLLM,
        config: mergedConfig,
        workDir: cwd,
      }),
    })),
  );

  orchestrator.registerExternalTools(tools, { exposeToAllAgents: true });

  return warnings;
}

async function registerManagementTools(
  orchestrator: AgentOrchestrator,
  config: Config,
  cwd: string,
  mcpManager: MCPManager,
): Promise<void> {
  const tools: CoreTool[] = [
    {
      name: 'install_skill',
      description: 'Install a skill from a URL or local path, then refresh the runtime skill registry.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Skill source URL, Git URL, or local path.' },
        },
        required: ['source'],
      },
      execute: async (args) => {
        const source = String(args.source ?? '').trim();
        if (!source) {
          throw new Error('source is required');
        }
        const skillsModule = await import('@tzukwan/skills');
        await skillsModule.installOrUpdateSkill(source);
        await registerSkillTools(orchestrator, config, cwd);
        return { installed: true, source };
      },
    },
    {
      name: 'update_skill',
      description: 'Update an installed skill by name or source, then refresh the runtime skill registry.',
      parameters: {
        type: 'object',
        properties: {
          sourceOrName: { type: 'string', description: 'Installed skill name or original install source.' },
        },
        required: ['sourceOrName'],
      },
      execute: async (args) => {
        const sourceOrName = String(args.sourceOrName ?? '').trim();
        if (!sourceOrName) {
          throw new Error('sourceOrName is required');
        }
        const skillsModule = await import('@tzukwan/skills');
        await skillsModule.updateSkill(sourceOrName);
        await registerSkillTools(orchestrator, config, cwd);
        return { updated: true, sourceOrName };
      },
    },
    {
      name: 'install_mcp_server',
      description: 'Register an MCP stdio server, optionally enable it, then refresh MCP tools.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'MCP server name.' },
          command: { type: 'string', description: 'Executable command to launch the MCP server.' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command-line args.' },
          description: { type: 'string', description: 'Human-readable description.' },
          enabled: { type: 'boolean', description: 'Whether to enable and start immediately.' },
        },
        required: ['name', 'command'],
      },
      execute: async (args) => {
        const name = String(args.name ?? '').trim();
        const command = String(args.command ?? '').trim();
        if (!name || !command) {
          throw new Error('name and command are required');
        }
        mcpManager.addServer({
          name,
          command,
          args: Array.isArray(args.args) ? args.args.map((arg) => String(arg)) : [],
          description: args.description ? String(args.description) : '',
          enabled: args.enabled !== false,
          type: 'stdio',
          installedAt: new Date().toISOString(),
        });
        if (args.enabled !== false) {
          await mcpManager.startServer(name);
          await registerMCPTools(orchestrator, mcpManager);
        }
        return { installed: true, name, enabled: args.enabled !== false };
      },
    },
    {
      name: 'update_mcp_server',
      description: 'Update an existing MCP server config and refresh tools if enabled.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Existing MCP server name.' },
          command: { type: 'string', description: 'Updated executable command.' },
          args: { type: 'array', items: { type: 'string' }, description: 'Updated command-line args.' },
          description: { type: 'string', description: 'Updated description.' },
          enabled: { type: 'boolean', description: 'Updated enabled state.' },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = String(args.name ?? '').trim();
        if (!name) {
          throw new Error('name is required');
        }
        const updated = mcpManager.updateServer(name, {
          ...(args.command ? { command: String(args.command) } : {}),
          ...(Array.isArray(args.args) ? { args: args.args.map((arg) => String(arg)) } : {}),
          ...(args.description ? { description: String(args.description) } : {}),
          ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
        });
        if (!updated) {
          throw new Error(`MCP server not found: ${name}`);
        }
        if (typeof args.enabled !== 'boolean' || args.enabled) {
          await mcpManager.startServer(name);
          await registerMCPTools(orchestrator, mcpManager);
        }
        return { updated: true, name };
      },
    },
  ];

  orchestrator.registerExternalTools(tools, { exposeToAllAgents: true });
}

async function startEnabledMCPServers(mcpManager: MCPManager): Promise<RuntimeWarning[]> {
  const warnings: RuntimeWarning[] = [];
  const enabledServers = mcpManager.listServers().filter((server) => server.enabled);
  const startupTimeoutMs = 15000;

  await Promise.all(enabledServers.map(async (server) => {
    try {
      await Promise.race([
        mcpManager.startServer(server.name),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`startup timed out after ${startupTimeoutMs}ms`)), startupTimeoutMs);
        }),
      ]);
    } catch (error) {
      try { mcpManager.stopServer(server.name); } catch { /* ignore cleanup errors */ }
      warnings.push({
        source: 'mcp',
        message: `Failed to start MCP server "${server.name}": ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }));

  return warnings;
}

function createRuntime(config: Config, mergedConfig: TzukwanConfig): CLIRuntime {
  const llmClient = new LLMClient({
    provider: normalizeProvider(config.provider),
    baseUrl: config.baseUrl,
    apiKey: normalizeApiKey(config.provider, config.apiKey),
    model: config.model,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 8192,
  });

  const routerClient = mergedConfig.routing
    ? new LLMClient({
        provider: mergedConfig.routing.provider,
        baseUrl: mergedConfig.routing.baseUrl,
        apiKey: mergedConfig.routing.apiKey,
        model: mergedConfig.routing.model,
        temperature: mergedConfig.routing.temperature ?? 0.1,
        maxTokens: mergedConfig.routing.maxTokens ?? 512,
        timeout: mergedConfig.routing.timeout ?? 30000,
      })
    : null;

  const orchestrator = new AgentOrchestrator(
    llmClient,
    buildProfiledAgents(mergedConfig),
    config.think !== false,
    undefined,
    routerClient,
  );
  const hookManager = new HookManager();
  const loopManager = new LoopManager();
  const permManager = new PermissionManager();
  const memManager = new MemoryManager();
  const paperWorkspace = new PaperWorkspace();
  const mcpManager = new MCPManager();
  const selfEvolution = new SelfEvolution();
  const telegramBridge = new TelegramBridge();

  orchestrator.setPermissionManager(permManager);
  (orchestrator.getToolRegistry() as ToolRegistry).setHookManager(hookManager);

  return {
    orchestrator,
    hookManager,
    loopManager,
    permManager,
    memManager,
    paperWorkspace,
    mcpManager,
    selfEvolution,
    telegramBridge,
    warnings: [],
  };
}

export function resetRuntimeCache(): void {
  const runtime = cachedRuntime;
  cachedRuntime = null;
  if (runtime) {
    try { runtime.orchestrator.saveConversations(); } catch { /* ignore cleanup errors */ }
    try { runtime.mcpManager.stopAll(); } catch { /* ignore cleanup errors */ }
  }
}

export async function loadCLIRuntime(
  config: Config,
  options?: { useCache?: boolean; cwd?: string },
): Promise<CLIRuntime> {
  if (options?.useCache !== false && cachedRuntime) {
    return cachedRuntime;
  }

  const cwd = options?.cwd ?? process.cwd();
  const mergedConfig = await new ConfigLoader().loadConfig(cwd) as TzukwanConfig;
  const runtime = createRuntime(config, mergedConfig);
  const warnings = await startEnabledMCPServers(runtime.mcpManager);
  try {
    await registerMCPTools(runtime.orchestrator, runtime.mcpManager);
  } catch (error) {
    warnings.push({
      source: 'mcp',
      message: `Failed to register MCP tools: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  try {
    warnings.push(...await registerSkillTools(runtime.orchestrator, config, cwd));
  } catch (error) {
    warnings.push({
      source: 'skills',
      message: `Failed to register skills: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  try {
    await registerManagementTools(runtime.orchestrator, config, cwd, runtime.mcpManager);
  } catch (error) {
    warnings.push({
      source: 'skills',
      message: `Failed to register management tools: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  runtime.warnings = warnings;

  if (options?.useCache !== false) {
    cachedRuntime = runtime;
  }

  return runtime;
}
