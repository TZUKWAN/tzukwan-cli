import type { Skill } from './types.js';
import { SkillLoader } from './loader.js';

/**
 * Global singleton registry that holds all loaded skills in memory.
 *
 * Usage:
 * ```ts
 * const registry = SkillRegistry.getInstance();
 * await registry.initialize(SkillLoader.getDefaultSearchPaths());
 *
 * const arxiv = registry.get('arxiv');
 * const results = await registry.search('paper');
 * ```
 */
export class SkillRegistry {
  private static instance: SkillRegistry | null = null;

  /** Map of skill name → Skill instance. */
  private skills: Map<string, Skill> = new Map();

  /** Internal loader instance used by `initialize()`. */
  private loader: SkillLoader = new SkillLoader();

  /** Prevent external construction; use `getInstance()`. */
  private constructor() {}

  /**
   * Return the singleton instance of the registry.
   * The first call lazily creates the instance.
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * (Testing only) Reset the singleton instance.
   * This clears all registered skills.
   */
  static resetInstance(): void {
    SkillRegistry.instance = null;
  }

  /**
   * Register a skill.  If a skill with the same name already exists,
   * it is overwritten (last-one-wins semantics).
   *
   * @param skill  The skill to register.
   */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * Retrieve a skill by its exact name.
   *
   * @param name  The skill name (case-sensitive).
   * @returns     The skill, or `undefined` if not found.
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Return an array of all registered skills.
   * The order is insertion order.
   */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Search skills by name, description, or trigger keywords.
   * The search is case-insensitive and performs substring matching.
   *
   * @param query  The search string.
   * @returns      Skills that match the query.
   */
  search(query: string): Skill[] {
    const q = query.toLowerCase();
    return this.list().filter((skill) => {
      const inName = skill.name.toLowerCase().includes(q);
      const inDesc = skill.description.toLowerCase().includes(q);
      const inTriggers = skill.triggers.some((t) => t.toLowerCase().includes(q));
      return inName || inDesc || inTriggers;
    });
  }

  /**
   * Check whether a skill with the given name is registered.
   *
   * @param name  The skill name.
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Unregister a skill by name.
   *
   * @param name  The skill name.
   * @returns     `true` if the skill existed and was removed.
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Clear all registered skills.
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Load skills from multiple directories and register them.
   *
   * Directories are processed in order; later skills with the same name
   * overwrite earlier ones (allowing user-local to override built-in).
   *
   * @param paths  Array of absolute directory paths.
   */
  async initialize(paths: string[]): Promise<void> {
    for (const dir of paths) {
      const loaded = await this.loader.loadSkillsFromDir(dir);
      for (const skill of loaded) {
        this.register(skill);
      }
    }
  }

  /**
   * Convenience method: initialize using the default search paths
   * (local project → user home → built-in).
   *
   * @param cwd  Optional working directory for the local project path.
   */
  async initializeDefault(cwd?: string): Promise<void> {
    const paths = SkillLoader.getDefaultSearchPaths(cwd);
    await this.initialize(paths);
  }
}
