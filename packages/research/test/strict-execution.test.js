import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = pathToFileURL(path.resolve(__dirname, '../dist/index.js')).href;

test('runReproductionProjectValidation executes real reproduction entrypoint checks', async () => {
  const mod = await import(distIndex);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzukwan-repro-'));
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'model.py'), 'class Model:\n    pass\n', 'utf-8');
  fs.writeFileSync(path.join(srcDir, 'train.py'), [
    'import argparse',
    'parser = argparse.ArgumentParser()',
    "parser.add_argument('--epochs', type=int, default=1)",
    'if __name__ == "__main__":',
    '    parser.parse_args()',
    "    print('train ok')",
    '',
  ].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(srcDir, 'evaluate.py'), [
    'import argparse',
    'parser = argparse.ArgumentParser()',
    "parser.add_argument('--split', default='test')",
    'if __name__ == "__main__":',
    '    parser.parse_args()',
    "    print('eval ok')",
    '',
  ].join('\n'), 'utf-8');

  const runs = mod.runReproductionProjectValidation(tmpDir, tmpDir);
  assert.ok(runs.length >= 3, 'should produce syntax + train/evaluate checks');
  assert.ok(runs.some((run) => run.name === 'Training entrypoint help check' && run.status === 'passed'));
  assert.ok(runs.some((run) => run.name === 'Evaluation entrypoint help check' && run.status === 'passed'));
  assert.ok(runs.some((run) => run.name === 'Python syntax validation' && run.status === 'passed'));
});
