import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TzukwanConfig, LLMConfig, ResearchConfig, PermissionsConfig } from './types.js';

/** Path to the global tzukwan configuration directory */
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.tzukwan');
const GLOBAL_CONFIG_JSON = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const GLOBAL_TZUKWAN_MD = path.join(GLOBAL_CONFIG_DIR, 'TZUKWAN.md');
const PROJECT_TZUKWAN_MD = 'TZUKWAN.md';

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
}

/**
 * Returns sensible defaults for a TzukwanConfig.
 */
function getDefaultConfig(): TzukwanConfig {
  return {
    llm: {
      provider: 'openai',
      apiKey: '',
      baseUrl: '<YOUR_OPENAI_BASE_URL>',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 60000,
    },
    routing: undefined,
    research: {
      defaultLanguage: 'English',
      citationStyle: 'APA',
      preferredSources: [],
      datasetCategories: [],
    },
    permissions: {
      allow: ['**'],
      deny: [],
    },
    rules: [],
  };
}

/**
 * Deep-merges source into target, returning a new object.
 * Arrays in source replace arrays in target (no concatenation).
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    // Guard against prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      srcVal !== null &&
      srcVal !== undefined &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>
      );
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }

  return result;
}

/**
 * Parses a TZUKWAN.md file into a partial TzukwanConfig.
 *
 * Supported sections:
 *   ## LLM Settings       → llm.*
 *   ## Research Settings  → research.*
 *   ## Permissions        → permissions.allow / permissions.deny
 *   ## Rules              → rules[]
 *
 * @param content - Raw file content of TZUKWAN.md
 * @returns Partial configuration derived from the file
 */
function parseTzukwanMd(content: string): Partial<TzukwanConfig> {
  const result: Partial<TzukwanConfig> = {};
  const llm: Partial<LLMConfig> = {};
  const research: Partial<ResearchConfig> = {};
  const permissions: Partial<PermissionsConfig> = {};
  const rules: string[] = [];

  let currentSection = '';
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') && !line.startsWith('##')) {
      continue;
    }

    // Detect section headers
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim().toLowerCase();
      continue;
    }

    // Parse bullet list items:  "- key: value"  or  "- value"
    if (line.startsWith('- ')) {
      const item = line.slice(2).trim();

      if (currentSection.includes('llm')) {
        const colonIdx = item.indexOf(':');
        if (colonIdx !== -1) {
          const key = item.slice(0, colonIdx).trim().toLowerCase().replace(/-/g, '_');
          const value = item.slice(colonIdx + 1).trim();

          switch (key) {
            case 'provider':
              llm.provider = value as LLMConfig['provider'];
              break;
            case 'api_key':
            case 'apikey':
              llm.apiKey = value;
              break;
            case 'base_url':
            case 'baseurl':
              llm.baseUrl = value;
              break;
            case 'model':
              llm.model = value;
              break;
            case 'temperature':
              {
                const t = parseFloat(value);
                if (!isNaN(t) && t >= 0 && t <= 2) llm.temperature = t;
              }
              break;
            case 'max_tokens':
            case 'maxtokens':
              {
                const mt = parseInt(value, 10);
                if (!isNaN(mt) && mt > 0) llm.maxTokens = mt;
              }
              break;
            case 'timeout':
              {
                const to = parseInt(value, 10);
                if (!isNaN(to) && to > 0) llm.timeout = to;
              }
              break;
          }
        }
      } else if (currentSection.includes('research')) {
        const colonIdx = item.indexOf(':');
        if (colonIdx !== -1) {
          const key = item.slice(0, colonIdx).trim().toLowerCase().replace(/-/g, '_');
          const value = item.slice(colonIdx + 1).trim();

          switch (key) {
            case 'language':
            case 'default_language':
              research.defaultLanguage = value;
              break;
            case 'citation_style':
              research.citationStyle = value;
              break;
            case 'preferred_sources':
              if (typeof value === 'string') {
                research.preferredSources = value.split(',').map((s) => s.trim()).filter(Boolean);
              }
              break;
            case 'dataset_categories':
              if (typeof value === 'string') {
                research.datasetCategories = value.split(',').map((s) => s.trim()).filter(Boolean);
              }
              break;
          }
        }
      } else if (currentSection.includes('permission')) {
        const colonIdx = item.indexOf(':');
        if (colonIdx !== -1) {
          const key = item.slice(0, colonIdx).trim().toLowerCase();
          const value = item.slice(colonIdx + 1).trim();
          if (key === 'allow') {
            permissions.allow = value.split(',').map((s) => s.trim()).filter(Boolean);
          } else if (key === 'deny') {
            permissions.deny = value.split(',').map((s) => s.trim()).filter(Boolean);
          }
        } else {
          // Single-entry lines treated as allow rules
          if (!permissions.allow) permissions.allow = [];
          permissions.allow.push(item);
        }
      } else if (currentSection.includes('rule')) {
        if (item) rules.push(item);
      }
    }
  }

  if (Object.keys(llm).length > 0) result.llm = llm as LLMConfig;
  if (Object.keys(research).length > 0) result.research = research as ResearchConfig;
  if (Object.keys(permissions).length > 0) result.permissions = permissions as PermissionsConfig;
  if (rules.length > 0) result.rules = rules;

  return result;
}

