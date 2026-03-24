#!/usr/bin/env node
/**
 * tzukwan-cli build script
 * Compiles all TypeScript packages in dependency order
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const PACKAGES = [
  'core',      // No internal deps
  'skills',    // Depends on core
  'research',  // Depends on core
  'cli',       // Depends on core, research, skills
];

function run(cmd, cwd) {
  console.log(`\x1b[36m[build]\x1b[0m ${cmd} (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log('\x1b[1m\x1b[35m╔══════════════════════════════════╗\x1b[0m');
console.log('\x1b[1m\x1b[35m║   tzukwan-cli build system       ║\x1b[0m');
console.log('\x1b[1m\x1b[35m╚══════════════════════════════════╝\x1b[0m\n');

// Install root deps first
console.log('\x1b[33m[1/2] Installing dependencies...\x1b[0m');
run('npm install', ROOT);

// Build each package in order
console.log('\n\x1b[33m[2/2] Building packages...\x1b[0m');
for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, 'packages', pkg);
  if (!existsSync(pkgDir)) {
    console.warn(`\x1b[33m[warn]\x1b[0m Package ${pkg} not found, skipping`);
    continue;
  }
  console.log(`\n\x1b[36m  → Building @tzukwan/${pkg}...\x1b[0m`);
  run('npm run build', pkgDir);
}

console.log('\n\x1b[32m✓ Build complete!\x1b[0m');
console.log('\x1b[2m  Run: node bin/tzukwan.mjs\x1b[0m');
console.log('\x1b[2m  Or install globally: npm install -g .\x1b[0m\n');
