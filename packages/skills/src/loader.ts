import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Skill, SkillManifest, SkillCommand, SkillContext } from './types.js';

// ---------------------------------------------------------------------------
// SKILL.md parser
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file into a structured {@link SkillManifest}.
 *
 * The expected format is:
 * ```
 * ---
 * name: skill-name
 * version: 1.0.0
 * description: One-line description
 * author: tzukwan        # optional
 * ---
 *
 * ... markdown body ...
 * ```
 *
 * Trigger keywords are extracted from a section whose heading contains
 * "触发" (Chinese) or "trigger" (English, case-insensitive).
 *
 * Command names are extracted from a section whose heading contains
 * "命令" (Chinese) or "command" (English, case-insensitive).
 */
export function parseSKILLmd(content: string): SkillManifest {
  // ── 1. Extract YAML frontmatter ──────────────────────────────────────────
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('SKILL.md is missing a valid YAML frontmatter block (--- ... ---)');
  }

  const [, frontmatterRaw, body] = fmMatch;

  // Minimal YAML key:value parser (no external dependency)
  const fm: Record<string, string> = {};
  for (const line of frontmatterRaw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fm[key] = value;
  }

  if (!fm['name'])        throw new Error('SKILL.md frontmatter is missing required field: name');
  if (!fm['version'])     throw new Error('SKILL.md frontmatter is missing required field: version');
  if (!fm['description']) throw new Error('SKILL.md frontmatter is missing required field: description');

  // ── 2. Parse trigger keywords from body ─────────────────────────────────
  const triggers = parseSectionItems(body, /触发|trigger/i);

  // ── 3. Parse command names from body ────────────────────────────────────
  const commandNames = parseSectionItems(body, /命令|command/i);

  return {
    name: fm['name'],
    version: fm['version'],
    description: fm['description'],
    author: fm['author'],
    body,
    triggers,
    commandNames,
  };
}

/**
 * Find a markdown section whose `##` heading matches `headingPattern` and
 * extract every non-empty bullet point or backtick-delimited word as an item.
 */
function parseSectionItems(body: string, headingPattern: RegExp): string[] {
  const lines = body.split('\n');
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      // Start collecting if this is our target section; stop on any other ##
      inSection = headingPattern.test(headingMatch[1]);
      continue;
    }
    if (!inSection) continue;

    // Bullet lines: "- item" or "* item"
    const bulletMatch = line.match(/^[\-*]\s+`?([^`]+)`?/);
    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      if (item) items.push(item);
      continue;
    }

    // Backtick-only lines: "`keyword`"
    const backtickMatch = line.match(/^`([^`]+)`/);
    if (backtickMatch) {
      items.push(backtickMatch[1].trim());
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// No-op stub command factory
// ---------------------------------------------------------------------------

/**
 * Create a stub {@link SkillCommand} for each name found in the manifest.
 * The stub logs a "not implemented" message and resolves immediately, so
 * callers can safely enumerate commands before a real implementation is wired.
 */
function buildStubCommands(commandNames: string[]): SkillCommand[] {
  return commandNames.map((name) => ({
    name,
    description: `[STUB - NOT IMPLEMENTED] Command '${name}' is not yet implemented. This is a placeholder that will return null. Do not use this command.`,
    execute: async (_args: Record<string, unknown>, _ctx: SkillContext): Promise<unknown> => {
      console.warn(`[skills] Skill command '${name}' has no implementation yet.`);
      return null;
    },
  }));
}

// ---------------------------------------------------------------------------
// SkillLoader
// ---------------------------------------------------------------------------

export class SkillLoader {
  /**
   * Derive the canonical search paths in priority order:
   *
   *  1. `<cwd>/.tzukwan/skills/`    — project-local overrides
   *  2. `~/.tzukwan/skills/`         — user-global installs
   *  3. Built-in skills shipped with the package (`<pkg-root>/skills/`)
   */
  static getDefaultSearchPaths(cwd: string = process.cwd()): string[] {
    // __dirname equivalent in ESM
    const thisFile = fileURLToPath(import.meta.url);
    // loader.js lives at: <monorepo-root>/packages/skills/dist/loader.js
    // Going 3 levels up from dist/ reaches the monorepo root.
    const pkgRoot = path.resolve(path.dirname(thisFile), '..', '..', '..');
    const builtinSkillsDir = path.join(pkgRoot, 'skills');

    return [
      path.join(cwd, '.tzukwan', 'skills'),
      path.join(os.homedir(), '.tzukwan', 'skills'),
      builtinSkillsDir,
    ];
  }

  /**
   * Load all skills found inside `dir`.
   * Each immediate sub-directory that contains a `SKILL.md` is treated as a
   * skill definition.
   *
   * @param dir  Absolute path to a skills directory.
   * @returns    Array of loaded skills (may be empty).
   */
  async loadSkillsFromDir(dir: string): Promise<Skill[]> {
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Directory doesn't exist or is not readable — silently skip
      return [];
    }

    const skills: Skill[] = [];
    for (const entry of entries) {
      const skillDir = path.join(dir, entry);
      try {
        const skill = await this.loadSkill(skillDir);
        skills.push(skill);
      } catch (err) {
        // Individual skill load failure should not abort the whole scan
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[skills] Failed to load skill from '${skillDir}': ${msg}`);
      }
    }
    return skills;
  }

  /**
   * Load a single skill from `skillDir`.
   * The directory must contain a `SKILL.md` file.  If a `index.js` (or
   * `index.ts` when running under ts-node) is present, it is dynamically
   * imported and its exports are merged into the skill's command list,
   * replacing any stub with the real implementation.
   *
   * @param skillDir  Absolute path to the skill directory.
   */
  async loadSkill(skillDir: string): Promise<Skill> {
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    let content: string;
    try {
      content = await fs.readFile(skillMdPath, 'utf-8');
    } catch {
      throw new Error(`No SKILL.md found in '${skillDir}'`);
    }

    const manifest = parseSKILLmd(content);

    // Build stub commands from the manifest
    let commands: SkillCommand[] = buildStubCommands(manifest.commandNames);

    // Attempt to load a real implementation module
    for (const implName of ['index.js', 'index.cjs', 'index.mjs']) {
      const implPath = path.join(skillDir, implName);
      try {
        await fs.access(implPath);
        const mod = await import(pathToFileURL(implPath).href) as { commands?: SkillCommand[] };
        if (Array.isArray(mod.commands)) {
          // Merge: real implementations replace stubs; stubs fill gaps
          const realByName = new Map(mod.commands.map((c) => [c.name, c]));
          commands = manifest.commandNames.map((name) =>
            realByName.get(name) ?? buildStubCommands([name])[0]!,
          );
          // Also include any commands the impl exports that aren't in the manifest
          for (const cmd of mod.commands) {
            if (!manifest.commandNames.includes(cmd.name)) {
              commands.push(cmd);
            }
          }
        }
        break; // Stop after first successful import
      } catch (err) {
        const code = typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
        if (code === 'ENOENT') continue;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[skills] Failed to load implementation module '${implPath}': ${message}`);
      }
    }

    return {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      triggers: manifest.triggers,
      commands,
      author: manifest.author,
      sourceDir: skillDir,
    };
  }
}
