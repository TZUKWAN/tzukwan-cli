/**
 * Model configuration system for managing context window sizes and token budgets.
 * Maps model names to their context window limits and provides utilities for
 * deriving appropriate token budgets based on model capabilities.
 */

/**
 * Model-specific configuration including context window size.
 */
export interface ModelConfig {
  /** Model identifier (exact name as used in API calls) */
  name: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Default max output tokens for this model */
  defaultMaxTokens: number;
  /** Provider identifier */
  provider: string;
}

/**
 * Known model configurations with their context window sizes.
 * Values are in tokens.
 */
export const KNOWN_MODELS: Readonly<Record<string, ModelConfig>> = Object.freeze({
  // GLM-4.7 series (128K context)
  'glm-4.7': {
    name: 'glm-4.7',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'glm-4.7-flash': {
    name: 'glm-4.7-flash',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'glm-4.7-plus': {
    name: 'glm-4.7-plus',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },

  // OpenAI models
  'gpt-4o': {
    name: 'gpt-4o',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'gpt-4-turbo': {
    name: 'gpt-4-turbo',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'gpt-4': {
    name: 'gpt-4',
    contextWindow: 8192,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'gpt-4-32k': {
    name: 'gpt-4-32k',
    contextWindow: 32768,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'gpt-3.5-turbo': {
    name: 'gpt-3.5-turbo',
    contextWindow: 16385,
    defaultMaxTokens: 4096,
    provider: 'openai',
  },
  'o1': {
    name: 'o1',
    contextWindow: 200000,
    defaultMaxTokens: 8192,
    provider: 'openai',
  },
  'o1-mini': {
    name: 'o1-mini',
    contextWindow: 128000,
    defaultMaxTokens: 65536,
    provider: 'openai',
  },
  'o3-mini': {
    name: 'o3-mini',
    contextWindow: 200000,
    defaultMaxTokens: 100000,
    provider: 'openai',
  },

  // Gemini models
  'gemini-2.0-flash': {
    name: 'gemini-2.0-flash',
    contextWindow: 1048576,
    defaultMaxTokens: 8192,
    provider: 'gemini',
  },
  'gemini-2.0-flash-thinking': {
    name: 'gemini-2.0-flash-thinking',
    contextWindow: 1048576,
    defaultMaxTokens: 8192,
    provider: 'gemini',
  },
  'gemini-1.5-flash': {
    name: 'gemini-1.5-flash',
    contextWindow: 1048576,
    defaultMaxTokens: 8192,
    provider: 'gemini',
  },
  'gemini-1.5-pro': {
    name: 'gemini-1.5-pro',
    contextWindow: 2097152,
    defaultMaxTokens: 8192,
    provider: 'gemini',
  },

  // DeepSeek models
  'deepseek-chat': {
    name: 'deepseek-chat',
    contextWindow: 64000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'deepseek-reasoner': {
    name: 'deepseek-reasoner',
    contextWindow: 64000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },

  // Anthropic models (via OpenAI-compatible proxies)
  'claude-3-opus': {
    name: 'claude-3-opus',
    contextWindow: 200000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'claude-3-sonnet': {
    name: 'claude-3-sonnet',
    contextWindow: 200000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'claude-3-haiku': {
    name: 'claude-3-haiku',
    contextWindow: 200000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'claude-3-5-sonnet': {
    name: 'claude-3-5-sonnet',
    contextWindow: 200000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
  'claude-3-7-sonnet': {
    name: 'claude-3-7-sonnet',
    contextWindow: 200000,
    defaultMaxTokens: 4096,
    provider: 'custom',
  },
});

/**
 * Default configuration for unknown models.
 * Uses conservative values to ensure safety.
 */
export const DEFAULT_MODEL_CONFIG: Readonly<ModelConfig> = Object.freeze({
  name: 'unknown',
  contextWindow: 8192,
  defaultMaxTokens: 4096,
  provider: 'custom',
});

/**
 * Gets the configuration for a specific model.
 * Returns exact match if found, otherwise tries to match by prefix.
 * Falls back to DEFAULT_MODEL_CONFIG for unknown models.
 */
export function getModelConfig(modelName: string): ModelConfig {
  // Exact match
  if (KNOWN_MODELS[modelName]) {
    return KNOWN_MODELS[modelName];
  }

  // Try prefix matching (e.g., "glm-4.7-20250315" matches "glm-4.7")
  const sortedKeys = Object.keys(KNOWN_MODELS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (modelName.startsWith(key) || modelName.includes(key)) {
      return KNOWN_MODELS[key];
    }
  }

  // Fallback to default for unknown models
  return DEFAULT_MODEL_CONFIG;
}

/**
 * Gets the context window size for a model.
 */
export function getContextWindow(modelName: string): number {
  return getModelConfig(modelName).contextWindow;
}

/**
 * Token budget tiers based on prompt size as percentage of context window.
 */
interface TokenBudgetTier {
  threshold: number;
  responseBudget: number;
}

/**
 * Default token budget tiers (for 8K-16K context models).
 */
const DEFAULT_TIERS: TokenBudgetTier[] = [
  { threshold: 0.75, responseBudget: 1024 },
  { threshold: 0.56, responseBudget: 1536 },
  { threshold: 0.375, responseBudget: 2048 },
  { threshold: 0.25, responseBudget: 3072 },
  { threshold: 0, responseBudget: 4096 },
];

/**
 * Large context token budget tiers (for 64K+ context models like GLM-4.7).
 */
const LARGE_CONTEXT_TIERS: TokenBudgetTier[] = [
  { threshold: 0.875, responseBudget: 2048 },
  { threshold: 0.75, responseBudget: 4096 },
  { threshold: 0.5, responseBudget: 8192 },
  { threshold: 0.25, responseBudget: 16384 },
  { threshold: 0, responseBudget: 32768 },
];

/**
 * Extra-large context token budget tiers (for 128K+ context models).
 */
const XL_CONTEXT_TIERS: TokenBudgetTier[] = [
  { threshold: 0.9, responseBudget: 4096 },
  { threshold: 0.75, responseBudget: 8192 },
  { threshold: 0.5, responseBudget: 16384 },
  { threshold: 0.25, responseBudget: 32768 },
  { threshold: 0, responseBudget: 65536 },
];

/**
 * Determines the appropriate token budget tiers based on context window size.
 */
function getBudgetTiers(contextWindow: number): TokenBudgetTier[] {
  if (contextWindow >= 128000) {
    return XL_CONTEXT_TIERS;
  }
  if (contextWindow >= 64000) {
    return LARGE_CONTEXT_TIERS;
  }
  return DEFAULT_TIERS;
}

/**
 * Derives the response token budget based on model capabilities and prompt size.
 *
 * @param modelName - The model identifier
 * @param configuredMaxTokens - User-configured max tokens (optional)
 * @param promptTokens - Estimated number of tokens in the prompt
 * @param toolDefsCount - Number of tool definitions being sent
 * @returns The recommended max tokens for the response
 */
export function deriveResponseTokenBudget(
  modelName: string,
  configuredMaxTokens: number | undefined,
  promptTokens: number,
  toolDefsCount: number = 0
): number {
  const modelConfig = getModelConfig(modelName);
  const contextWindow = modelConfig.contextWindow;

  // Calculate total prompt tokens including tool overhead
  const totalPromptTokens = promptTokens + toolDefsCount * 120;

  // Get appropriate tiers for this context window
  const tiers = getBudgetTiers(contextWindow);

  // Find the appropriate tier based on prompt usage percentage
  const promptRatio = totalPromptTokens / contextWindow;

  let recommendedBudget = modelConfig.defaultMaxTokens;
  for (const tier of tiers) {
    if (promptRatio > tier.threshold) {
      recommendedBudget = tier.responseBudget;
      break;
    }
  }

  // Ensure we don't exceed context window minus prompt
  const maxPossible = Math.max(256, contextWindow - totalPromptTokens - 512); // 512 token buffer

  // If user provided a specific limit, respect it (but still cap at what fits)
  if (configuredMaxTokens !== undefined) {
    return Math.min(configuredMaxTokens, maxPossible);
  }

  // Otherwise use the tier-based recommendation capped by what fits in the context window
  return Math.min(recommendedBudget, maxPossible);
}

/**
 * Checks if a model supports a given context size.
 */
export function supportsContextSize(modelName: string, requiredTokens: number): boolean {
  return getContextWindow(modelName) >= requiredTokens;
}

/**
 * Gets a human-readable description of model capabilities.
 */
export function getModelDescription(modelName: string): string {
  const config = getModelConfig(modelName);
  return `${config.name} (${config.contextWindow.toLocaleString()} context, ${config.defaultMaxTokens.toLocaleString()} default output)`;
}
