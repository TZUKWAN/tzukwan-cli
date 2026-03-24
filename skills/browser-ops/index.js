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
    name: 'task_spec',
    description: 'Generate a browser automation task specification.',
    execute: async (args) => {
      const goal = String(args.goal ?? 'Validate the target web workflow');
      const urls = Array.isArray(args.urls) ? args.urls.map(String) : [];
      const content = [
        '# Browser Automation Task Spec',
        `- Goal: ${goal}`,
        `- Target URLs: ${urls.length > 0 ? urls.join(', ') : 'to be supplied'}`,
        '- Preconditions: authenticated session state, stable selectors, output directory.',
        '- Execution steps: navigate, wait for stable DOM, interact, validate, capture artifacts.',
        '- Artifacts: screenshots, HTML snapshot, extracted JSON/CSV, console logs.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './browser/task-spec.md');
      return { path: ensureOutput(outputPath, content), goal, urls };
    },
  },
  {
    name: 'playwright_scaffold',
    description: 'Write a minimal Playwright script scaffold for a web workflow.',
    execute: async (args) => {
      const targetUrl = String(args.targetUrl ?? 'https://example.com');
      const outputPath = String(args.outputPath ?? './browser/playwright-flow.mjs');
      const script = [
        "import { chromium } from 'playwright';",
        '',
        '(async () => {',
        '  const browser = await chromium.launch({ headless: true });',
        '  const page = await browser.newPage();',
        `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'networkidle' });`,
        "  await page.screenshot({ path: 'page.png', fullPage: true });",
        '  console.log(await page.title());',
        '  await browser.close();',
        '})();',
      ].join('\n');
      return { path: ensureOutput(outputPath, script), targetUrl };
    },
  },
  {
    name: 'scrape_plan',
    description: 'Generate a browser-based scraping and validation plan.',
    execute: async (args) => {
      const site = String(args.site ?? 'target site');
      const fields = Array.isArray(args.fields) ? args.fields.map(String) : ['title', 'url', 'date'];
      const content = [
        '# Browser Scrape Plan',
        `- Site: ${site}`,
        `- Fields: ${fields.join(', ')}`,
        '- Use browser automation when static HTTP fetch is insufficient.',
        '- Add rate limiting, DOM fallbacks, pagination handling, and deduplication.',
        '- Save raw HTML, parsed rows, and extraction errors separately for auditability.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './browser/scrape-plan.md');
      return { path: ensureOutput(outputPath, content), site, fields };
    },
  },
];
