/**
 * Shared LLM provider configurations used across the CLI.
 * This file centralizes provider definitions to avoid duplication.
 */

export interface ProviderInfo {
  name: string;
  baseUrl: string;
  models: string[];
  requiresApiKey: boolean;
  clientProvider?: 'openai' | 'gemini' | 'custom';
  apiKeyEnvVar?: string;
  category?: 'remote' | 'local';
  notes?: string;
}

/**
 * Complete provider catalogue with all supported LLM providers.
 * Used by setup wizard and config commands.
 */
export const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    baseUrl: '<YOUR_OPENAI_BASE_URL>',
    models: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'o1', 'o3', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    clientProvider: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    category: 'remote',
  },
  anthropic: {
    name: 'Anthropic (Claude via OpenRouter)',
    baseUrl: '<YOUR_OPENROUTER_BASE_URL>',
    models: ['anthropic/claude-opus-4-5', 'anthropic/claude-sonnet-4-5', 'anthropic/claude-3-7-sonnet', 'anthropic/claude-3-5-haiku'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    category: 'remote',
    notes: 'Access Claude models via OpenRouter proxy',
  },
  zhipu: {
    name: 'Zhipu AI (GLM)',
    baseUrl: '<YOUR_ZHIPU_BASE_URL>',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-alltools', 'glm-4-long'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'ZHIPU_API_KEY',
    category: 'remote',
    notes: 'Supports custom GLM model ids entered manually during setup',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: '<YOUR_DEEPSEEK_BASE_URL>',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    category: 'remote',
  },
  kimi: {
    name: 'Moonshot (Kimi)',
    baseUrl: '<YOUR_MOONSHOT_BASE_URL>',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    category: 'remote',
  },
  qwen: {
    name: 'Qwen (Alibaba)',
    baseUrl: '<YOUR_QWEN_BASE_URL>',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long', 'qwen2.5-72b-instruct'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'QWEN_API_KEY',
    category: 'remote',
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: '<YOUR_GEMINI_BASE_URL>',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresApiKey: true,
    clientProvider: 'gemini',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    category: 'remote',
  },
  groq: {
    name: 'Groq',
    baseUrl: '<YOUR_GROQ_BASE_URL>',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'GROQ_API_KEY',
    category: 'remote',
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2.5'],
    requiresApiKey: false,
    clientProvider: 'custom',
    category: 'local',
    notes: 'Requires Ollama installed and running locally',
  },
  lmstudio: {
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    requiresApiKey: false,
    clientProvider: 'custom',
    category: 'local',
    notes: 'Requires LM Studio server running locally',
  },
  together: {
    name: 'Together AI',
    baseUrl: '<YOUR_TOGETHER_BASE_URL>',
    models: ['meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1', 'deepseek-ai/DeepSeek-R1'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    category: 'remote',
  },
  fireworks: {
    name: 'Fireworks AI',
    baseUrl: '<YOUR_FIREWORKS_BASE_URL>',
    models: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/mixtral-8x22b-instruct'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
    category: 'remote',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: '<YOUR_OPENROUTER_BASE_URL>',
    models: ['openai/gpt-4o', 'anthropic/claude-3-5-sonnet', 'google/gemini-pro-1.5', 'meta-llama/llama-3.1-405b-instruct'],
    requiresApiKey: true,
    clientProvider: 'custom',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    category: 'remote',
    notes: 'Unified access to multiple providers',
  },
  custom: {
    name: 'Custom Provider',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    clientProvider: 'custom',
    category: 'remote',
    notes: 'Any OpenAI-compatible API endpoint',
  },
};
