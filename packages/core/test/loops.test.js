import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LoopManager } from '../dist/index.js';

test('LoopManager.stopAll preserves active state when requested', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tzukwan-loop-home-'));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  try {
    const manager = new LoopManager();
    const loopId = manager.create({
      name: 'preserve-active',
      command: 'echo hello',
      intervalMs: 1000,
    });

    manager.stopAll({ preserveActiveState: true });

    const loop = manager.get(loopId);
    assert.ok(loop);
    assert.equal(loop.active, true);

    manager.clearOldLoops();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
