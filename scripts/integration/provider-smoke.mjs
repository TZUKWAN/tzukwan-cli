import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LLMClient } from '../../packages/core/dist/index.js';
import { PROVIDERS } from '../../packages/cli/dist/shared/providers.js';
import {
  fetchProviderModels,
  normalizeApiKey,
  normalizeProvider,
} from '../../packages/cli/dist/shared/provider-utils.js';

function readConfiguredProvider() {
  const configPath = path.join(os.homedir(), '.tzukwan', 'config.json');
  if (!fs.existsSync(configPath)) return null;

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const llm = raw.llm ?? raw;
  if (!llm.provider || !llm.baseUrl || !llm.model) return null;

  return {
    label: 'configured',
    provider: llm.provider,
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey ?? '',
    model: llm.model,
  };
}

async function discoverLocalProvider(providerKey) {
  const info = PROVIDERS[providerKey];
  if (!info) return null;

  try {
    const models = await fetchProviderModels(info.baseUrl, 'none');
    if (models.length === 0) return null;
    return {
      label: providerKey,
      provider: providerKey,
      baseUrl: info.baseUrl,
      apiKey: '',
      model: models[0],
    };
  } catch {
    return null;
  }
}

async function discoverEnvProviders() {
  const candidates = [];

  for (const [providerKey, info] of Object.entries(PROVIDERS)) {
    if (!info.apiKeyEnvVar) continue;
    const apiKey = process.env[info.apiKeyEnvVar] ?? '';
    if (!apiKey.trim()) continue;

    let model = info.models[0];
    try {
      const models = await fetchProviderModels(info.baseUrl, apiKey);
      if (models.length > 0) {
        model = models[0];
      }
    } catch {
      // Fall back to the static catalogue entry.
    }

    if (!model) continue;
    candidates.push({
      label: `env:${providerKey}`,
      provider: providerKey,
      baseUrl: info.baseUrl,
      apiKey,
      model,
    });
  }

  return candidates;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = JSON.stringify([candidate.provider, candidate.baseUrl, candidate.model, candidate.label]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function smokeCandidate(candidate) {
  const client = new LLMClient({
    provider: normalizeProvider(candidate.provider),
    baseUrl: candidate.baseUrl,
    apiKey: normalizeApiKey(candidate.provider, candidate.apiKey),
    model: candidate.model,
    temperature: 0,
    maxTokens: 384,
    timeout: 30000,
  });

  const attempts = [96, 192, 384];
  let lastVisibleContent = '';

  for (const maxTokens of attempts) {
    const response = await client.chat(
      [{ role: 'user', content: 'Reply with exactly OK. Do not output anything except OK in the final answer.' }],
      { maxTokens, temperature: 0 },
    );

    const visibleContent = response.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (visibleContent) {
      return visibleContent;
    }
    lastVisibleContent = visibleContent;
  }

  return lastVisibleContent;
}

const candidates = dedupeCandidates([
  readConfiguredProvider(),
  await discoverLocalProvider('lmstudio'),
  await discoverLocalProvider('ollama'),
  ...(await discoverEnvProviders()),
].filter(Boolean));

if (candidates.length === 0) {
  console.error('[provider-smoke] No provider candidate is configured or reachable.');
  process.exit(1);
}

const results = [];
for (const candidate of candidates) {
  try {
    const content = await smokeCandidate(candidate);
    const passed = content === 'OK';
    results.push({ candidate, status: passed ? 'pass' : 'fail', detail: content });
    console.log(`[provider-smoke] ${candidate.label} -> ${candidate.provider} (${candidate.model}): ${passed ? 'PASS' : 'FAIL'} ${content}`);
  } catch (error) {
    results.push({ candidate, status: 'fail', detail: String(error) });
    console.log(`[provider-smoke] ${candidate.label} -> ${candidate.provider} (${candidate.model}): FAIL ${String(error)}`);
  }
}

const passCount = results.filter((result) => result.status === 'pass').length;
const failCount = results.filter((result) => result.status === 'fail').length;

if (passCount === 0 || failCount > 0) {
  process.exit(1);
}
