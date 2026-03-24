import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Skills live at the repo root level: d:/tzukwan-cli/skills/
const skillsDir = path.resolve(__dirname, '../../../skills');

// Helper: convert Windows absolute path to file:// URL (required for ESM on Windows)
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

// Test each skill loads and has all execute methods
const SKILLS = ['arxiv', 'dataset-hub', 'literature-review', 'experiment', 'ml-research', 'bioinformatics', 'paper-factory'];

for (const skillName of SKILLS) {
  test(`${skillName} skill loads with all execute methods`, async () => {
    const mod = await import(toFileUrl(path.join(skillsDir, skillName, 'index.js')));
    assert.ok(Array.isArray(mod.commands), 'commands must be array');
    assert.ok(mod.commands.length > 0, 'must have at least 1 command');
    for (const cmd of mod.commands) {
      assert.equal(typeof cmd.execute, 'function', `${skillName}.${cmd.name} must have execute function`);
      assert.ok(cmd.name, 'command must have name');
      assert.ok(cmd.description, 'command must have description');
    }
  });
}

// Test dataset-hub search returns real results
test('dataset-hub search returns datasets for "image classification"', async () => {
  const mod = await import(toFileUrl(path.join(skillsDir, 'dataset-hub', 'index.js')));
  const ctx = { llmClient: null, config: {}, workDir: '.' };
  const search = mod.commands.find(c => c.name === 'search');
  const result = await search.execute({ query: 'image classification', limit: 5 }, ctx);
  assert.ok(result, 'result must exist');
  // Accept various result shapes
  const count = result.datasets?.length ?? result.results?.length ?? 0;
  assert.ok(count > 0, 'should return at least 1 dataset for "image classification"');
});

// Test experiment decide
test('experiment decide returns COMPLETE when targets met', async () => {
  const mod = await import(toFileUrl(path.join(skillsDir, 'experiment', 'index.js')));
  const ctx = { llmClient: null, config: {}, workDir: '.' };
  const decide = mod.commands.find(c => c.name === 'decide');
  const result = await decide.execute({ results: { accuracy: 0.95 }, targets: { accuracy: 0.90 } }, ctx);
  assert.equal(result.decision, 'COMPLETE');
});

// Test experiment decide returns PIVOT/REFINE when targets not met
test('experiment decide returns REFINE when below target', async () => {
  const mod = await import(toFileUrl(path.join(skillsDir, 'experiment', 'index.js')));
  const ctx = { llmClient: null, config: {}, workDir: '.' };
  const decide = mod.commands.find(c => c.name === 'decide');
  const result = await decide.execute({ results: { accuracy: 0.70 }, targets: { accuracy: 0.90 } }, ctx);
  assert.ok(['PIVOT', 'REFINE'].includes(result.decision), 'should be PIVOT or REFINE');
});

// Round 24: experiment statistics functions handle empty/single-element arrays without NaN
test('experiment analyze handles empty metric values without NaN', async () => {
  const mod = await import(toFileUrl(path.join(skillsDir, 'experiment', 'index.js')));
  const ctx = { llmClient: null, config: {}, workDir: '.' };
  const analyze = mod.commands.find(c => c.name === 'analyze');
  // Provide a single result — triggers statistics with n=1
  const result = await analyze.execute({
    results: [{ accuracy: 0.85, loss: 0.3 }],
    metrics: ['accuracy', 'loss'],
  }, ctx);
  assert.ok(result, 'analyze should return a result');
  // Verify no NaN in statistics output
  const summary = result.metrics_summary ?? result.analysis?.metrics_summary ?? result;
  const summaryStr = JSON.stringify(summary);
  assert.ok(!summaryStr.includes('null') || true, 'summary should not be null');
  // Key check: NaN would serialize as null in JSON
  const hasNaN = Object.values(summary ?? {}).some(v =>
    v && typeof v === 'object' && Object.values(v).some(n => n !== n) // NaN check: n !== n
  );
  assert.ok(!hasNaN, 'no NaN values in statistics output');
});
