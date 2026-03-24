import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { displayError, displaySuccess, displayInfo, displayTable } from '../ui/display.js';

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools?: string[];
  status: 'installed' | 'available' | 'error';
}

type SkillsModule = {
  listInstalledSkills: () => Promise<SkillInfo[]>;
  installSkill: (name: string) => Promise<void>;
  updateSkill: (name: string) => Promise<void>;
  uninstallSkill: (name: string) => Promise<void>;
  listAvailableSkills: () => Promise<SkillInfo[]>;
  SkillRegistry: typeof import('@tzukwan/skills').SkillRegistry;
};

/**
 * Load the skills module dynamically.
 */
async function loadSkills(): Promise<SkillsModule> {
  try {
    const skills = await import('@tzukwan/skills') as unknown as SkillsModule;
    return skills;
  } catch {
    return {
      listInstalledSkills: async (): Promise<SkillInfo[]> => {
        // Module not available — return empty, do not fabricate installed skills
        return [];
      },
      installSkill: async (name: string): Promise<void> => {
        throw new Error(`@tzukwan/skills module not yet available. Cannot install skill: ${name}`);
      },
      updateSkill: async (name: string): Promise<void> => {
        throw new Error(`@tzukwan/skills module not yet available. Cannot update skill: ${name}`);
      },
      uninstallSkill: async (name: string): Promise<void> => {
        throw new Error(`@tzukwan/skills module not yet available. Cannot uninstall skill: ${name}`);
      },
      listAvailableSkills: async (): Promise<SkillInfo[]> => {
        // Module not available — return empty, do not fabricate available skills
        return [];
      },
      SkillRegistry: null as unknown as typeof import('@tzukwan/skills').SkillRegistry,
    };
  }
}

/**
 * List all installed skills.
 */
export async function skillsList(): Promise<void> {
  const spinner = ora({
    text: chalk.cyan('Loading installed skills...'),
    color: 'cyan',
  }).start();

  // Check if the skills module is actually available
  let moduleAvailable = true;
  try {
    await import('@tzukwan/skills');
  } catch {
    moduleAvailable = false;
  }

  if (!moduleAvailable) {
    spinner.stop();
    displayInfo('技能模块尚未可用 (@tzukwan/skills not installed)。');
    displayInfo('Skills functionality will be available in a future release.');
    return;
  }

  try {
    // Use SkillRegistry to get actual runtime skills (consistent with runtime.ts)
    const skills = await loadSkills();
    const { SkillRegistry } = await import('@tzukwan/skills');
    const registry = SkillRegistry.getInstance();
    await registry.initializeDefault(process.cwd());
    const runtimeSkills = registry.list();
    
    // Also get installer-based skills for complete picture
    const installed = await skills.listInstalledSkills();
    
    // Merge both lists (runtime skills take priority)
    const skillMap = new Map<string, SkillInfo>();
    
    // Add installer-based skills first
    for (const skill of installed) {
      skillMap.set(skill.name, skill);
    }
    
    // Add/update with runtime skills
    for (const skill of runtimeSkills) {
      skillMap.set(skill.name, {
        name: skill.name,
        version: skill.version,
        description: skill.description,
        author: skill.author,
        status: 'installed',
        tools: skill.commands.map(c => c.name),
      });
    }
    
    const mergedSkills = Array.from(skillMap.values());
    spinner.stop();

    if (mergedSkills.length === 0) {
      displayInfo('No skills installed. Use `tzukwan skills install <name>` to install skills.');
      return;
    }

    console.log('\n' + chalk.bold.cyan(`🔧 Installed Skills (${mergedSkills.length})`) + '\n');

    displayTable(
      ['Name', 'Version', 'Status', 'Description'],
      mergedSkills.map((s) => [
        s.name,
        s.version,
        s.status === 'installed' ? chalk.green('● installed') : chalk.red('● error'),
        s.description.slice(0, 50),
      ])
    );

    // Show tool inventory
    for (const skill of installed) {
      if (skill.tools && skill.tools.length > 0) {
        console.log(
          chalk.bold.white(skill.name) +
            chalk.gray(' provides: ') +
            skill.tools.map((t) => chalk.cyan(t)).join(chalk.gray(', '))
        );
      }
    }

    // Also show available skills
    console.log();
    console.log(chalk.gray('Available but not installed:'));
    const available = await skills.listAvailableSkills();
    const notInstalled = available.filter(
      (a) => !installed.find((i) => i.name === a.name)
    );

    if (notInstalled.length > 0) {
      notInstalled.forEach((s) => {
        console.log(
          chalk.gray('  • ') +
            chalk.white(s.name) +
            chalk.gray('  ' + s.description)
        );
      });
      console.log();
      console.log(
        chalk.gray('Install with: ') +
          chalk.cyan('tzukwan skills install <name>')
      );
    }

    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Failed to list skills'));
    displayError(String(err));
    return;
  }
}

