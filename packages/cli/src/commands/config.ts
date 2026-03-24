import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { LLMClient } from '@tzukwan/core';
import { displayError, displayInfo, displaySuccess } from '../ui/display.js';
import { CONFIG_PATH, PROFILE_PATH } from '../shared/constants.js';
import { inferProviderFromBaseUrl, normalizeApiKey, normalizeProvider } from '../shared/provider-utils.js';
import { needsOnboarding, runSetupWizard } from '../setup-wizard.js';

export interface Config {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  think?: boolean;
}

interface StoredConfig {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  think?: boolean;
  llm?: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  routing?: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  onboarding?: {
    version?: number;
    completedAt?: string;
  };
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
}

function normalizeConfig(raw: StoredConfig | null): Config | null {
  if (!raw) return null;

  const llm = raw.llm ?? {};
  const provider = raw.provider ?? llm.provider;
  const baseUrl = raw.baseUrl ?? llm.baseUrl;
  const apiKey = raw.apiKey ?? llm.apiKey;
  const model = raw.model ?? llm.model;
  const temperature = raw.temperature ?? llm.temperature;
  const maxTokens = raw.maxTokens ?? llm.maxTokens;

  if (!provider || !baseUrl || !apiKey || !model) {
    return null;
  }

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    temperature,
    maxTokens,
    think: raw.think,
  };
}

function readStoredConfig(): StoredConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(stripBom(fs.readFileSync(CONFIG_PATH, 'utf-8'))) as StoredConfig;
  } catch {
    return null;
  }
}

async function readConfig(): Promise<Config | null> {
  return normalizeConfig(readStoredConfig());
}

function writeStoredConfig(config: StoredConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function saveConfig(config: Config): void {
  const existing = readStoredConfig() ?? {};
  writeStoredConfig({
    ...existing,
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    llm: {
      ...(existing.llm ?? {}),
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    },
    ...(config.think !== undefined ? { think: config.think } : {}),
    ...(existing.onboarding ? { onboarding: existing.onboarding } : {}),
  });
}

export function getRoutingConfig(): Config | null {
  const raw = readStoredConfig();
  if (!raw?.routing) return null;
  return normalizeConfig({
    provider: raw.routing.provider,
    baseUrl: raw.routing.baseUrl,
    apiKey: raw.routing.apiKey,
    model: raw.routing.model,
    temperature: raw.routing.temperature,
    maxTokens: raw.routing.maxTokens,
  });
}

export function saveRoutingConfig(config: Config): void {
  const existing = readStoredConfig() ?? {};
  writeStoredConfig({
    ...existing,
    routing: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    },
  });
}

