// Core types
export type {
  LLMProvider,
  LLMConfig,
  ResearchConfig,
  PermissionsConfig,
  CompressionConfig,
  TzukwanConfig,
  Message,
  ChatOptions,
  ChatResponse,
  Tool,
  ToolResult,
  Session,
} from './types.js';

// Smart conversation compression
export {
  compressConversationSegment,
  shouldCompress,
  DEFAULT_COMPRESSION_CONFIG,
} from './compression.js';
export type { ConversationSummary, CompressionResult } from './compression.js';

// LLM Client
export { LLMClient, LLMAPIError, LLMNetworkError, LLMTimeoutError } from './llm-client.js';

// Model configuration
export {
  KNOWN_MODELS,
  DEFAULT_MODEL_CONFIG,
  getModelConfig,
  getContextWindow,
  deriveResponseTokenBudget,
  supportsContextSize,
  getModelDescription,
} from './model-config.js';
export type { ModelConfig } from './model-config.js';

// Configuration
export { ConfigLoader } from './config.js';

// Session management
export { SessionManager } from './session.js';

// Tools
export { ToolRegistry, builtInTools, createToolRegistry } from './tools.js';

// Context builder
export { ContextBuilder } from './context.js';

// Agent system
export { AgentOrchestrator, BUILTIN_AGENTS, setAgentCommListener, logAgentComm, setAgentRuntimeListener, getAgentRuntimeStates } from './agents.js';
export type {
  AgentDefinition,
  AgentConversation,
  CollaborationResult,
  ConversationCompressionReport,
  AgentCommEvent,
  AgentCommListener,
  AgentRuntimeEvent,
  AgentRuntimeListener,
  AgentRuntimeState,
  AgentRuntimeStatus,
} from './agents.js';

// Hooks
export { HookManager } from './hooks.js';
export type { Hook, HookEvent, HookContext } from './hooks.js';

// Loops
export { LoopManager } from './loops.js';
export type { LoopDefinition, LoopTickCallback } from './loops.js';

// Permissions
export { PermissionManager } from './permissions.js';
export type { Permission } from './permissions.js';

// Memory system
export { MemoryManager } from './memory.js';
export type { MemoryEntry, MemorySearchResult, MemoryType } from './memory.js';

// User profile
export { UserProfileManager } from './user-profile.js';
export type { UserProfile } from './user-profile.js';

// Paper workspace
export { PaperWorkspace } from './paper-workspace.js';
export type { PaperMeta, PaperAgentConfig } from './paper-workspace.js';

// MCP server manager
export { MCPManager } from './mcp-client.js';
export type { MCPServerConfig, MCPTool } from './mcp-client.js';

// Self-evolution / learning system
export { SelfEvolution } from './self-evolution.js';
export type { ErrorRecord, UsagePattern } from './self-evolution.js';

// Telegram bridge
export { TelegramBridge } from './telegram-bridge.js';
export type { TelegramConfig, TelegramMessage } from './telegram-bridge.js';

// QQ bridge
export { QQBridge } from './qq-bridge.js';
export type { QQBridgeConfig, QQMessage, SessionContext } from './qq-bridge.js';

// Frontier observer
export { FrontierObserver } from './frontier-observer.js';
export type { FrontierEntry, FrontierReport } from './frontier-observer.js';

// Grant writer
export { GrantWriter } from './grant-writer.js';
export type { GrantProposal, GrantType, GrantSection, BudgetPlan, BudgetItem } from './grant-writer.js';
