import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_MODELS,
  DEFAULT_MODEL_CONFIG,
  getModelConfig,
  getContextWindow,
  deriveResponseTokenBudget,
  supportsContextSize,
  getModelDescription,
} from '../dist/index.js';

test('getModelConfig returns exact match for glm-4.7', () => {
  const config = getModelConfig('glm-4.7');
  assert.equal(config.name, 'glm-4.7');
  assert.equal(config.contextWindow, 128000);
  assert.equal(config.defaultMaxTokens, 4096);
});

test('getModelConfig returns GLM-4.7 config for glm-4.7-flash variant', () => {
  const config = getModelConfig('glm-4.7-flash');
  assert.equal(config.name, 'glm-4.7-flash');
  assert.equal(config.contextWindow, 128000);
});

test('getModelConfig returns GLM-4.7 config for glm-4.7-plus variant', () => {
  const config = getModelConfig('glm-4.7-plus');
  assert.equal(config.contextWindow, 128000);
});

test('getModelConfig matches by prefix for dated GLM-4.7 variants like glm-4.7-20250315', () => {
  const config = getModelConfig('glm-4.7-20250315');
  assert.equal(config.contextWindow, 128000);
});

test('getModelConfig returns OpenAI config for gpt-4o', () => {
  const config = getModelConfig('gpt-4o');
  assert.equal(config.name, 'gpt-4o');
  assert.equal(config.contextWindow, 128000);
});

test('getModelConfig returns Gemini config for gemini-1.5-pro', () => {
  const config = getModelConfig('gemini-1.5-pro');
  assert.equal(config.contextWindow, 2097152);
});

test('getModelConfig returns default config for unknown models', () => {
  const config = getModelConfig('unknown-model-xyz-999');
  assert.deepEqual(config, DEFAULT_MODEL_CONFIG);
});

test('getContextWindow returns 128K for glm-4.7', () => {
  assert.equal(getContextWindow('glm-4.7'), 128000);
});

test('getContextWindow returns 128K for glm-4.7-plus', () => {
  assert.equal(getContextWindow('glm-4.7-plus'), 128000);
});

test('getContextWindow returns default 8192 for unknown models', () => {
  assert.equal(getContextWindow('unknown-xyz'), 8192);
});

test('deriveResponseTokenBudget allows large response for glm-4.7 with small prompt', () => {
  // 1% usage should allow ~65K response
  const budget = deriveResponseTokenBudget('glm-4.7', undefined, 1280, 0);
  assert.ok(budget > 30000, `Expected budget > 30000, got ${budget}`);
});

test('deriveResponseTokenBudget returns 16384 for glm-4.7 just above 50% context usage', () => {
  // Ratio > 0.5 but <= 0.75 → tier 16384
  const budget = deriveResponseTokenBudget('glm-4.7', undefined, 70000, 0);
  assert.equal(budget, 16384);
});

test('deriveResponseTokenBudget returns 8192 for glm-4.7 just above 75% context usage', () => {
  // Ratio > 0.75 but <= 0.9 → tier 8192
  const budget = deriveResponseTokenBudget('glm-4.7', undefined, 100000, 0);
  assert.equal(budget, 8192);
});

test('deriveResponseTokenBudget respects configured max tokens', () => {
  const budget = deriveResponseTokenBudget('glm-4.7', 2048, 1280, 0);
  assert.equal(budget, 2048);
});

test('deriveResponseTokenBudget accounts for tool definitions overhead', () => {
  const withoutTools = deriveResponseTokenBudget('glm-4.7', undefined, 100000, 0);
  const withTools = deriveResponseTokenBudget('glm-4.7', undefined, 100000, 10);
  assert.ok(withTools <= withoutTools, 'Tools add overhead so budget should not exceed without-tools budget');
});

test('deriveResponseTokenBudget never returns less than 256 tokens', () => {
  const budget = deriveResponseTokenBudget('gpt-4', undefined, 7000, 0);
  assert.ok(budget >= 256, `Expected budget >= 256, got ${budget}`);
});

