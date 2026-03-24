import type { TzukwanConfig } from '@tzukwan/core';

/**
 * Minimal interface covering the LLM client methods used by skills.
 * Skills should only depend on this interface, not on the concrete LLMClient class.
 */
export interface LLMClientInterface {
  chat: (messages: { role: string; content: string }[], options?: Record<string, unknown>) => Promise<{ content: string }>;
  chatStream: (
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: Record<string, unknown>
  ) => Promise<{ content: string }>;
  isAvailable: () => Promise<boolean>;
}

/**
 * Execution context passed to every skill command.
 */
export interface SkillContext {
  /** An initialised LLM client instance (any OpenAI-compatible client). */
  llmClient: LLMClientInterface;
  /** The active tzukwan configuration. */
  config: TzukwanConfig;
  /** The current working directory from which the CLI was invoked. */
  workDir: string;
}

/**
 * A single executable command provided by a skill.
 */
export interface SkillCommand {
  /** Command name (e.g. "search", "fetch"). */
  name: string;
  /** Human-readable description of what the command does. */
  description: string;
  /** Execute the command and return any structured result. */
  execute: (args: Record<string, unknown>, context: SkillContext) => Promise<unknown>;
}

/**
 * A fully resolved skill, ready to be registered and invoked.
 */
export interface Skill {
  /** Unique skill identifier (kebab-case, e.g. "arxiv"). */
  name: string;
  /** Semantic version string (e.g. "1.0.0"). */
  version: string;
  /** One-line description of the skill's purpose. */
  description: string;
  /** Words or phrases that trigger this skill in conversational mode. */
  triggers: string[];
  /** All commands exposed by this skill. */
  commands: SkillCommand[];
  /** Optional author name or organisation. */
  author?: string;
  /** Absolute path to the directory from which this skill was loaded. */
  sourceDir?: string;
}

/**
 * The structured data extracted by parsing a SKILL.md frontmatter block.
 */
export interface SkillManifest {
  /** Skill name from frontmatter. */
  name: string;
  /** Version string from frontmatter. */
  version: string;
  /** Short description from frontmatter. */
  description: string;
  /** Author from frontmatter (optional). */
  author?: string;
  /** Raw markdown body (everything after the frontmatter fence). */
  body: string;
  /** Trigger keywords parsed from the body (## 触发词 / ## Triggers section). */
  triggers: string[];
  /** Command names parsed from the body (## 命令 / ## Commands section). */
  commandNames: string[];
}

/**
 * Metadata about a skill that has been installed into ~/.tzukwan/skills/.
 */
export interface InstalledSkill {
  /** Skill name. */
  name: string;
  /** Installed version. */
  version: string;
  /** Original source (URL or local path used during install). */
  source: string;
  /** Absolute path to the installed directory. */
  installDir: string;
  /** ISO-8601 timestamp of installation. */
  installedAt: string;
}