export function buildDirectConfig(input: Partial<Config> & Pick<Config, 'baseUrl' | 'apiKey' | 'model'>): Config {
  const provider = input.provider && input.provider.trim()
    ? input.provider
    : inferProviderFromBaseUrl(input.baseUrl);
  return {
    provider,
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey,
    model: input.model.trim(),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.think !== undefined ? { think: input.think } : {}),
  };
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '(not set)';
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}****`;
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

export async function configInit(): Promise<void> {
  await runSetupWizard();
}

export async function configShow(): Promise<void> {
  const stored = readStoredConfig();
  const config = normalizeConfig(stored);
  const routing = getRoutingConfig();

  if (!config) {
    displayInfo('No valid configuration found. Run `tzukwan config init` to start guided setup.');
    return;
  }

  let profileSummary = chalk.gray('not configured');
  if (fs.existsSync(PROFILE_PATH)) {
    try {
      const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8')) as {
        name?: string;
        roleLabel?: string;
        field?: string;
        needs?: string;
      };
      const pieces = [profile.name, profile.roleLabel, profile.field].filter(Boolean);
      profileSummary = pieces.length > 0
        ? `${chalk.green('configured')} ${chalk.gray(`(${pieces.join(' / ')})`)}`
        : chalk.green('configured');
      if (profile.needs) {
        profileSummary += chalk.gray(` needs: ${profile.needs}`);
      }
    } catch {
      profileSummary = chalk.yellow('unreadable');
    }
  }

  const onboardingSummary = stored?.onboarding?.completedAt
    ? `${chalk.green('complete')} ${chalk.gray(`(${stored.onboarding.completedAt})`)}`
    : chalk.yellow('legacy config or incomplete profile');

  console.log(`\n${chalk.bold.cyan('Tzukwan Configuration')}\n`);
  console.log(`  ${chalk.gray('Base URL:')}    ${chalk.white(config.baseUrl)}`);
  console.log(`  ${chalk.gray('API key:')}     ${chalk.white(maskApiKey(config.apiKey))}`);
  console.log(`  ${chalk.gray('Model:')}       ${chalk.white(config.model)}`);
  console.log(`  ${chalk.gray('Client type:')} ${chalk.white(config.provider)}`);
  if (config.temperature !== undefined) {
    console.log(`  ${chalk.gray('Temperature:')} ${chalk.white(String(config.temperature))}`);
  }
  if (config.maxTokens !== undefined) {
    console.log(`  ${chalk.gray('Max tokens:')}  ${chalk.white(String(config.maxTokens))}`);
  }
  console.log(`  ${chalk.gray('Profile:')}     ${profileSummary}`);
  console.log(`  ${chalk.gray('Onboarding:')}  ${onboardingSummary}`);
  if (routing) {
    console.log();
    console.log(`  ${chalk.gray('Routing URL:')} ${chalk.white(routing.baseUrl)}`);
    console.log(`  ${chalk.gray('Routing key:')} ${chalk.white(maskApiKey(routing.apiKey))}`);
    console.log(`  ${chalk.gray('Routing LLM:')} ${chalk.white(routing.model)}`);
    console.log(`  ${chalk.gray('Routing type:')} ${chalk.white(routing.provider)}`);
  }
  console.log();
  console.log(chalk.gray(`  Config file: ${CONFIG_PATH}`));
  console.log();
}

export async function configSet(key: string, value: string): Promise<void> {
  const validKeys = ['base_url', 'api_key', 'model'];
  if (!validKeys.includes(key)) {
    displayError(`Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`);
    return;
  }

  const existing = readStoredConfig() ?? {};
  const current = normalizeConfig(existing) ?? {
    provider: 'custom',
    baseUrl: '',
    apiKey: '',
    model: '',
  };

  const keyMap: Record<string, keyof Config> = {
    base_url: 'baseUrl',
    api_key: 'apiKey',
    model: 'model',
  };
  (current as unknown as Record<string, string | number | boolean | undefined>)[keyMap[key]!] = value;
  current.provider = inferProviderFromBaseUrl(current.baseUrl);
  saveConfig(current);

  displaySuccess(`Set ${key} = ${key === 'api_key' ? '***' : value}`);
}

export async function testConfigConnection(config: Config): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new LLMClient({
      provider: normalizeProvider(config.provider),
      baseUrl: config.baseUrl,
      apiKey: normalizeApiKey(config.provider, config.apiKey),
      model: config.model,
      temperature: 0.1,
      maxTokens: 128,
      timeout: 30000,
    });
    const response = await client.chat([
      { role: 'user', content: 'Reply with exactly OK.' },
    ], {
      temperature: 0,
      maxTokens: 64,
      timeout: 30000,
    });
    const visible = response.content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    if (!visible) {
      return { success: false, error: 'provider returned an empty visible response' };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testRoutingConnection(config: Config): Promise<{ success: boolean; error?: string }> {
  return testConfigConnection(config);
}

export async function getConfig(): Promise<Config | null> {
  return readConfig();
}

export async function ensureConfig(): Promise<Config> {
  const current = await readConfig();
  if (current && !(await needsOnboarding())) {
    return current;
  }

  console.log();
  displayInfo('Starting guided setup...');
  console.log();

  return runSetupWizard();
}