test('deriveResponseTokenBudget uses large context tiers for deepseek-chat just above 50% usage', () => {
  // deepseek-chat is 64K context; ratio > 0.5 (33000/64000=0.515) → tier 8192
  const budget = deriveResponseTokenBudget('deepseek-chat', undefined, 33000, 0);
  assert.equal(budget, 8192);
});

test('deriveResponseTokenBudget respects context window upper limit', () => {
  const budget = deriveResponseTokenBudget('glm-4.7', 65536, 120000, 0);
  // Should be limited by remaining context (128K - 120K - 512 buffer = 7488)
  assert.ok(budget < 8000, `Expected budget < 8000, got ${budget}`);
});

test('deriveResponseTokenBudget falls back gracefully for unknown model', () => {
  const budget = deriveResponseTokenBudget('totally-unknown-model', undefined, 5000, 0);
  assert.ok(budget >= 256, `Expected budget >= 256, got ${budget}`);
  assert.ok(budget <= 4096, `Expected budget <= 4096, got ${budget}`);
});

test('supportsContextSize returns true for glm-4.7 with 100K tokens', () => {
  assert.equal(supportsContextSize('glm-4.7', 100000), true);
});

test('supportsContextSize returns false for gpt-4 with 100K tokens', () => {
  assert.equal(supportsContextSize('gpt-4', 100000), false);
});

test('supportsContextSize returns true for gemini-1.5-pro with 1M tokens', () => {
  assert.equal(supportsContextSize('gemini-1.5-pro', 1000000), true);
});

test('getModelDescription contains model name and context for glm-4.7', () => {
  const desc = getModelDescription('glm-4.7');
  assert.ok(desc.includes('glm-4.7'), `Expected description to include 'glm-4.7', got: ${desc}`);
  assert.ok(desc.includes('128,000'), `Expected description to include '128,000', got: ${desc}`);
});

test('getModelDescription works for unknown model', () => {
  const desc = getModelDescription('unknown');
  assert.ok(typeof desc === 'string' && desc.length > 0);
});

test('KNOWN_MODELS includes all GLM-4.7 variants', () => {
  const models = Object.keys(KNOWN_MODELS);
  assert.ok(models.includes('glm-4.7'), 'Should include glm-4.7');
  assert.ok(models.includes('glm-4.7-flash'), 'Should include glm-4.7-flash');
  assert.ok(models.includes('glm-4.7-plus'), 'Should include glm-4.7-plus');
});

test('KNOWN_MODELS includes major OpenAI models', () => {
  const models = Object.keys(KNOWN_MODELS);
  assert.ok(models.includes('gpt-4o'));
  assert.ok(models.includes('gpt-4o-mini'));
  assert.ok(models.includes('o1'));
  assert.ok(models.includes('o3-mini'));
});

test('KNOWN_MODELS includes major Gemini models', () => {
  const models = Object.keys(KNOWN_MODELS);
  assert.ok(models.includes('gemini-1.5-pro'));
  assert.ok(models.includes('gemini-1.5-flash'));
  assert.ok(models.includes('gemini-2.0-flash'));
});

test('KNOWN_MODELS includes DeepSeek models', () => {
  const models = Object.keys(KNOWN_MODELS);
  assert.ok(models.includes('deepseek-chat'));
  assert.ok(models.includes('deepseek-reasoner'));
});

test('KNOWN_MODELS includes Anthropic models', () => {
  const models = Object.keys(KNOWN_MODELS);
  assert.ok(models.includes('claude-3-opus'));
  assert.ok(models.includes('claude-3-5-sonnet'));
  assert.ok(models.includes('claude-3-7-sonnet'));
});

test('DEFAULT_MODEL_CONFIG has conservative 8192 context window', () => {
  assert.equal(DEFAULT_MODEL_CONFIG.contextWindow, 8192);
  assert.equal(DEFAULT_MODEL_CONFIG.defaultMaxTokens, 4096);
});
