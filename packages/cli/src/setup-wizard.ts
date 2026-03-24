import * as fs from 'fs';
import * as path from 'path';
import readline from 'readline';
import { Writable } from 'stream';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { UserProfileManager, type UserProfile } from '@tzukwan/core';
import type { Config } from './commands/config.js';
import { buildDirectConfig, saveConfig, testConfigConnection } from './commands/config.js';
import { CONFIG_PATH, TZUKWAN_DIR } from './shared/constants.js';
import { resolveProviderModels } from './shared/provider-utils.js';
import { displaySuccess } from './ui/display.js';

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
  onboarding?: {
    version?: number;
    completedAt?: string;
  };
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
}

const ROLE_OPTIONS: Array<{ value: UserProfile['role']; label: string; title: string }> = [
  { value: 'student', label: 'Student', title: 'Student / PhD Candidate' },
  { value: 'researcher', label: 'Researcher', title: 'Researcher' },
  { value: 'professor', label: 'Professor', title: 'Professor / PI' },
  { value: 'engineer', label: 'Engineer', title: 'Research Engineer' },
  { value: 'teacher', label: 'Teacher', title: 'Teacher / Lecturer' },
  { value: 'other', label: 'Other', title: 'Other' },
];

const LANGUAGE_OPTIONS: Array<{ value: UserProfile['language']; label: string }> = [
  { value: 'zh', label: 'Chinese' },
  { value: 'en', label: 'English' },
  { value: 'bilingual', label: 'Bilingual' },
];

function normalizeConfig(raw: StoredConfig | null): Config | null {
  if (!raw) return null;

  const llm = raw.llm ?? {};
  const provider = raw.provider ?? llm.provider;
  const baseUrl = raw.baseUrl ?? llm.baseUrl;
  const apiKey = raw.apiKey ?? llm.apiKey;
  const model = raw.model ?? llm.model;
  const temperature = raw.temperature ?? llm.temperature;
  const maxTokens = raw.maxTokens ?? llm.maxTokens;

  if (!provider || !baseUrl || apiKey === undefined || !model) {
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

function isProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.role &&
    profile.roleLabel &&
    profile.field,
  );
}

export async function needsOnboarding(): Promise<boolean> {
  const stored = readStoredConfig();
  const config = normalizeConfig(stored);
  const profile = new UserProfileManager().load();

  if (!config) return true;
  if (!isProfileComplete(profile)) return true;
  return false;
}

function clearScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1Bc');
  }
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return ask(prompt);
  }

  return new Promise((resolve) => {
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        const text = chunk.toString();
        if (!(mutableStdout as Writable & { muted: boolean }).muted) {
          process.stdout.write(text, encoding as BufferEncoding);
        } else if (text.includes('\n')) {
          process.stdout.write('\n');
        }
        callback();
      },
    }) as Writable & { muted: boolean };

    mutableStdout.muted = false;
    process.stdout.write(prompt);

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    mutableStdout.muted = true;
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function renderStep(step: number, total: number, title: string, subtitle: string): void {
  clearScreen();

  const progress = Array.from({ length: total }, (_, index) => {
    if (index + 1 < step) return chalk.green('■');
    if (index + 1 === step) return chalk.cyan('■');
    return chalk.gray('□');
  }).join(chalk.gray(' '));

  const content = [
    `${chalk.bold.cyan('Tzukwan Guided Setup')}`,
    chalk.gray('Configure your LLM endpoint, research identity, and working context.'),
    '',
    `${chalk.bold.white(`Step ${step}/${total}`)} ${chalk.white(title)}`,
    progress,
    chalk.gray(subtitle),
  ].join('\n');

  console.log(boxen(content, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: 'cyan',
    width: Math.min(process.stdout.columns ?? 100, 100),
  }));
}

async function askWithDefault(
  label: string,
  currentValue?: string,
  options?: { required?: boolean; hidden?: boolean },
): Promise<string> {
  while (true) {
    const suffix = currentValue ? chalk.gray(` [${currentValue}]`) : '';
    const prompt = `  ${chalk.cyan('>')} ${label}${suffix}: `;
    const answer = options?.hidden ? await askHidden(prompt) : await ask(prompt);
    const finalValue = answer || currentValue || '';

    if (!options?.required || finalValue) {
      return finalValue;
    }

    console.log(chalk.yellow('  This field is required.'));
  }
}

