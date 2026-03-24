import { PROVIDERS } from './providers.js';

export function normalizeProvider(provider: string): 'openai' | 'gemini' | 'custom' {
  return PROVIDERS[provider]?.clientProvider ?? 'custom';
}

export function inferProviderFromBaseUrl(baseUrl: string): 'openai' | 'gemini' | 'custom' {
  const normalized = baseUrl.trim().toLowerCase();
  if (normalized.includes('generativelanguage.googleapis.com')) {
    return 'gemini';
  }
  if (normalized.includes('/v1beta/openai')) {
    return 'gemini';
  }
  if (!normalized) return 'custom';
  return 'custom';
}

export function normalizeApiKey(provider: string, apiKey: string): string {
  if (apiKey.trim()) return apiKey;
  if (PROVIDERS[provider]?.requiresApiKey === false) return 'none';
  return apiKey;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey || normalizedKey === 'none') return {};
  return { Authorization: `Bearer ${normalizedKey}` };
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${normalizedBaseUrl}/models`, {
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return Array.isArray(payload.data)
    ? payload.data.map((model) => model.id).filter((id): id is string => Boolean(id))
    : [];
}

export async function resolveProviderModels(
  provider: string,
  baseUrl: string,
  apiKey: string,
  fallbackModels: string[],
): Promise<string[]> {
  const providerInfo = PROVIDERS[provider];
  const shouldDiscover =
    provider === 'custom' ||
    providerInfo?.category === 'local' ||
    fallbackModels.length === 0;

  if (!shouldDiscover) {
    return fallbackModels;
  }

  try {
    const discovered = await fetchProviderModels(baseUrl, normalizeApiKey(provider, apiKey));
    return discovered.length > 0 ? discovered : fallbackModels;
  } catch {
    return fallbackModels;
  }
}
