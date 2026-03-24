import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillLoader, SkillInstaller } from '../dist/index.js';

test('SkillLoader imports skill implementations from absolute paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tzukwan-skill-'));
  const skillDir = path.join(root, 'demo-skill');

  try {
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---
name: demo-skill
version: 1.0.0
description: Demo skill
---

## Commands
- \`run\`
`, 'utf8');
    await fs.writeFile(path.join(skillDir, 'index.mjs'), `export const commands = [
  {
    name: 'run',
    description: 'real implementation',
    execute: async () => 'ok',
  },
];
`, 'utf8');

    const loader = new SkillLoader();
    const skill = await loader.loadSkill(skillDir);

    assert.equal(skill.commands.length, 1);
    assert.equal(skill.commands[0].description, 'real implementation');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// Helper to resolve builtin skill path
function getBuiltinSkillPath(name) {
  // test file lives at packages/skills/test/loader.test.js
  // builtin skills are at <monorepo-root>/skills/<name>/
  // Go up 4 levels: test/ -> skills/ -> packages/ -> <root>
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = path.resolve(thisFile, '..', '..', '..', '..');
  return path.join(pkgRoot, 'skills', name);
}

test('literature-review search command exists and is callable', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('literature-review');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);
  const searchCmd = skill.commands.find(c => c.name === 'search');
  assert.ok(searchCmd, 'search command should exist');
  assert.strictEqual(typeof searchCmd.execute, 'function');
});

test('arxiv monitor command exists', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('arxiv');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);
  const monitorCmd = skill.commands.find(c => c.name === 'monitor');
  assert.ok(monitorCmd, 'monitor command should exist');
});

test('ml-research pipeline command exists', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('ml-research');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);
  const pipelineCmd = skill.commands.find(c => c.name === 'pipeline');
  assert.ok(pipelineCmd, 'pipeline command should exist');
});

// ============================================================================
// Integration Tests with Mock LLM Client
// ============================================================================

/**
 * Create a mock LLM context for testing
 */
function createMockContext(llmResponse = 'Test response') {
  return {
    llmClient: {
      async chat(messages) {
        return { content: llmResponse };
      }
    },
    config: {
      research: {
        defaultLanguage: 'en',
        preferredSources: [],
        datasetCategories: [],
        citationStyle: 'APA',
      },
      rules: [],
    },
    workDir: process.cwd(),
  };
}

/**
 * Create a mock LLM context that returns JSON responses
 */
function createMockContextWithJSON(jsonResponse) {
  return {
    llmClient: {
      async chat(messages) {
        return { content: JSON.stringify(jsonResponse) };
      }
    },
    config: {
      research: {
        defaultLanguage: 'en',
        preferredSources: [],
        datasetCategories: [],
        citationStyle: 'APA',
      },
      rules: [],
    },
    workDir: process.cwd(),
  };
}

test('dataset-hub recommend command returns result with mock LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('dataset-hub');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);

  const recommendCmd = skill.commands.find(c => c.name === 'recommend');
  assert.ok(recommendCmd, 'recommend command should exist');
  assert.strictEqual(typeof recommendCmd.execute, 'function');

  // Test with mock LLM that returns JSON recommendations
  const mockLLMResponse = [
    { name: 'MNIST', reason: 'Good for image classification testing' },
    { name: 'CIFAR-10', reason: 'Standard computer vision benchmark' }
  ];
  const ctx = createMockContextWithJSON(mockLLMResponse);

  const result = await recommendCmd.execute({ topic: 'image classification', type: 'research' }, ctx);

  assert.ok(result, 'Should return a result');
  assert.ok(result.topic, 'Result should have topic');
  assert.ok(result.recommendations, 'Result should have recommendations');
  assert.ok(Array.isArray(result.recommendations), 'Recommendations should be an array');
  assert.ok(result.recommendations.length > 0, 'Should have at least one recommendation');
});

test('dataset-hub recommend command falls back to keyword matching without LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('dataset-hub');
  const skill = await loader.loadSkill(skillDir);

  const recommendCmd = skill.commands.find(c => c.name === 'recommend');

  // Test without LLM (no context or null llmClient)
  const result = await recommendCmd.execute({ topic: 'computer vision', type: 'research' }, {});

  assert.ok(result, 'Should return a result');
  assert.strictEqual(result.topic, 'computer vision');
  assert.ok(result.recommendations, 'Result should have recommendations');
  assert.strictEqual(result.method, 'keyword-matching', 'Should use keyword matching fallback');
});

