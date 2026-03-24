#!/usr/bin/env node

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT, '.production-readiness-state.json');

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const spawnOptions = {
      cwd: ROOT,
      shell: false,
      ...options,
    };
    const quote = (value) => /[\s"]/u.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : String(value);
    const child = process.platform === 'win32'
      ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', [command, ...args].map(quote).join(' ')],
        spawnOptions,
      )
      : spawn(command, args, spawnOptions);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}`.trim() }));
  });
}

function issueKey(issue) {
  return [issue.category ?? '', issue.title ?? '', issue.file ?? ''].join('::');
}

function detectOpenIssues() {
  const issues = [];

  const paperFactoryPath = path.join(ROOT, 'packages/research/src/paper-factory/index.ts');
  if (fs.existsSync(paperFactoryPath)) {
    const content = fs.readFileSync(paperFactoryPath, 'utf-8');
    if (!content.includes('function stripReasoningBlocks') || !content.includes('stripReasoningBlocks(response.content')) {
      issues.push({
        severity: 'critical',
        category: 'data-integrity',
        title: 'Paper generation think-block stripping is incomplete',
        description: 'PaperFactory must strip reasoning blocks from generated content before writing files.',
        file: 'packages/research/src/paper-factory/index.ts',
        fix: 'Keep stripReasoningBlocks() on all generated prose/code write paths.',
      });
    }
  }

  const webPath = path.join(ROOT, 'packages/cli/src/web.ts');
  if (fs.existsSync(webPath)) {
    const content = fs.readFileSync(webPath, 'utf-8');
    if (!content.includes('validation-panel') || !content.includes('paperValidation')) {
      issues.push({
        severity: 'high',
        category: 'ux',
        title: 'Web UI does not expose strict paper validation details',
        description: 'The web client should display strict validation status, checklist, and evidence paths for the active paper.',
        file: 'packages/cli/src/web.ts',
        fix: 'Render a dedicated Paper Validation panel from the runtime state payload.',
      });
    }
  }

  const tuiPath = path.join(ROOT, 'packages/cli/src/tui-repl.ts');
  if (fs.existsSync(tuiPath)) {
    const content = fs.readFileSync(tuiPath, 'utf-8');
    if (!content.includes('buildValidationSummaryLines') || !content.includes('Strict:')) {
      issues.push({
        severity: 'medium',
        category: 'ux',
        title: 'TUI does not expose strict paper validation summary',
        description: 'The TUI should surface active paper validation failures without requiring users to inspect JSON files manually.',
        file: 'packages/cli/src/tui-repl.ts',
        fix: 'Show strict validation summary in the conversation pane or a dedicated overlay.',
      });
    }
  }

  const httpUtilsPath = path.join(ROOT, 'packages/research/src/shared/http-utils.ts');
  if (fs.existsSync(httpUtilsPath)) {
    const content = fs.readFileSync(httpUtilsPath, 'utf-8');
    if (!content.includes('TZUKWAN_DEBUG_HTTP')) {
      issues.push({
        severity: 'medium',
        category: 'logging',
        title: 'HTTP retry attempts are too noisy by default',
        description: 'Per-attempt retry logs should be suppressed unless debug mode is enabled.',
        file: 'packages/research/src/shared/http-utils.ts',
        fix: 'Gate verbose retry logs behind a debug flag.',
      });
    }
  }

  const deduped = new Map();
  for (const issue of issues) {
    deduped.set(issueKey(issue), issue);
  }
  return Array.from(deduped.values());
}

function summarizeFailure(result) {
  return (result.stderr || result.stdout || 'Command failed').trim().slice(0, 4000);
}

function buildTestResult(name, command, args, result, severity = 'critical') {
  return {
    name,
    command: `${command} ${args.join(' ')}`.trim(),
    status: result.code === 0 ? 'passed' : 'failed',
    code: result.code,
    recordedAt: nowIso(),
    output: summarizeFailure(result),
    severity,
  };
}

async function main() {
  const previous = readJson(STATE_PATH, {});
  const startedAt = nowIso();

  const checks = [
    { name: 'build', command: 'npm', args: ['run', 'build'], severity: 'critical' },
    { name: 'core-tests', command: 'npm', args: ['test', '--workspace', '@tzukwan/core'], severity: 'high' },
    { name: 'research-tests', command: 'npm', args: ['test', '--workspace', '@tzukwan/research'], severity: 'high' },
    { name: 'cli-help', command: 'node', args: ['./bin/tzukwan.mjs', '--help'], severity: 'medium' },
  ];

  const testResults = [];
  for (const check of checks) {
    const result = await runCommand(check.command, check.args);
    testResults.push(buildTestResult(check.name, check.command, check.args, result, check.severity));
  }

  const failedChecks = testResults.filter((result) => result.status === 'failed');
  const testPassRate = testResults.length === 0
    ? 0
    : ((testResults.length - failedChecks.length) / testResults.length) * 100;

  const openIssues = detectOpenIssues();
  for (const check of failedChecks) {
    openIssues.push({
      severity: check.severity,
      category: 'test-failure',
      title: `Check failed: ${check.name}`,
      description: check.output || `${check.command} failed`,
      fix: `Restore a passing result for "${check.command}".`,
    });
  }

  const dedupedOpen = new Map();
  for (const issue of openIssues) {
    dedupedOpen.set(issueKey(issue), {
      ...issue,
      id: `ISSUE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'open',
      createdAt: startedAt,
    });
  }
  const finalOpenIssues = Array.from(dedupedOpen.values());

  const previousOpenKeys = new Set((previous.issues || []).map(issueKey));
  const currentOpenKeys = new Set(finalOpenIssues.map(issueKey));
  const fixedIssueMap = new Map();
  for (const issue of Array.isArray(previous.fixedIssues) ? previous.fixedIssues : []) {
    fixedIssueMap.set(issueKey(issue), issue);
  }
  for (const issue of (previous.issues || []).filter((entry) => !currentOpenKeys.has(issueKey(entry)))) {
    fixedIssueMap.set(issueKey(issue), {
      ...issue,
      status: 'fixed',
      fixedAt: startedAt,
    });
  }
  const fixedIssues = Array.from(fixedIssueMap.values());

  const criticalCount = finalOpenIssues.filter((issue) => issue.severity === 'critical').length;
  const highCount = finalOpenIssues.filter((issue) => issue.severity === 'high').length;
  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        testPassRate * 0.55
        + (criticalCount === 0 ? 20 : 0)
        + (highCount <= 2 ? 10 : 0)
        + (finalOpenIssues.length === 0 ? 15 : Math.max(0, 15 - finalOpenIssues.length * 2))
      )
    )
  );

  const isProductionReady = criticalCount === 0 && highCount <= 2 && testPassRate >= 95 && qualityScore >= 85;

  const state = {
    iteration: (previous.iteration ?? 0) + 1,
    issues: finalOpenIssues,
    fixedIssues,
    testResults,
    qualityScore,
    isProductionReady,
    lastAuditTime: startedAt,
    lastTestTime: startedAt,
    loopMetrics: {
      totalLoops: (previous.loopMetrics?.totalLoops ?? 0) + 1,
      issuesFound: finalOpenIssues.length,
      issuesFixed: fixedIssues.length,
      testRuns: (previous.loopMetrics?.testRuns ?? 0) + testResults.length,
      testPassRate,
    },
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');

  console.log(`Production readiness state updated: ${STATE_PATH}`);
  console.log(`Open issues: ${finalOpenIssues.length}`);
  console.log(`Quality score: ${qualityScore}`);
  console.log(`Production ready: ${isProductionReady ? 'YES' : 'NO'}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
