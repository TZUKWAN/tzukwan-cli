import fs from 'fs';
import path from 'path';

function ensureOutput(outputPath, content) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return resolved;
}

export const commands = [
  {
    name: 'patch_plan',
    description: 'Generate a concise patch plan for an engineering task.',
    execute: async (args) => {
      const objective = String(args.objective ?? 'Implement requested feature');
      const modules = Array.isArray(args.modules) ? args.modules.map(String) : ['runtime', 'ui', 'tests'];
      const content = [
        '# Patch Plan',
        `- Objective: ${objective}`,
        `- Modules: ${modules.join(', ')}`,
        '- Steps: inspect call sites, isolate write set, implement change, verify behavior, add regression tests.',
        '- Risks: config drift, hidden state mutation, incomplete integration, missing back-compat path.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './dev/patch-plan.md');
      return { path: ensureOutput(outputPath, content), objective, modules };
    },
  },
  {
    name: 'test_matrix',
    description: 'Generate a targeted test matrix for a code change.',
    execute: async (args) => {
      const feature = String(args.feature ?? 'feature');
      const content = [
        '# Test Matrix',
        `- Target feature: ${feature}`,
        '| Layer | Scenario | Expected |',
        '| --- | --- | --- |',
        '| Unit | happy path | deterministic success |',
        '| Unit | invalid input | explicit error |',
        '| Integration | config reload | state refreshes correctly |',
        '| Regression | old workflow | no behavior breakage |',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './dev/test-matrix.md');
      return { path: ensureOutput(outputPath, content), feature };
    },
  },
  {
    name: 'release_checklist',
    description: 'Generate a release or deployment readiness checklist.',
    execute: async (args) => {
      const version = String(args.version ?? 'next');
      const content = [
        '# Release Checklist',
        `- Version: ${version}`,
        '- Build passes on clean workspace.',
        '- Unit and integration tests pass.',
        '- Config migrations verified.',
        '- User-visible docs and screenshots updated.',
        '- Rollback path documented.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './dev/release-checklist.md');
      return { path: ensureOutput(outputPath, content), version };
    },
  },
];