test('literature-review gaps command returns result with mock LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('literature-review');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);

  const gapsCmd = skill.commands.find(c => c.name === 'gaps');
  assert.ok(gapsCmd, 'gaps command should exist');
  assert.strictEqual(typeof gapsCmd.execute, 'function');

  // Test with mock LLM
  const mockLLMResponse = {
    gaps: ['Limited evaluation on real-world datasets', 'No comparison with recent methods'],
    opportunities: ['Apply to multi-modal settings', 'Explore transfer learning approaches']
  };
  const ctx = createMockContextWithJSON(mockLLMResponse);

  const mockPapers = [
    {
      id: '2401.001',
      title: 'Test Paper 1',
      authors: ['Author A', 'Author B'],
      abstract: 'This is a test abstract about machine learning',
      published: '2024-01-01'
    },
    {
      id: '2401.002',
      title: 'Test Paper 2',
      authors: ['Author C'],
      abstract: 'Another test abstract about deep learning',
      published: '2024-02-01'
    }
  ];

  const result = await gapsCmd.execute({ topic: 'machine learning', papers: mockPapers }, ctx);

  assert.ok(result, 'Should return a result');
  assert.ok(result.gaps, 'Result should have gaps');
  assert.ok(result.opportunities, 'Result should have opportunities');
  assert.ok(Array.isArray(result.gaps), 'Gaps should be an array');
  assert.ok(Array.isArray(result.opportunities), 'Opportunities should be an array');
});

test('literature-review gaps command falls back to heuristic without LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('literature-review');
  const skill = await loader.loadSkill(skillDir);

  const gapsCmd = skill.commands.find(c => c.name === 'gaps');

  const mockPapers = [
    {
      id: '2401.001',
      title: 'Test Paper 1',
      authors: ['Author A', 'Author B'],
      abstract: 'This is a test abstract about machine learning',
      published: '2024-01-01'
    }
  ];

  // Test without LLM
  const result = await gapsCmd.execute({ topic: 'machine learning', papers: mockPapers }, {});

  assert.ok(result, 'Should return a result');
  assert.ok(result.gaps, 'Result should have gaps');
  assert.ok(result.opportunities, 'Result should have opportunities');
  assert.ok(Array.isArray(result.gaps), 'Gaps should be an array');
  assert.ok(Array.isArray(result.opportunities), 'Opportunities should be an array');
});

test('arxiv analyze command works without LLM (no-LLM fallback)', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('arxiv');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);

  const analyzeCmd = skill.commands.find(c => c.name === 'analyze');
  assert.ok(analyzeCmd, 'analyze command should exist');
  assert.strictEqual(typeof analyzeCmd.execute, 'function');

  // Test without LLM - should return fallback result
  // Note: This will try to fetch from arXiv API, so we test the error/fallback path
  const result = await analyzeCmd.execute({ id: '0000.00000', aspects: 'contributions' }, {});

  // Should either return error (if paper not found) or fallback result
  assert.ok(result, 'Should return a result');
  assert.ok(result.paper || result.error, 'Should have paper data or error');
});

test('experiment decide command returns REFINE/COMPLETE decision', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('experiment');
  const skill = await loader.loadSkill(skillDir);
  assert.ok(skill);

  const decideCmd = skill.commands.find(c => c.name === 'decide');
  assert.ok(decideCmd, 'decide command should exist');
  assert.strictEqual(typeof decideCmd.execute, 'function');

  // Test with results that meet targets (should return COMPLETE)
  const results = {
    accuracy: 0.95,
    precision: 0.94,
    recall: 0.93
  };
  const targets = {
    accuracy: 0.90,
    precision: 0.90,
    recall: 0.90
  };

  const result = await decideCmd.execute({ results, targets }, {});

  assert.ok(result, 'Should return a result');
  assert.ok(result.decision, 'Result should have decision');
  assert.ok(['COMPLETE', 'REFINE', 'PIVOT'].includes(result.decision), 'Decision should be valid');
  assert.ok(result.reason, 'Result should have reason');
  assert.ok(result.comparisons, 'Result should have comparisons');
  assert.ok(result.suggestions, 'Result should have suggestions');
  assert.ok(Array.isArray(result.suggestions), 'Suggestions should be an array');
  assert.strictEqual(result.decision, 'COMPLETE', 'Should return COMPLETE when all targets met');
});

