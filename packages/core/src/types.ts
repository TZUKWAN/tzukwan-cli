/**
 * Supported LLM provider identifiers.
 * This client communicates exclusively via the OpenAI-compatible REST API.
 * Only providers that expose an OpenAI-compatible endpoint are supported:
 *   - 'openai'  : OpenAI (api.openai.com/v1)
 *   - 'gemini'  : Google Gemini via its OpenAI-compatible gateway
 *   - 'custom'  : Any other OpenAI-compatible endpoint (DeepSeek, Groq, Ollama, etc.)
 * NOTE: Native Anthropic API is NOT supported — use an OpenAI-compatible proxy
 * or set provider to 'custom' with an appropriate baseUrl if needed.
 */
export type LLMProvider = 'openai' | 'gemini' | 'custom';

/**
 * Configuration for connecting to an LLM provider.
 */
export interface LLMConfig {
  /** Provider identifier */
  provider: LLMProvider;
  /** API key for authentication */
  apiKey: string;
  /**
   * Base URL for the provider's API endpoint.
   * Examples:
   *   OpenAI:   <YOUR_OPENAI_BASE_URL>
   *   DeepSeek: <YOUR_DEEPSEEK_BASE_URL>
   *   Moonshot: <YOUR_MOONSHOT_BASE_URL>
   *   Groq:     <YOUR_GROQ_BASE_URL>
   *   Ollama:   http://localhost:11434/v1
   *   Gemini:   <YOUR_GEMINI_BASE_URL>
   */
  baseUrl?: string;
  /** Model identifier to use (e.g. 'gpt-4o', 'deepseek-chat') */
  model: string;
  /** Sampling temperature, 0.0–2.0 */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Research-related configuration.
 */
export interface ResearchConfig {
  /** Default language for research output (e.g. 'Chinese', 'English') */
  defaultLanguage: string;
  /** Citation style (e.g. 'APA', 'MLA', 'Chicago', 'IEEE') */
  citationStyle: string;
  /** Preferred source domains or identifiers */
  preferredSources: string[];
  /** Dataset categories to prefer when searching */
  datasetCategories: string[];
}

/**
 * Allow/deny list controlling which file paths or shell commands the agent may use.
 */
export interface PermissionsConfig {
  /** Patterns that are explicitly allowed */
  allow: string[];
  /** Patterns that are explicitly denied */
  deny: string[];
}

/**
 * Configuration for intelligent conversation compression.
 */
export interface CompressionConfig {
  /** Enable or disable LLM-based smart compression. Default: true */
  enabled: boolean;
  /**
   * Fraction of the context limit at which compression is triggered.
   * E.g. 0.5 means: trigger when context exceeds 50% of maxChars.
   * Range: 0.2–0.9. Default: 0.5
   */
  triggerThreshold: number;
  /**
   * Absolute token threshold for auto-compaction.
   * When estimated tokens exceed this value, compression is triggered
   * regardless of triggerThreshold. Default: 20000
   */
  autoCompactionTokens: number;
  /**
   * Fraction of the oldest messages to compress in one pass.
   * E.g. 0.4 means: compress the oldest 40% of messages into a summary.
   * Range: 0.1–0.7. Default: 0.4
   */
  compressionRatio: number;
  /**
   * Always keep the N most recent messages uncompressed (never compress them).
   * Default: 6
   */
  preserveRecent: number;
  /**
   * Enable a self-verification step where the LLM critically evaluates its
   * own summary for completeness, then optionally refines it.
   * Adds one extra LLM call. Default: true
   */
  selfVerify: boolean;
  /**
   * Maximum tokens to allocate for the summary output.
   * Keep this low to ensure the summary is genuinely compact.
   * Default: 600
   */
  summaryMaxTokens: number;
}

/**
 * Root configuration object for a tzukwan session.
 */
export interface TzukwanConfig {
  /** LLM connection settings */
  llm: LLMConfig;
  /** Optional lightweight router model used only for agent/task dispatch */
  routing?: LLMConfig;
  /** Research behaviour settings */
  research: ResearchConfig;
  /** File/command permission rules */
  permissions: PermissionsConfig;
  /** Free-form behavioural rules parsed from TZUKWAN.md */
  rules: string[];
  /** Intelligent conversation compression settings */
  compression?: CompressionConfig;
}

/**
 * A single tool call requested by the LLM.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * A single chat message. Discriminated union to support all OpenAI message roles.
 */
export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

/**
 * Options that may be passed per-request to override config defaults.
 */
export interface ChatOptions {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  /** AbortSignal for cancelling the request */
  signal?: AbortSignal;
  /** OpenAI-format tool definitions to send with the request */
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: object };
  }>;
}

/**
 * The result of a completed chat request.
 */
export interface ChatResponse {
  content: string;
  /** Native tool calls returned by the LLM (when function calling is supported) */
  tool_calls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * A callable tool that the agent can invoke.
 */
export interface Tool {
  name: string;
  description: string;
  /** JSON-Schema-compatible parameter definition */
  parameters: object;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * A single conversation session.
 */
export interface Session {
  /** Unique session identifier (UUID v4) */
  id: string;
  messages: Message[];
  createdAt: Date;
  /** Snapshot of the config active when this session was created */
  config: TzukwanConfig;
}

/**
 * Standardised result wrapper for tool executions.
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}
