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
    name: 'abm_plan',
    description: 'Generate an agent-based modeling plan for computational social science studies.',
    execute: async (args) => {
      const topic = String(args.topic ?? 'diffusion dynamics');
      const agents = Array.isArray(args.agents) ? args.agents.map(String) : ['households', 'firms', 'regulators'];
      const content = [
        '# Agent-Based Modeling Plan',
        `- Topic: ${topic}`,
        `- Agent classes: ${agents.join(', ')}`,
        '- State variables: define stocks, beliefs, and adaptation rules per agent class.',
        '- Interaction structure: specify network, geography, or market-matching assumptions.',
        '- Calibration: identify empirical moments and plausible parameter bounds.',
        '- Validation: replicate stylized facts, sensitivity analysis, and intervention counterfactuals.',
      ].join('\n');
      const outputPath = String(args.outputPath ?? './simulation/abm-plan.md');
      return { path: ensureOutput(outputPath, content), topic, agents };
    },
  },
  {
    name: 'behaviorspace_spec',
    description: 'Generate a NetLogo BehaviorSpace XML spec template.',
    execute: async (args) => {
      const experiment = String(args.experiment ?? 'sweep');
      const metric = String(args.metric ?? 'count turtles');
      const parameter = String(args.parameter ?? 'density');
      const values = Array.isArray(args.values) && args.values.length > 0 ? args.values.map(String) : ['0.1', '0.2', '0.3'];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<experiments>\n  <experiment name="${experiment}" repetitions="10" runMetricsEveryStep="false">\n    <setup>setup</setup>\n    <go>go</go>\n    <metric>${metric}</metric>\n    <enumeratedValueSet variable="${parameter}">\n${values.map((value) => `      <value value="${value}"/>`).join('\n')}\n    </enumeratedValueSet>\n  </experiment>\n</experiments>\n`;
      const outputPath = String(args.outputPath ?? `./simulation/${experiment}.xml`);
      return { path: ensureOutput(outputPath, xml), experiment, parameter, values };
    },
  },
  {
    name: 'netlogo_command',
    description: 'Construct a headless NetLogo command string for an experiment run.',
    execute: async (args) => {
      const modelPath = String(args.modelPath ?? './model.nlogo');
      const experiment = String(args.experiment ?? 'sweep');
      const table = String(args.table ?? './output/results.csv');
      const command = `netlogo-headless --model "${modelPath}" --experiment "${experiment}" --table "${table}"`;
      return { command, modelPath, experiment, table };
    },
  },
];