/**
 * Install a skill by name.
 */
export async function skillsInstall(source: string): Promise<void> {
  if (!source) {
    displayError('Skill name is required. Example: tzukwan skills install pubmed');
    return;
  }

  const spinner = ora({
    text: chalk.cyan(`Installing skill: ${chalk.bold(source)}...`),
    color: 'cyan',
  }).start();

  try {
    const skills = await loadSkills();
    const directSource = /^(https?:\/\/|git@|ghcr\.io\/|\.{0,2}[\\/]|[a-zA-Z]:\\)/.test(source);

    // Check if already installed
    const installed = await skills.listInstalledSkills();
    if (!directSource && installed.find((s) => s.name === source)) {
      spinner.stop();
      displayInfo(`Skill '${source}' is already installed.`);
      return;
    }

    // Check if available
    const available = await skills.listAvailableSkills();
    if (!directSource && !available.find((s) => s.name === source)) {
      spinner.stop();
      displayError(
        `Unknown skill: ${source}\n\nAvailable skills: ${available.map((s) => s.name).join(', ')}`
      );
      return;
    }

    await skills.installSkill(source);

    spinner.succeed(chalk.green(`Skill '${source}' installed successfully!`));
    displaySuccess(`Skill '${source}' is now available in Tzukwan.`);

    // Show what tools were added
    const nowInstalled = await skills.listInstalledSkills();
    const newSkill = nowInstalled.find((s) => s.name === source);
    if (newSkill?.tools) {
      console.log(
        chalk.gray('New tools available: ') +
          newSkill.tools.map((t) => chalk.cyan(t)).join(chalk.gray(', '))
      );
    }
    console.log();
  } catch (err) {
    spinner.fail(chalk.red(`Installation failed for '${source}'`));
    displayError(String(err));
    return;
  }
}

export async function skillsUpdate(sourceOrName: string): Promise<void> {
  if (!sourceOrName) {
    displayError('Skill name or source is required. Example: tzukwan skills update literature-review');
    return;
  }

  const spinner = ora({
    text: chalk.cyan(`Updating skill: ${chalk.bold(sourceOrName)}...`),
    color: 'cyan',
  }).start();

  try {
    const skills = await loadSkills();
    await skills.updateSkill(sourceOrName);
    spinner.succeed(chalk.green(`Skill '${sourceOrName}' updated successfully!`));
  } catch (err) {
    spinner.fail(chalk.red(`Update failed for '${sourceOrName}'`));
    displayError(String(err));
  }
}

export async function skillsUninstall(name: string): Promise<void> {
  if (!name) {
    displayError('Skill name is required. Example: tzukwan skills uninstall svg-science');
    return;
  }

  const spinner = ora({
    text: chalk.cyan(`Uninstalling skill: ${chalk.bold(name)}...`),
    color: 'cyan',
  }).start();

  try {
    const skills = await loadSkills();
    await skills.uninstallSkill(name);
    spinner.succeed(chalk.green(`Skill '${name}' uninstalled successfully!`));
  } catch (err) {
    spinner.fail(chalk.red(`Uninstall failed for '${name}'`));
    displayError(String(err));
  }
}

/**
 * Display skill details in a box.
 */
export function displaySkillDetails(skill: SkillInfo): void {
  const toolsLine = skill.tools
    ? '\n' + chalk.gray('Tools: ') + skill.tools.map((t) => chalk.cyan(t)).join(chalk.gray(', '))
    : '';

  const authorLine = skill.author
    ? '\n' + chalk.gray('Author: ') + chalk.white(skill.author)
    : '';

  console.log(
    boxen(
      chalk.bold.white(skill.name) +
        chalk.gray(` v${skill.version}`) +
        '\n' +
        chalk.white(skill.description) +
        authorLine +
        toolsLine,
      {
        padding: 1,
        borderColor: skill.status === 'installed' ? 'green' : 'gray',
        borderStyle: 'round',
      }
    )
  );
}