test('experiment decide command returns PIVOT when critical gaps with no improvement', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('experiment');
  const skill = await loader.loadSkill(skillDir);

  const decideCmd = skill.commands.find(c => c.name === 'decide');

  // Test with results that have critical gaps (>15%) and no improvement history (should return PIVOT)
  const results = {
    accuracy: 0.75,
    precision: 0.74
  };
  const targets = {
    accuracy: 0.90,
    precision: 0.90
  };

  const result = await decideCmd.execute({ results, targets }, {});

  assert.ok(result, 'Should return a result');
  assert.ok(result.decision, 'Result should have decision');
  assert.strictEqual(result.decision, 'PIVOT', 'Should return PIVOT when critical gaps with no improvement');
  assert.ok(result.suggestions.length > 0, 'Should have suggestions for pivot');
});

test('experiment decide command returns REFINE when targets not met but improving', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('experiment');
  const skill = await loader.loadSkill(skillDir);

  const decideCmd = skill.commands.find(c => c.name === 'decide');

  // Test with results that don't meet targets but show improvement trend (should return REFINE)
  const results = {
    accuracy: 0.85,
    precision: 0.84
  };
  const targets = {
    accuracy: 0.90,
    precision: 0.90
  };
  const history = [
    { accuracy: 0.80, precision: 0.79 },
    { accuracy: 0.83, precision: 0.82 }
  ];

  const result = await decideCmd.execute({ results, targets, history }, {});

  assert.ok(result, 'Should return a result');
  assert.ok(result.decision, 'Result should have decision');
  assert.strictEqual(result.decision, 'REFINE', 'Should return REFINE when improving toward targets');
  assert.ok(result.suggestions.length > 0, 'Should have suggestions for improvement');
});

test('experiment design command returns result with mock LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('experiment');
  const skill = await loader.loadSkill(skillDir);

  const designCmd = skill.commands.find(c => c.name === 'design');
  assert.ok(designCmd, 'design command should exist');

  const ctx = createMockContext('# Experiment Design: Image Classification\n\n## 1. Research Hypothesis...');

  const result = await designCmd.execute({
    task: 'image classification',
    datasets: ['MNIST', 'CIFAR-10'],
    metrics: ['accuracy', 'precision', 'recall']
  }, ctx);

  assert.ok(result, 'Should return a result');
  assert.strictEqual(typeof result, 'string', 'Result should be a string (design document)');
  assert.ok(result.includes('Experiment Design') || result.includes('Research Hypothesis'), 'Should contain design content');
});

test('experiment design command falls back to template without LLM', async () => {
  const loader = new SkillLoader();
  const skillDir = getBuiltinSkillPath('experiment');
  const skill = await loader.loadSkill(skillDir);

  const designCmd = skill.commands.find(c => c.name === 'design');

  // Test without LLM
  const result = await designCmd.execute({
    task: 'sentiment analysis',
    datasets: ['IMDB Reviews'],
    metrics: ['accuracy', 'f1-score']
  }, {});

  assert.ok(result, 'Should return a result');
  assert.strictEqual(typeof result, 'string', 'Result should be a string');
  assert.ok(result.includes('Experiment Design'), 'Should contain design header');
  assert.ok(result.includes('Research Hypothesis'), 'Should contain hypothesis section');
});

// ============================================================================
// SkillInstaller unit tests
// ============================================================================

async function withTempSkillsDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tzukwan-installer-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function createLocalSkill(dir, name, version = '1.0.0') {
  const skillDir = path.join(dir, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---
name: ${name}
version: ${version}
description: Test skill for installer tests
---

## Commands
- \`run\` - Run the skill
`, 'utf8');
  await fs.writeFile(path.join(skillDir, 'index.mjs'), `export const commands = [
  { name: 'run', description: 'Run', execute: async () => 'ok' }
];
`, 'utf8');
  return skillDir;
}

test('SkillInstaller install from local path and list', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const sourceDir = path.join(tmpDir, 'source');
    const installDir = path.join(tmpDir, 'installed');

    // Create source skill
    await createLocalSkill(sourceDir, 'my-skill');
    const installer = new SkillInstaller(installDir);

    await installer.install(path.join(sourceDir, 'my-skill'));

    const skills = await installer.list();
    assert.equal(skills.length, 1, 'Should have 1 installed skill');
    assert.equal(skills[0].name, 'my-skill');
    assert.equal(skills[0].version, '1.0.0');
    assert.ok(skills[0].installDir, 'Should have installDir');
    assert.ok(skills[0].installedAt, 'Should have installedAt timestamp');
  });
});

