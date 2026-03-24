/**
 * @tzukwan/skills public API
 */

import fs from 'fs/promises';
import path from 'path';
import { SkillInstaller } from './installer.js';
import { SkillLoader } from './loader.js';

export type {
  Skill,
  SkillCommand,
  SkillContext,
  SkillManifest,
  InstalledSkill,
  LLMClientInterface,
} from './types.js';

export { SkillLoader, parseSKILLmd } from './loader.js';
export { SkillRegistry } from './registry.js';
export { SkillInstaller } from './installer.js';

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  status: 'installed' | 'available' | 'error';
}

export async function listInstalledSkills(): Promise<SkillInfo[]> {
  const installer = new SkillInstaller();
  const installed = await installer.list();

  // Build map from installer records (these take priority)
  const seen = new Map<string, SkillInfo>();
  for (const skill of installed) {
    seen.set(skill.name, {
      name: skill.name,
      version: skill.version,
      description: `Installed from: ${skill.source}`,
      status: 'installed',
    });
  }

  // Also scan SkillLoader default paths to find all discoverable skills
  const loader = new SkillLoader();
  for (const dir of SkillLoader.getDefaultSearchPaths()) {
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(dir, entry.name);
        try {
          const skill = await loader.loadSkill(skillDir);
          // Only add if not already in installer records (installer records take priority)
          if (!seen.has(skill.name)) {
            seen.set(skill.name, {
              name: skill.name,
              version: skill.version,
              description: skill.description,
              author: skill.author,
              status: 'installed',
            });
          }
        } catch {
          // Skip malformed skill directories
        }
      }
    } catch {
      continue;
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function installSkill(source: string): Promise<void> {
  const installer = new SkillInstaller();
  await installer.install(source);
}

export async function updateSkill(sourceOrName: string): Promise<void> {
  const installer = new SkillInstaller();
  await installer.update(sourceOrName);
}

export async function installOrUpdateSkill(source: string): Promise<void> {
  const installer = new SkillInstaller();
  await installer.installOrUpdate(source);
}

export async function uninstallSkill(name: string): Promise<void> {
  const installer = new SkillInstaller();
  await installer.uninstall(name);
}

export async function listAvailableSkills(): Promise<SkillInfo[]> {
  const loader = new SkillLoader();
  const seen = new Map<string, SkillInfo>();

  for (const dir of SkillLoader.getDefaultSearchPaths()) {
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(dir, entry.name);
        try {
          const skill = await loader.loadSkill(skillDir);
          seen.set(skill.name, {
            name: skill.name,
            version: skill.version,
            description: skill.description,
            author: skill.author,
            status: 'available',
          });
        } catch {
          // Skip malformed skill directories.
        }
      }
    } catch {
      continue;
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}