async function askSelection<T extends string>(
  promptLabel: string,
  options: Array<{ value: T; label: string; note?: string }>,
  defaultValue?: T,
): Promise<T> {
  const defaultIndex = Math.max(0, options.findIndex((option) => option.value === defaultValue));

  while (true) {
    options.forEach((option, index) => {
      const marker = index === defaultIndex ? chalk.gray('default') : chalk.gray('      ');
      const note = option.note ? chalk.gray(` - ${option.note}`) : '';
      console.log(`  ${chalk.cyan(String(index + 1).padStart(2, ' '))}. ${chalk.white(option.label)} ${marker}${note}`);
    });
    const answer = await ask(`\n  ${chalk.cyan('>')} ${promptLabel} ${chalk.gray(`[${defaultIndex + 1}]`)}: `);
    const rawIndex = answer ? Number.parseInt(answer, 10) - 1 : defaultIndex;

    if (!Number.isNaN(rawIndex) && rawIndex >= 0 && rawIndex < options.length) {
      return options[rawIndex]!.value;
    }

    console.log(chalk.yellow('  Select one of the listed numbers.'));
  }
}

async function askConfirm(
  label: string,
  defaultValue = true,
): Promise<boolean> {
  const hint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await ask(`  ${chalk.cyan('>')} ${label} ${chalk.gray(hint)}: `);
  if (!answer) return defaultValue;
  if (['y', 'yes'].includes(answer.toLowerCase())) return true;
  if (['n', 'no'].includes(answer.toLowerCase())) return false;
  return defaultValue;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '(not set)';
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}****`;
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function toStoredConfig(config: Config, existing: StoredConfig | null): StoredConfig {
  return {
    ...(existing ?? {}),
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    llm: {
      ...(existing?.llm ?? {}),
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    },
    think: config.think ?? existing?.think ?? true,
    onboarding: {
      version: 2,
      completedAt: new Date().toISOString(),
    },
  };
}

export async function runSetupWizard(): Promise<Config> {
  const existingStored = readStoredConfig();
  const existingConfig = normalizeConfig(existingStored);
  const profileManager = new UserProfileManager();
  const existingProfile = profileManager.load();
  const totalSteps = 4;

  try {
    renderStep(1, totalSteps, 'Connection', 'Provide a Base URL, API key, and LLM model name.');

    let baseUrl = '';
    while (true) {
      const inputUrl = await askWithDefault(
        'Base URL',
        existingConfig?.baseUrl,
        { required: true },
      );

      // Validate URL format
      try {
        const url = new URL(inputUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          console.log(chalk.yellow('  URL must use http:// or https:// protocol.'));
          continue;
        }
        baseUrl = inputUrl;
        break;
      } catch {
        console.log(chalk.yellow('  Please enter a valid URL (e.g., https://api.example.com).'));
      }
    }

    let apiKey = '';
    if (existingConfig?.apiKey) {
      console.log(chalk.gray(`  Stored key detected: ${maskApiKey(existingConfig.apiKey)}`));
      console.log(chalk.gray('  Press Enter to keep the stored key.'));
    }
    apiKey = await askWithDefault('API key', existingConfig?.apiKey, { required: false, hidden: true });

    const discoverySpinner = ora({
      text: 'Discovering available models...',
      color: 'cyan',
      isSilent: !process.stdout.isTTY,
    }).start();
    const discoveredModels = await resolveProviderModels(
      'custom',
      baseUrl,
      apiKey,
      [],
    );
    discoverySpinner.succeed(`Model discovery finished${discoveredModels.length > 0 ? ` (${discoveredModels.length} found)` : ''}.`);

    let model = existingConfig?.model ?? '';
    if (discoveredModels.length > 0) {
      const modelOptions = [
        ...discoveredModels.map((value) => ({ value, label: value })),
        { value: '__custom__', label: 'Custom model id' },
      ];
      const selectedModel = await askSelection('Model', modelOptions, discoveredModels.includes(model) ? model : discoveredModels[0]);
      model = selectedModel === '__custom__'
        ? await askWithDefault('Custom model id', model, { required: true })
        : selectedModel;
    } else {
      model = await askWithDefault('Model', model, { required: true });
    }

    const nextConfig: Config = buildDirectConfig({
      baseUrl,
      apiKey,
      model,
      temperature: existingConfig?.temperature,
      maxTokens: existingConfig?.maxTokens,
      think: existingStored?.think ?? true,
    });

    const testSpinner = ora({
      text: 'Testing LLM connection...',
      color: 'cyan',
      isSilent: !process.stdout.isTTY,
    }).start();
    const connectionResult = await testConfigConnection(nextConfig);
    if (connectionResult.success) {
      testSpinner.succeed('Connection test passed.');
    } else {
      testSpinner.fail(`Connection test failed: ${connectionResult.error}`);
      const shouldContinue = await askConfirm('Save this configuration anyway?', false);
      if (!shouldContinue) {
        throw new Error('Setup cancelled because connection test failed.');
      }
    }

    renderStep(2, totalSteps, 'Identity', 'Tell Tzukwan who you are so responses match your background.');

    const name = await askWithDefault('Name', existingProfile?.name, { required: true });
    const role = await askSelection(
      'Primary role',
      ROLE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.title,
      })),
      existingProfile?.role,
    );
    const roleTitle = ROLE_OPTIONS.find((option) => option.value === role)?.title ?? role;
    const roleLabel = await askWithDefault('Displayed title', existingProfile?.roleLabel ?? roleTitle, { required: true });
    const institution = await askWithDefault('Institution (optional)', existingProfile?.institution);

    renderStep(3, totalSteps, 'Research Context', 'Capture field, direction, and current needs.');

    const field = await askWithDefault('Research field', existingProfile?.field, { required: true });
    const researchDirection = await askWithDefault('Research direction', existingProfile?.researchDirection, { required: true });
    const needs = await askWithDefault(
      'Current needs (for example: lit review, paper writing, experiments, coding)',
      existingProfile?.needs,
      { required: true },
    );
    const targetJournalsRaw = await askWithDefault(
      'Target journals or venues (comma separated, optional)',
      existingProfile?.targetJournals?.join(', '),
    );
    const language = await askSelection(
      'Preferred response language',
      LANGUAGE_OPTIONS,
      existingProfile?.language ?? 'zh',
    );

    renderStep(4, totalSteps, 'Review', 'Review the setup summary before saving.');

    const summary = [
      `${chalk.bold.white('LLM')}`,
      `  Base URL: ${chalk.white(baseUrl)}`,
      `  API key: ${chalk.white(maskApiKey(apiKey))}`,
      `  Model: ${chalk.white(model)}`,
      `  Client type: ${chalk.white(nextConfig.provider)}`,
      '',
      `${chalk.bold.white('Profile')}`,
      `  Name: ${chalk.white(name)}`,
      `  Role: ${chalk.white(roleLabel)}`,
      `  Institution: ${chalk.white(institution || '(not set)')}`,
      `  Field: ${chalk.white(field)}`,
      `  Direction: ${chalk.white(researchDirection)}`,
      `  Needs: ${chalk.white(needs)}`,
      `  Venues: ${chalk.white(targetJournalsRaw || '(not set)')}`,
      `  Language: ${chalk.white(language)}`,
    ].join('\n');

    console.log(boxen(summary, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'green',
      width: Math.min(process.stdout.columns ?? 100, 100),
    }));

    const confirmed = await askConfirm('Save this configuration?', true);
    if (!confirmed) {
      throw new Error('Setup cancelled by user.');
    }

    fs.mkdirSync(TZUKWAN_DIR, { recursive: true }); // idempotent, eliminates TOCTOU

    const savedConfig = toStoredConfig(nextConfig, existingStored);
    saveConfig(nextConfig);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
      ...savedConfig,
      onboarding: {
        version: 2,
        completedAt: new Date().toISOString(),
      },
    }, null, 2), 'utf-8');

    const now = new Date().toISOString();
    profileManager.save({
      name,
      role,
      roleLabel,
      field,
      researchDirection,
      needs,
      institution: institution || undefined,
      targetJournals: targetJournalsRaw
        ? targetJournalsRaw.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined,
      language,
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
    });

    clearScreen();
    displaySuccess('Setup completed. Tzukwan is ready to use.');
    console.log(chalk.gray(`  Config: ${CONFIG_PATH}`));
    console.log(chalk.gray(`  Profile: ${path.join(TZUKWAN_DIR, 'user-profile.json')}`));
    console.log();

    return nextConfig;
  } finally {
    // No shared readline instance to close.
  }
}
