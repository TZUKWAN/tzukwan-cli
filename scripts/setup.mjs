#!/usr/bin/env node
/**
 * First-time setup script for tzukwan-cli
 * Creates ~/.tzukwan/ directory and TZUKWAN.md template
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TZUKWAN_DIR = join(homedir(), '.tzukwan');
const CONFIG_FILE = join(TZUKWAN_DIR, 'config.json');
const TZUKWAN_MD = join(TZUKWAN_DIR, 'TZUKWAN.md');
const SESSIONS_DIR = join(TZUKWAN_DIR, 'sessions');
const SKILLS_DIR = join(TZUKWAN_DIR, 'skills');
const CACHE_DIR = join(TZUKWAN_DIR, 'cache');

const PROVIDERS = {
  openai:   { baseUrl: '<YOUR_OPENAI_BASE_URL>',                              defaultModel: 'gpt-4o',                      hint: 'sk-...' },
  gemini:   { baseUrl: '<YOUR_GEMINI_BASE_URL>',                              defaultModel: 'gemini-2.0-flash',            hint: 'AIzaSy...' },
  deepseek: { baseUrl: '<YOUR_DEEPSEEK_BASE_URL>',                            defaultModel: 'deepseek-chat',               hint: 'sk-...' },
  kimi:     { baseUrl: '<YOUR_MOONSHOT_BASE_URL>',                            defaultModel: 'moonshot-v1-128k',            hint: 'sk-...' },
  groq:     { baseUrl: '<YOUR_GROQ_BASE_URL>',                                defaultModel: 'llama-3.3-70b-versatile',     hint: 'gsk_...' },
  ollama:   { baseUrl: 'http://localhost:11434/v1',                           defaultModel: 'llama3.2',                    hint: 'ollama (no key needed)' },
  custom:   { baseUrl: '',                                                    defaultModel: '',                            hint: 'your API key' },
};

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function promptSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let key = '';
    process.stdin.on('data', function handler(ch) {
      ch = ch.toString();
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(key);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f') {
        if (key.length > 0) {
          key = key.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question + '*'.repeat(key.length));
        }
      } else {
        key += ch;
        process.stdout.write('*');
      }
    });
  });
}

console.log('\n\x1b[1m\x1b[35m  ████████╗███████╗██╗   ██╗██╗  ██╗██╗    ██╗ █████╗ ███╗  ██╗\x1b[0m');
console.log('\x1b[1m\x1b[35m     ╚══██╔╝╚════██║██║   ██║██║ ██╔╝██║    ██║██╔══██╗████╗ ██║\x1b[0m');
console.log('\x1b[1m\x1b[35m        ██║      ██╔╝██║   ██║█████╔╝ ██║ █╗ ██║███████║██╔██╗██║\x1b[0m');
console.log('\x1b[1m\x1b[35m        ██║     ██╔╝ ██║   ██║██╔═██╗ ██║███╗██║██╔══██║██║╚████║\x1b[0m');
console.log('\x1b[1m\x1b[35m        ██║     ██║  ╚██████╔╝██║  ██╗╚███╔███╔╝██║  ██║██║ ╚███║\x1b[0m');
console.log('\x1b[1m\x1b[35m        ╚═╝     ╚═╝   ╚═════╝ ╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚══╝\x1b[0m');
console.log('\x1b[2m                   Academic Research AI Agent — Setup Wizard\x1b[0m\n');

// Create directories
for (const dir of [TZUKWAN_DIR, SESSIONS_DIR, SKILLS_DIR, CACHE_DIR]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`\x1b[32m✓\x1b[0m Created ${dir}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n\x1b[1mStep 1: Choose LLM Provider\x1b[0m');
console.log('  1. OpenAI          (GPT-4o, GPT-4-turbo)');
console.log('  2. Gemini          (gemini-2.0-flash, gemini-2.0-pro)');
console.log('  3. DeepSeek        (deepseek-chat, deepseek-reasoner)');
console.log('  4. Kimi/Moonshot   (moonshot-v1-128k)');
console.log('  5. Groq            (llama-3.3-70b, mixtral)');
console.log('  6. Ollama          (local, free)');
console.log('  7. Custom          (any OpenAI-compatible endpoint)\n');

const choice = await prompt(rl, 'Select provider [1-7]: ');
const providerMap = { '1': 'openai', '2': 'gemini', '3': 'deepseek', '4': 'kimi', '5': 'groq', '6': 'ollama', '7': 'custom' };
const providerKey = providerMap[choice.trim()] || 'openai';
const provider = PROVIDERS[providerKey];

console.log(`\n\x1b[32m✓\x1b[0m Selected: ${providerKey}`);

let baseUrl = provider.baseUrl;
if (providerKey === 'custom' || providerKey === 'ollama') {
  baseUrl = await prompt(rl, `API Base URL [${provider.baseUrl || 'https://your-endpoint/v1'}]: `);
  if (!baseUrl.trim()) baseUrl = provider.baseUrl;
}

console.log('\n\x1b[1mStep 2: API Key\x1b[0m');
let apiKey;
if (providerKey === 'ollama') {
  apiKey = 'ollama';
  console.log('\x1b[2m  (Ollama uses "ollama" as the API key)\x1b[0m');
} else {
  apiKey = await promptSecret(`Enter API key (${provider.hint}): `);
}

console.log('\n\x1b[1mStep 3: Model\x1b[0m');
const modelInput = await prompt(rl, `Model name [${provider.defaultModel}]: `);
const model = modelInput.trim() || provider.defaultModel;

rl.close();

// Save config
const config = {
  llm: {
    provider: providerKey,
    apiKey,
    baseUrl: baseUrl.trim(),
    model,
    temperature: 0.7,
    maxTokens: 8192,
  },
  research: {
    defaultLanguage: 'Chinese',
    citationStyle: 'GB/T7714',
    preferredSources: ['arxiv', 'semantic-scholar', 'pubmed'],
    outputDir: './tzukwan-output',
  },
  permissions: {
    allow: ['file_read', 'file_write', 'shell', 'web_fetch', 'arxiv', 'pubmed', 'semantic_scholar'],
    deny: ['delete_files_recursive'],
  },
};

writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
console.log(`\n\x1b[32m✓\x1b[0m Config saved to ${CONFIG_FILE}`);

// Create TZUKWAN.md template if not exists
if (!existsSync(TZUKWAN_MD)) {
  const template = readFileSync(join(__dirname, '..', 'TZUKWAN.md'), 'utf-8');
  // Replace placeholder with actual values
  const filled = template
    .replace('YOUR_API_KEY_HERE', apiKey.length > 8 ? apiKey.slice(0, 4) + '...' + apiKey.slice(-4) : apiKey)
    .replace('- provider: openai', `- provider: ${providerKey}`)
    .replace('- base_url: <YOUR_OPENAI_BASE_URL>', `- base_url: ${baseUrl}`)
    .replace('- model: gpt-4o', `- model: ${model}`);
  writeFileSync(TZUKWAN_MD, filled);
  console.log(`\x1b[32m✓\x1b[0m TZUKWAN.md created at ${TZUKWAN_MD}`);
}

console.log('\n\x1b[1m\x1b[32m✓ Setup complete!\x1b[0m');
console.log('\x1b[2m  You can now run: tzukwan\x1b[0m');
console.log('\x1b[2m  Or edit your config: ' + CONFIG_FILE + '\x1b[0m\n');
