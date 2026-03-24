import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InstalledSkill } from './types.js';
import { parseSKILLmd } from './loader.js';

const execFileAsync = promisify(execFile);

/** Root directory where user-installed skills live. */
const USER_SKILLS_DIR = path.join(os.homedir(), '.tzukwan', 'skills');

/** JSON manifest filename stored in each installed skill directory. */
const META_FILE = '.skill-meta.json';

/**
 * Installs, uninstalls, and lists user-managed skills stored in
 * `~/.tzukwan/skills/`.
 *
 * Supports two source types:
 *  - **GitHub / HTTPS URL** — the repository is cloned with `git clone`.
 *  - **Local path** — the directory is copied recursively.
 */
export class SkillInstaller {
  private skillsDir: string;

  constructor(skillsDir: string = USER_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Install a skill from a GitHub URL or a local directory path.
   *
   * Examples:
   * ```
   * await installer.install('https://github.com/org/skill-name');
   * await installer.install('ghcr.io/org/skill-name');   // treated as GitHub
   * await installer.install('/home/user/my-skill');
   * ```
   *
   * @param source  GitHub URL (https:// or ghcr.io/…) or absolute/relative local path.
   */
  async install(source: string): Promise<void> {
    const resolvedSource = normaliseSource(source);

    if (isUrl(resolvedSource)) {
      await this.installFromGit(resolvedSource);
    } else {
      await this.installFromLocal(resolvedSource);
    }
  }

  async installOrUpdate(source: string): Promise<void> {
    const resolvedSource = normaliseSource(source);
    try {
      await this.install(resolvedSource);
    } catch (error) {
      if (String(error).includes('already exists')) {
        await this.update(resolvedSource);
        return;
      }
      throw error;
    }
  }

  async update(nameOrSource: string): Promise<void> {
    const resolved = normaliseSource(nameOrSource);
    const installed = await this.list();
    const existing = isUrl(resolved)
      ? installed.find((skill) => skill.source === resolved)
      : installed.find((skill) => skill.name === resolved || skill.source === resolved);

    if (!existing) {
      await this.install(resolved);
      return;
    }

    await fs.rm(existing.installDir, { recursive: true, force: true });
    await this.install(existing.source === 'unknown' ? resolved : existing.source);
  }

  /**
   * Uninstall a previously installed skill by name.
   *
   * @param name  The skill name (must match the `name` field in SKILL.md).
   */
  async uninstall(name: string): Promise<void> {
    // Sanitize skill name to prevent path traversal
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    if (!sanitizedName || sanitizedName !== name) {
      throw new Error(`Invalid skill name: '${name}'. Names must contain only letters, digits, hyphens, and underscores.`);
    }
    const installDir = path.join(this.skillsDir, sanitizedName);

    let exists: boolean;
    try {
      await fs.access(installDir);
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      throw new Error(`Skill '${name}' is not installed (looked in '${installDir}').`);
    }

    await fs.rm(installDir, { recursive: true, force: true });
    console.log(`[skills] Uninstalled skill '${name}' from '${installDir}'.`);
  }

  /**
   * List all currently installed skills with their metadata.
   *
   * @returns  Array of {@link InstalledSkill} descriptors.
   */
  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      const dirents = await fs.readdir(this.skillsDir, { withFileTypes: true });
      entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }

    const result: InstalledSkill[] = [];
    for (const entry of entries) {
      const installDir = path.join(this.skillsDir, entry);
      const meta = await this.readMeta(installDir);
      if (meta) {
        result.push(meta);
      } else {
        // Fallback: read directly from SKILL.md
        try {
          const skillMd = await fs.readFile(path.join(installDir, 'SKILL.md'), 'utf-8');
          const manifest = parseSKILLmd(skillMd);
          result.push({
            name: manifest.name,
            version: manifest.version,
            source: 'unknown',
            installDir,
            installedAt: 'unknown',
          });
        } catch {
          // Cannot read SKILL.md — skip silently
        }
      }
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Clone a Git repository and register its metadata. */
  private async installFromGit(url: string): Promise<void> {
    // Sanitize repo name to prevent path traversal
    const rawName = url.replace(/\.git$/, '').split('/').pop() ?? 'skill';
    const repoName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'skill';
    const targetDir = path.join(this.skillsDir, repoName);

    await fs.mkdir(this.skillsDir, { recursive: true });

    if (await dirExists(targetDir)) {
      throw new Error(
        `Skill directory '${targetDir}' already exists. ` +
        `Run 'tzukwan skills uninstall ${repoName}' first.`,
      );
    }

    console.log(`[skills] Cloning ${url} → ${targetDir} …`);
    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, targetDir]);
    } catch (err) {
      // Clean up partial clone to prevent orphaned directories
      try { await fs.rm(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`git clone failed: ${msg}`);
    }

    // Validate and register
    await this.validateAndWriteMeta(targetDir, url);
    console.log(`[skills] Skill installed successfully from '${url}'.`);
  }

  /** Copy a local directory and register its metadata. */
  private async installFromLocal(localPath: string): Promise<void> {
    const absSource = path.resolve(localPath);
    const skillName = path.basename(absSource);
    const targetDir = path.join(this.skillsDir, skillName);

    await fs.mkdir(this.skillsDir, { recursive: true });

    if (await dirExists(targetDir)) {
      throw new Error(
        `Skill directory '${targetDir}' already exists. ` +
        `Run 'tzukwan skills uninstall ${skillName}' first.`,
      );
    }

    console.log(`[skills] Copying ${absSource} → ${targetDir} …`);
    await copyDirRecursive(absSource, targetDir);

    await this.validateAndWriteMeta(targetDir, absSource);
    console.log(`[skills] Skill installed successfully from '${absSource}'.`);
  }

  /**
   * Validate the installed directory contains a valid SKILL.md and write a
   * `.skill-meta.json` record.
   */
  private async validateAndWriteMeta(installDir: string, source: string): Promise<void> {
    const skillMdPath = path.join(installDir, 'SKILL.md');
    let content: string;
    try {
      content = await fs.readFile(skillMdPath, 'utf-8');
    } catch {
      throw new Error(
        `Installed directory '${installDir}' does not contain a SKILL.md file.`,
      );
    }

    const manifest = parseSKILLmd(content);
    const meta: InstalledSkill = {
      name: manifest.name,
      version: manifest.version,
      source,
      installDir,
      installedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(installDir, META_FILE),
      JSON.stringify(meta, null, 2),
      'utf-8',
    );
  }

  /** Read `.skill-meta.json` from an install directory, or return null. */
  private async readMeta(installDir: string): Promise<InstalledSkill | null> {
    try {
      const raw = await fs.readFile(path.join(installDir, META_FILE), 'utf-8');
      return JSON.parse(raw) as InstalledSkill;
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise `ghcr.io/org/name` shorthand into a full HTTPS URL so `git clone`
 * can handle it.  Regular HTTPS URLs and local paths pass through unchanged.
 */
function normaliseSource(source: string): string {
  // ghcr.io/… shorthand → treat as GitHub container registry / GitHub URL
  if (source.startsWith('ghcr.io/')) {
    // Map ghcr.io/org/name → https://github.com/org/name
    const parts = source.replace('ghcr.io/', '').split('/');
    return `https://github.com/${parts.join('/')}`;
  }
  return source;
}

/** Returns true if the string looks like an HTTP(S) URL. */
function isUrl(s: string): boolean {
  return s.startsWith('https://') || s.startsWith('http://') || s.startsWith('git@');
}

/** Returns true if the path exists and is a directory. */
async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Recursively copy a directory tree. */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
