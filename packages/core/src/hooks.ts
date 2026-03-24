import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type HookEvent =
  | 'pre-message'
  | 'post-message'
  | 'pre-tool'
  | 'post-tool'
  | 'session-start'
  | 'session-end'
  | 'agent-switch'
  | 'collaborate-start'
  | 'collaborate-end'
  | 'error'
  | 'loop-tick';

export interface Hook {
  id: string;
  event: HookEvent;
  /** Shell command to run, or JS function body as string */
  command: string;
  description: string;
  enabled: boolean;
  createdAt: string;
}

export interface HookContext {
  event?: HookEvent;
  timestamp?: string;
  agentId?: string;
  message?: string;
  toolName?: string;
  error?: string;
  [key: string]: unknown;
}

interface InternalHook {
  hook: Hook;
  handler: (context: HookContext) => Promise<void> | void;
}

// Block unquoted shell metacharacters to prevent injection.
// Strategy: strip content inside single/double quotes first, then check
// the remaining skeleton for dangerous metacharacters.
function hasBlockedChars(command: string): boolean {
  // Block newlines/carriage-returns before quote-stripping — they act as command
  // separators in the shell (equivalent to ';') and cannot appear inside quoted strings
  if (/[\n\r]/.test(command)) return true;
  // Remove single-quoted content (no escaping inside single quotes)
  const noSingleQuotes = command.replace(/'[^']*'/g, "''");
  // Remove double-quoted content (allow \" escapes inside)
  const noDoubleQuotes = noSingleQuotes.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  // In the unquoted skeleton, block: ; & | ` $ ( ) { } [ ] < > * ? % ! #
  return /[;&|`$(){}[\]<>*?%!#]/.test(noDoubleQuotes);
}

export class HookManager {
  private hooks: Hook[] = [];
  private internalHooks: InternalHook[] = [];
  private hooksFile: string;

  constructor() {
    this.hooksFile = path.join(os.homedir(), '.tzukwan', 'hooks.json');
    this.load();
  }

  /**
   * Validate hook command for basic security - blocks obvious shell injection
   */
  private validateCommand(command: string): void {
    if (!command || command.trim().length === 0) {
      throw new Error('Hook command cannot be empty');
    }
    if (hasBlockedChars(command)) {
      throw new Error('Hook command contains unquoted disallowed characters: ; & | ` $ ( ) { } [ ] < > * ? % ! #');
    }
    // Check for path traversal in command
    if (command.includes('..')) {
      throw new Error('Hook command cannot contain path traversal (..)');
    }
  }

  register(hook: Omit<Hook, 'id' | 'createdAt'>): Hook {
    // Validate command before registration
    this.validateCommand(hook.command);

    const newHook: Hook = {
      ...hook,
      id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.hooks.push(newHook);
    this.save();
    return newHook;
  }

  registerCallback(
    hook: Omit<Hook, 'id' | 'createdAt' | 'command'>,
    handler: (context: HookContext) => Promise<void> | void,
  ): Hook {
    const newHook: Hook = {
      ...hook,
      command: 'internal://callback',
      id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.internalHooks.push({ hook: newHook, handler });
    return newHook;
  }

  remove(id: string): boolean {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter(h => h.id !== id);
    const internalBefore = this.internalHooks.length;
    this.internalHooks = this.internalHooks.filter(h => h.hook.id !== id);
    if (this.hooks.length < before || this.internalHooks.length < internalBefore) {
      this.save();
      return true;
    }
    return false;
  }

  enable(id: string): boolean {
    const hook = this.hooks.find(h => h.id === id);
    if (hook) { hook.enabled = true; this.save(); return true; }
    const internal = this.internalHooks.find(h => h.hook.id === id);
    if (internal) { internal.hook.enabled = true; return true; }
    return false;
  }

  disable(id: string): boolean {
    const hook = this.hooks.find(h => h.id === id);
    if (hook) { hook.enabled = false; this.save(); return true; }
    const internal = this.internalHooks.find(h => h.hook.id === id);
    if (internal) { internal.hook.enabled = false; return true; }
    return false;
  }

  list(event?: HookEvent): Hook[] {
    const combined = [...this.hooks, ...this.internalHooks.map((hook) => hook.hook)];
    return event ? combined.filter(h => h.event === event) : combined;
  }

  async trigger(event: HookEvent, context: HookContext): Promise<void> {
    const matching = this.hooks.filter(h => h.event === event && h.enabled);
    const internalMatching = this.internalHooks.filter(h => h.hook.event === event && h.hook.enabled);
    const executions = matching.map(hook => new Promise<void>(resolve => {
      const envVars: Record<string, string> = {
        TZUKWAN_HOOK_EVENT: event,
        TZUKWAN_HOOK_AGENT: context.agentId ?? '',
        TZUKWAN_HOOK_MESSAGE: context.message?.slice(0, 500) ?? '',
        TZUKWAN_HOOK_TIMESTAMP: context.timestamp ?? new Date().toISOString(),
        TZUKWAN_HOOK_TOOL: context.toolName ?? '',
        TZUKWAN_HOOK_ERROR: context.error ?? '',
      };
      exec(hook.command, {
        env: { ...process.env, ...envVars },
        timeout: 10000,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      }, (err) => {
        // Log hook execution errors for debugging but don't crash
        if (err) {
          console.error(`[HookManager] Hook ${hook.id} failed:`, err.message);
        }
        resolve();
      });
    }));
    const internalExecutions = internalMatching.map(async (hook) => {
      try {
        let timerId: ReturnType<typeof setTimeout>;
        await Promise.race([
          Promise.resolve(hook.handler({ ...context, event })).finally(() => clearTimeout(timerId)),
          new Promise<void>((_, reject) => { timerId = setTimeout(() => reject(new Error('Internal hook timeout after 10s')), 10000); }),
        ]);
      } catch {
        // Internal hook failure (including timeout) is non-fatal
      }
    });
    await Promise.all([...executions, ...internalExecutions]);
  }

  private load(): void {
    try {
      const loaded = JSON.parse(fs.readFileSync(this.hooksFile, 'utf-8')) as Hook[];
      // Re-validate each loaded hook — commands in the file may have been edited manually
      this.hooks = Array.isArray(loaded)
        ? loaded.filter((h) => {
            try {
              this.validateCommand(h.command);
              return true;
            } catch {
              console.warn(`[HookManager] Skipping hook "${h.id}" — invalid command: ${h.command}`);
              return false;
            }
          })
        : [];
    } catch {
      this.hooks = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.hooksFile);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.hooksFile, JSON.stringify(this.hooks, null, 2), 'utf-8');
    } catch {
      // Save failure is non-fatal
    }
  }
}
