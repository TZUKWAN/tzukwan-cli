#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the CLI package entry point
const cliPath = join(__dirname, '..', 'packages', 'cli', 'dist', 'index.js');
// Use pathToFileURL for Windows compatibility (avoids ERR_UNSUPPORTED_ESM_URL_SCHEME)
const cliUrl = pathToFileURL(cliPath).href;

try {
  await import(cliUrl);
} catch (err) {
  if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
    console.error('\x1b[31m[tzukwan] Build not found. Run `npm run build` first.\x1b[0m');
    console.error(`  Expected: ${cliPath}`);
    process.exit(1);
  }
  throw err;
}
