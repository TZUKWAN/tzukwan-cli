import fs from 'fs';
import path from 'path';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, width = 18) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function ensureOutput(outputPath, content) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return resolved;
}

function renderCard(x, y, width, title, bodyLines, accent = '#1f4e79') {
  const lineHeight = 24;
  const headerHeight = 42;
  const bodyHeight = Math.max(1, bodyLines.length) * lineHeight + 24;
  const height = headerHeight + bodyHeight;
  return {
    height,
    svg: `
      <g transform="translate(${x},${y})">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
        <rect x="0" y="0" width="${width}" height="${headerHeight}" rx="16" fill="${accent}"/>
        <text x="${width / 2}" y="27" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="700">${esc(title)}</text>
        ${bodyLines.map((line, index) => `<text x="22" y="${headerHeight + 28 + index * lineHeight}" fill="#16324f" font-size="18">${esc(line)}</text>`).join('\n')}
      </g>
    `,
  };
}

function renderWorkflow(title, steps) {
  const cardWidth = 260;
  const gap = 44;
  const wrapped = steps.map((step) => wrapText(step, 18));
  const cardHeights = wrapped.map((lines) => 42 + Math.max(1, lines.length) * 24 + 24);
  const maxHeight = Math.max(...cardHeights, 120);
  const width = steps.length * cardWidth + (steps.length - 1) * gap + 120;
  const height = maxHeight + 180;
  const startX = 60;
  const baseY = 90;
  const accents = ['#1f4e79', '#2e75b6', '#4f81bd', '#6c8ebf', '#8eaadb'];
  const cards = [];
  const arrows = [];
  steps.forEach((step, index) => {
    const x = startX + index * (cardWidth + gap);
    const card = renderCard(x, baseY, cardWidth, `Step ${index + 1}`, wrapped[index], accents[index % accents.length]);
    cards.push(card.svg);
    if (index < steps.length - 1) {
      const arrowX = x + cardWidth;
      const nextX = x + cardWidth + gap;
      const midY = baseY + maxHeight / 2;
      arrows.push(`<path d="M ${arrowX + 10} ${midY} H ${nextX - 18}" stroke="#597ba5" stroke-width="4" fill="none" marker-end="url(#arrowhead)"/>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <polygon points="0 0, 10 4, 0 8" fill="#597ba5"/>
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="#f7f9fc"/>
  <text x="${width / 2}" y="44" text-anchor="middle" fill="#0f2740" font-size="28" font-weight="700">${esc(title)}</text>
  ${cards.join('\n')}
  ${arrows.join('\n')}
</svg>`;
}

function renderFramework(title, sections) {
  const columnWidth = 300;
  const gap = 34;
  const width = sections.length * columnWidth + (sections.length - 1) * gap + 120;
  const columnY = 90;
  let height = 180;
  const columns = [];
  const connectors = [];
  sections.forEach((section, index) => {
    const x = 60 + index * (columnWidth + gap);
    const blocks = (Array.isArray(section.items) ? section.items : [section.items]).filter(Boolean);
    let localY = columnY;
    columns.push(`<text x="${x + columnWidth / 2}" y="58" text-anchor="middle" fill="#10263d" font-size="24" font-weight="700">${esc(section.title || `Module ${index + 1}`)}</text>`);
    blocks.forEach((item, blockIndex) => {
      const lines = wrapText(item, 24);
      const card = renderCard(x, localY, columnWidth, `M${index + 1}.${blockIndex + 1}`, lines, '#355d8c');
      columns.push(card.svg);
      localY += card.height + 18;
      height = Math.max(height, localY + 50);
    });
    if (index < sections.length - 1) {
      const cx = x + columnWidth + 12;
      connectors.push(`<path d="M ${cx} ${columnY + 60} C ${cx + 20} ${columnY + 60}, ${cx + gap - 20} ${columnY + 60}, ${cx + gap} ${columnY + 60}" stroke="#7892b0" stroke-width="4" fill="none" marker-end="url(#arrowhead)"/>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <polygon points="0 0, 10 4, 0 8" fill="#7892b0"/>
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="#f7f9fc"/>
  <text x="${width / 2}" y="36" text-anchor="middle" fill="#10263d" font-size="28" font-weight="700">${esc(title)}</text>
  ${columns.join('\n')}
  ${connectors.join('\n')}
</svg>`;
}

function renderTimeline(title, milestones) {
  const width = Math.max(900, milestones.length * 220 + 140);
  const height = 340;
  const startX = 90;
  const endX = width - 90;
  const y = 170;
  const span = milestones.length > 1 ? (endX - startX) / (milestones.length - 1) : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f9fc"/>
  <text x="${width / 2}" y="42" text-anchor="middle" fill="#10263d" font-size="28" font-weight="700">${esc(title)}</text>
  <line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="#355d8c" stroke-width="6"/>
  ${milestones.map((milestone, index) => {
    const x = startX + span * index;
    const lines = wrapText(milestone.label || milestone, 16);
    const date = milestone.date || `T${index + 1}`;
    const above = index % 2 === 0;
    const boxY = above ? 74 : 198;
    return `
      <circle cx="${x}" cy="${y}" r="11" fill="#355d8c"/>
      <line x1="${x}" y1="${y}" x2="${x}" y2="${above ? boxY + 54 : boxY - 14}" stroke="#7892b0" stroke-width="3"/>
      <rect x="${x - 76}" y="${boxY}" width="152" height="${58 + lines.length * 20}" rx="14" fill="#ffffff" stroke="#355d8c" stroke-width="2"/>
      <text x="${x}" y="${boxY + 24}" text-anchor="middle" fill="#355d8c" font-size="18" font-weight="700">${esc(date)}</text>
      ${lines.map((line, lineIndex) => `<text x="${x}" y="${boxY + 48 + lineIndex * 20}" text-anchor="middle" fill="#16324f" font-size="16">${esc(line)}</text>`).join('\n')}
    `;
  }).join('\n')}
</svg>`;
}

export const commands = [
  {
    name: 'workflow',
    description: 'Generate an academic workflow SVG figure.',
    execute: async (args) => {
      const title = String(args.title ?? 'Research Workflow');
      const steps = Array.isArray(args.steps) && args.steps.length > 0
        ? args.steps.map(String)
        : ['Problem formulation', 'Data collection', 'Modeling', 'Validation', 'Reporting'];
      const outputPath = String(args.outputPath ?? './figures/workflow.svg');
      const svg = renderWorkflow(title, steps);
      return { path: ensureOutput(outputPath, svg), title, steps };
    },
  },
  {
    name: 'framework',
    description: 'Generate an academic framework SVG figure with column modules.',
    execute: async (args) => {
      const title = String(args.title ?? 'Analytical Framework');
      const sections = Array.isArray(args.sections) && args.sections.length > 0
        ? args.sections
        : [
            { title: 'Inputs', items: ['Literature corpus', 'Experimental data'] },
            { title: 'Methods', items: ['Identification strategy', 'Model estimation'] },
            { title: 'Outputs', items: ['Validated findings', 'Policy implications'] },
          ];
      const outputPath = String(args.outputPath ?? './figures/framework.svg');
      const svg = renderFramework(title, sections);
      return { path: ensureOutput(outputPath, svg), title, sectionCount: sections.length };
    },
  },
  {
    name: 'timeline',
    description: 'Generate an academic project timeline SVG figure.',
    execute: async (args) => {
      const title = String(args.title ?? 'Project Timeline');
      const milestones = Array.isArray(args.milestones) && args.milestones.length > 0
        ? args.milestones
        : [
            { date: 'Phase 1', label: 'Scoping and protocol' },
            { date: 'Phase 2', label: 'Data acquisition and cleaning' },
            { date: 'Phase 3', label: 'Estimation and validation' },
            { date: 'Phase 4', label: 'Writing and revision' },
          ];
      const outputPath = String(args.outputPath ?? './figures/timeline.svg');
      const svg = renderTimeline(title, milestones);
      return { path: ensureOutput(outputPath, svg), title, milestoneCount: milestones.length };
    },
  },
];