/**
 * Manages loading, merging, and saving tzukwan configuration.
 *
 * Priority (highest wins):
 *   1. Project-level TZUKWAN.md in the working directory
 *   2. Global config.json at ~/.tzukwan/config.json
 *   3. Global TZUKWAN.md at ~/.tzukwan/TZUKWAN.md
 *   4. Hardcoded defaults
 */
export class ConfigLoader {
  /**
   * Ensures the global configuration directory exists.
   */
  private async ensureGlobalDir(): Promise<void> {
    await fs.promises.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
  }

  /**
   * Returns the hardcoded default configuration.
   */
  getDefaultConfig(): TzukwanConfig {
    return getDefaultConfig();
  }

  /**
   * Loads and merges the three-layer configuration.
   *
   * @param projectDir - Project directory to search for TZUKWAN.md (defaults to cwd)
   * @returns Fully merged TzukwanConfig
   */
  async loadConfig(projectDir?: string): Promise<TzukwanConfig> {
    await this.ensureGlobalDir();

    let config = getDefaultConfig();

    // Layer 1 (lowest priority): global TZUKWAN.md
    try {
      const globalMdContent = await fs.promises.readFile(GLOBAL_TZUKWAN_MD, 'utf-8');
      const globalMdConfig = parseTzukwanMd(globalMdContent);
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        globalMdConfig as unknown as Record<string, unknown>
      ) as unknown as TzukwanConfig;
    } catch {
      // File may not exist – that's fine
    }

    // Layer 2: global config.json
    try {
      const globalJsonContent = await fs.promises.readFile(GLOBAL_CONFIG_JSON, 'utf-8');
      const globalJson = JSON.parse(stripBom(globalJsonContent)) as Partial<TzukwanConfig>;
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        globalJson as unknown as Record<string, unknown>
      ) as unknown as TzukwanConfig;
    } catch {
      // File may not exist or be malformed – that's fine
    }

    // Layer 3 (highest priority): project-level TZUKWAN.md
    const searchDir = projectDir ?? process.cwd();
    const projectMdPath = path.join(searchDir, PROJECT_TZUKWAN_MD);

    try {
      const projectMdContent = await fs.promises.readFile(projectMdPath, 'utf-8');
      const projectMdConfig = parseTzukwanMd(projectMdContent);
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        projectMdConfig as unknown as Record<string, unknown>
      ) as unknown as TzukwanConfig;
    } catch {
      // File may not exist – that's fine
    }

    // Validate required fields
    this.validateConfig(config);

    return config;
  }

  /**
   * Validates that required config fields are present and valid.
   * Throws an error if validation fails.
   */
  private validateConfig(config: TzukwanConfig): void {
    const validProviders: Array<TzukwanConfig['llm']['provider']> = ['openai', 'gemini', 'custom'];
    const validateLLMConfig = (label: string, llm: TzukwanConfig['llm'] | undefined): void => {
      if (!llm) return;
      if (!llm.provider) {
        throw new Error(`Config validation failed: ${label}.provider is required`);
      }
      if (!validProviders.includes(llm.provider)) {
        throw new Error(`Config validation failed: invalid ${label}.provider "${llm.provider}". Must be one of: ${validProviders.join(', ')}`);
      }
      if (!llm.model || llm.model.trim() === '') {
        throw new Error(`Config validation failed: ${label}.model is required`);
      }
      if (llm.temperature !== undefined && (llm.temperature < 0 || llm.temperature > 2)) {
        throw new Error(`Config validation failed: ${label}.temperature must be between 0.0 and 2.0`);
      }
      if (llm.maxTokens !== undefined && llm.maxTokens <= 0) {
        throw new Error(`Config validation failed: ${label}.maxTokens must be a positive number`);
      }
      if (llm.timeout !== undefined && llm.timeout <= 0) {
        throw new Error(`Config validation failed: ${label}.timeout must be a positive number`);
      }
    };

    validateLLMConfig('llm', config.llm);
    validateLLMConfig('routing', config.routing);
  }

  /**
   * Persists a partial configuration to ~/.tzukwan/config.json.
   * The file is merged with any existing content.
   *
   * @param config - Partial config to save
   */
  async saveConfig(config: Partial<TzukwanConfig>): Promise<void> {
    await this.ensureGlobalDir();

    let existingConfig: Partial<TzukwanConfig> = {};

    try {
      const content = await fs.promises.readFile(GLOBAL_CONFIG_JSON, 'utf-8');
      existingConfig = JSON.parse(stripBom(content)) as Partial<TzukwanConfig>;
    } catch {
      // No existing file – start fresh
    }

    const merged = deepMerge(
      existingConfig as Record<string, unknown>,
      config as Record<string, unknown>
    );

    await fs.promises.writeFile(
      GLOBAL_CONFIG_JSON,
      JSON.stringify(merged, null, 2),
      'utf-8'
    );
  }

  /**
   * Parses TZUKWAN.md content into a partial config.
   * Exposed publicly so callers can parse arbitrary TZUKWAN.md strings.
   *
   * @param content - Raw markdown string
   */
  parseTzukwanMd(content: string): Partial<TzukwanConfig> {
    return parseTzukwanMd(content);
  }
}
