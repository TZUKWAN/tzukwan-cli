import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LoopDefinition {
  id: string;
  name: string;
  command: string;
  intervalMs: number;
  maxIterations?: number;
  active: boolean;
  iterations: number;
  createdAt: string;
  lastRunAt?: string;
}

export type LoopTickCallback = (loop: LoopDefinition, iteration: number) => Promise<void>;

export class LoopManager {
  private loops: Map<string, LoopDefinition> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private loopsFile: string;

  constructor() {
    this.loopsFile = path.join(os.homedir(), '.tzukwan', 'loops.json');
    this.load();
  }

  create(def: {
    name: string;
    command: string;
    intervalMs: number;
    maxIterations?: number;
  }, onTick?: LoopTickCallback): string {
    if (!Number.isFinite(def.intervalMs) || def.intervalMs < 1) {
      throw new Error(`Invalid intervalMs: ${def.intervalMs}. Must be a positive finite number.`);
    }
    if (def.maxIterations !== undefined && (!Number.isInteger(def.maxIterations) || def.maxIterations < 1)) {
      throw new Error(`Invalid maxIterations: ${def.maxIterations}. Must be a positive integer.`);
    }
    const id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const loop: LoopDefinition = {
      ...def,
      id,
      active: true,
      iterations: 0,
      createdAt: new Date().toISOString(),
    };
    this.loops.set(id, loop);
    this.save();

    if (onTick) {
      this.startTimer(loop, onTick);
    } else {
      // Loop is persisted but will not run until restoreLoops() is called with a tick callback.
      // This is intentional for loops that need to survive restarts, but if unintentional,
      // pass an onTick callback to create().
      console.warn(`[LoopManager] Loop "${def.name}" (${id}) created without onTick — it will not execute until restored with a tick callback.`);
    }

    return id;
  }

  stop(id: string): boolean {
    const loop = this.loops.get(id);
    if (!loop) return false;

    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }

    loop.active = false;
    this.save();
    return true;
  }

  stopAll(options?: { preserveActiveState?: boolean }): void {
    for (const id of this.timers.keys()) {
      clearInterval(this.timers.get(id));
    }
    this.timers.clear();
    if (!options?.preserveActiveState) {
      for (const loop of this.loops.values()) {
        loop.active = false;
      }
    }
    this.save();
  }

  list(): LoopDefinition[] {
    return Array.from(this.loops.values());
  }

  get(id: string): LoopDefinition | undefined {
    return this.loops.get(id);
  }

  private startTimer(loop: LoopDefinition, onTick: LoopTickCallback): void {
    const timer = setInterval(() => {
      const current = this.loops.get(loop.id);
      if (!current || !current.active) {
        clearInterval(timer);
        this.timers.delete(loop.id);
        return;
      }

      current.iterations++;
      current.lastRunAt = new Date().toISOString();
      // Debounce save to avoid excessive disk writes (max once per second)
      this.debouncedSave();

      Promise.resolve(onTick(current, current.iterations)).then(() => {
        // Re-fetch current state in case it was modified during tick
        const updated = this.loops.get(loop.id);
        // Only stop if loop is still active (guard against race with external stop())
        if (updated && updated.active && updated.maxIterations && updated.iterations >= updated.maxIterations) {
          this.stop(loop.id);
        }
      }).catch((err: unknown) => {
        console.error(`[Loop:${loop.name}] tick error:`, err);
      });
    }, loop.intervalMs);

    this.timers.set(loop.id, timer);
  }

  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Debounced save to prevent excessive disk writes during high-frequency loops
   */
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.save();
      this.saveTimeout = null;
    }, 1000);
  }

  /**
   * Ralph Loop: run a task repeatedly until a completion check returns true.
   */
  async runUntilComplete(
    task: string,
    executeTask: () => Promise<string>,
    checkComplete: (result: string) => boolean,
    maxIterations: number = 10,
    onIteration?: (iteration: number, result: string) => void
  ): Promise<{ result: string; iterations: number }> {
    let iterations = 0;
    let lastResult = '';

    while (iterations < maxIterations) {
      iterations++;
      try {
        lastResult = await executeTask();
      } catch (err) {
        lastResult = `[error: ${String(err)}]`;
      }

      if (onIteration) {
        onIteration(iterations, lastResult);
      }

      if (checkComplete(lastResult)) {
        break;
      }
    }

    return { result: lastResult, iterations };
  }

  /**
   * Restore timers for all loops that were active when last saved.
   * Call this after process restart, passing the same onTick callback(s) you used originally.
   * If a single callback handles all loops you can pass one; for per-loop behaviour inspect
   * the LoopDefinition.command inside the callback.
   */
  restoreLoops(onTick: LoopTickCallback): void {
    for (const loop of this.loops.values()) {
      if (loop.active && !this.timers.has(loop.id)) {
        this.startTimer(loop, onTick);
      }
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.loopsFile)) {
        const data = JSON.parse(fs.readFileSync(this.loopsFile, 'utf-8')) as LoopDefinition[];
        if (!Array.isArray(data)) { this.loops = new Map(); return; }
        for (const loop of data) {
          // Validate intervalMs so a crafted loops.json can't cause setInterval(fn, 0) DoS
          if (!Number.isFinite(loop.intervalMs) || loop.intervalMs < 1) {
            console.warn(`[LoopManager] Skipping loop "${loop.id}" — invalid intervalMs: ${loop.intervalMs}`);
            continue;
          }
          // Preserve the persisted active flag so restoreLoops() can restart previously-active loops.
          // Timers themselves are gone after restart; call restoreLoops() to re-arm them.
          this.loops.set(loop.id, loop);
        }
      }
    } catch {
      this.loops = new Map();
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.loopsFile), { recursive: true });
      fs.writeFileSync(
        this.loopsFile,
        JSON.stringify(Array.from(this.loops.values()), null, 2),
        'utf-8'
      );
    } catch {
      // Non-fatal
    }
  }

  clearOldLoops(): void {
    this.stopAll();
    this.loops.clear();
    this.save();
  }
}