test('SkillInstaller uninstall removes skill', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const sourceDir = path.join(tmpDir, 'source');
    const installDir = path.join(tmpDir, 'installed');

    await createLocalSkill(sourceDir, 'removable-skill');
    const installer = new SkillInstaller(installDir);

    await installer.install(path.join(sourceDir, 'removable-skill'));
    assert.equal((await installer.list()).length, 1);

    await installer.uninstall('removable-skill');
    assert.equal((await installer.list()).length, 0, 'Skill should be removed');
  });
});

test('SkillInstaller uninstall rejects invalid names (path traversal)', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const installer = new SkillInstaller(tmpDir);

    await assert.rejects(
      () => installer.uninstall('../../../etc/passwd'),
      /Invalid skill name/,
      'Should reject path traversal in skill name'
    );

    await assert.rejects(
      () => installer.uninstall('../../sensitive'),
      /Invalid skill name/,
      'Should reject relative path traversal'
    );
  });
});

test('SkillInstaller install throws if skill already installed', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const sourceDir = path.join(tmpDir, 'source');
    const installDir = path.join(tmpDir, 'installed');

    await createLocalSkill(sourceDir, 'duplicate-skill');
    const installer = new SkillInstaller(installDir);

    await installer.install(path.join(sourceDir, 'duplicate-skill'));

    await assert.rejects(
      () => installer.install(path.join(sourceDir, 'duplicate-skill')),
      /already exists/,
      'Should throw error when skill already installed'
    );
  });
});

test('SkillInstaller install throws if SKILL.md missing', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const sourceDir = path.join(tmpDir, 'source');
    const installDir = path.join(tmpDir, 'installed');

    // Create a directory without SKILL.md
    const badSkillDir = path.join(sourceDir, 'bad-skill');
    await fs.mkdir(badSkillDir, { recursive: true });
    await fs.writeFile(path.join(badSkillDir, 'index.mjs'), '// no SKILL.md', 'utf8');

    const installer = new SkillInstaller(installDir);

    await assert.rejects(
      () => installer.install(badSkillDir),
      /SKILL\.md/,
      'Should throw error when SKILL.md is missing'
    );
  });
});

test('SkillInstaller list returns empty array when no skills installed', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const installer = new SkillInstaller(path.join(tmpDir, 'empty'));
    const skills = await installer.list();
    assert.deepEqual(skills, [], 'Should return empty array for empty directory');
  });
});

test('SkillInstaller installOrUpdate updates if already installed', async () => {
  await withTempSkillsDir(async (tmpDir) => {
    const sourceDir = path.join(tmpDir, 'source');
    const installDir = path.join(tmpDir, 'installed');

    await createLocalSkill(sourceDir, 'update-skill', '1.0.0');
    const installer = new SkillInstaller(installDir);

    // First install
    await installer.installOrUpdate(path.join(sourceDir, 'update-skill'));
    const v1 = await installer.list();
    assert.equal(v1[0].version, '1.0.0');

    // Update the source to v2.0.0
    await fs.writeFile(path.join(sourceDir, 'update-skill', 'SKILL.md'), `---
name: update-skill
version: 2.0.0
description: Updated test skill
---

## Commands
- \`run\` - Run the skill
`, 'utf8');

    // installOrUpdate should update
    await installer.installOrUpdate(path.join(sourceDir, 'update-skill'));
    const v2 = await installer.list();
    assert.equal(v2.length, 1, 'Should still have 1 skill');
    assert.equal(v2[0].version, '2.0.0', 'Version should be updated to 2.0.0');
  });
});

test('SkillRegistry discovers newly added built-in skills', async () => {
  const { SkillRegistry } = await import('../dist/index.js');
  SkillRegistry.resetInstance();
  const registry = SkillRegistry.getInstance();
  await registry.initializeDefault(path.resolve('.'));
  const names = registry.list().map((skill) => skill.name);
  assert.ok(names.includes('svg-science'));
  assert.ok(names.includes('econometrics'));
  assert.ok(names.includes('simulation-lab'));
  assert.ok(names.includes('browser-ops'));
  assert.ok(names.includes('dev-workflow'));
});
