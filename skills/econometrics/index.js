import fs from 'fs';
import path from 'path';

function ensureOutput(outputPath, content) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return resolved;
}

function toSlug(value) {
  return String(value ?? 'analysis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'analysis';
}

export const commands = [
  {
    name: 'did_scaffold',
    description: 'Generate Stata and R scaffolds for a difference-in-differences study.',
    execute: async (args) => {
      const treatment = String(args.treatment ?? 'treated');
      const outcome = String(args.outcome ?? 'outcome');
      const unit = String(args.unit ?? 'unit_id');
      const time = String(args.time ?? 'year');
      const baseDir = path.resolve(String(args.outputDir ?? `./econ/${toSlug(outcome)}-did`));
      fs.mkdirSync(baseDir, { recursive: true });
      const stata = [
        `* Difference-in-differences scaffold`,
        `use "data.dta", clear`,
        `xtset ${unit} ${time}`,
        `gen post = ${time} >= 0`,
        `reghdfe ${outcome} i.${treatment}##i.post, absorb(${unit} ${time}) vce(cluster ${unit})`,
        `estimates store did_main`,
      ].join('\n');
      const r = [
        '# Difference-in-differences scaffold',
        'library(fixest)',
        'df <- read.csv("data.csv")',
        `df$post <- as.integer(df$${time} >= 0)`,
        `model <- feols(${outcome} ~ i(${treatment}, post, ref = 0) | ${unit} + ${time}, cluster = ~${unit}, data = df)`,
        'summary(model)',
      ].join('\n');
      const stataPath = ensureOutput(path.join(baseDir, 'did_analysis.do'), stata);
      const rPath = ensureOutput(path.join(baseDir, 'did_analysis.R'), r);
      return { outputDir: baseDir, files: [stataPath, rPath] };
    },
  },
  {
    name: 'event_study_scaffold',
    description: 'Generate event-study scaffolds for dynamic treatment effects.',
    execute: async (args) => {
      const treatmentTime = String(args.treatmentTime ?? 'event_time');
      const outcome = String(args.outcome ?? 'outcome');
      const unit = String(args.unit ?? 'unit_id');
      const time = String(args.time ?? 'year');
      const baseDir = path.resolve(String(args.outputDir ?? `./econ/${toSlug(outcome)}-event-study`));
      fs.mkdirSync(baseDir, { recursive: true });
      const stata = [
        '* Event-study scaffold',
        'use "data.dta", clear',
        `xtset ${unit} ${time}`,
        `eventstudyinteract ${outcome} ${treatmentTime}, absorb(${unit} ${time}) vce(cluster ${unit})`,
      ].join('\n');
      const plan = [
        '# Event Study Plan',
        `- Outcome: ${outcome}`,
        `- Unit fixed effects: ${unit}`,
        `- Time fixed effects: ${time}`,
        `- Treatment timing variable: ${treatmentTime}`,
        '- Check parallel trends with pre-treatment coefficients.',
        '- Report clustering level and cohort composition.',
      ].join('\n');
      const stataPath = ensureOutput(path.join(baseDir, 'event_study.do'), stata);
      const planPath = ensureOutput(path.join(baseDir, 'event_study_plan.md'), plan);
      return { outputDir: baseDir, files: [stataPath, planPath] };
    },
  },
  {
    name: 'panel_model_plan',
    description: 'Write a panel-model specification plan with diagnostics and robustness checks.',
    execute: async (args) => {
      const outcome = String(args.outcome ?? 'outcome');
      const regressors = Array.isArray(args.regressors) ? args.regressors.map(String) : ['x1', 'x2', 'x3'];
      const content = [
        '# Panel Model Plan',
        `- Outcome: ${outcome}`,
        `- Core regressors: ${regressors.join(', ')}`,
        '- Baseline: two-way fixed effects with clustered standard errors.',
        '- Robustness: alternative clustering, winsorization, lag structures, placebo timing.',
        '- Diagnostics: missingness, leverage points, serial correlation, treatment heterogeneity.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? `./econ/${toSlug(outcome)}-panel-plan.md`);
      return { path: ensureOutput(outputPath, content), outcome, regressors };
    },
  },
];
