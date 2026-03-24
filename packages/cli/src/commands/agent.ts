import chalk from 'chalk';
import { displayError, displayInfo, displaySuccess } from '../ui/display.js';
import type { CLIRuntime } from '../shared/runtime.js';
import { loadCLIRuntime } from '../shared/runtime.js';
import type { Config } from './config.js';

async function loadRuntime(config: Config): Promise<CLIRuntime | null> {
  try {
    const runtime = await loadCLIRuntime(config, { useCache: false, cwd: process.cwd() });
    for (const warning of runtime.warnings) {
      displayInfo(`${warning.source}: ${warning.message}`);
    }
    return runtime;
  } catch (err) {
    displayError(`Failed to initialize agent runtime: ${String(err)}`);
    return null;
  }
}

export async function agentList(_config?: Config): Promise<void> {
  try {
    const core = await import('@tzukwan/core');
    const agents = core.BUILTIN_AGENTS;
    console.log('\n' + chalk.bold.cyan('Available Agents') + '\n');
    for (const agent of agents) {
      console.log(`  ${agent.emoji} ${chalk.bold.white(agent.name)}`);
      console.log(`     ${chalk.gray('ID:')} ${chalk.cyan(agent.id.padEnd(15))} ${chalk.gray('Role:')} ${chalk.white(agent.role)}`);
      console.log(`     ${chalk.gray(agent.description)}`);
      console.log(`     ${chalk.gray('Capabilities:')} ${chalk.white(agent.capabilities.slice(0, 4).join(', '))}`);
      console.log();
    }
    console.log(chalk.gray('  Examples:'));
    console.log(chalk.gray('    tzukwan agent chat advisor "Help me plan a literature review"'));
    console.log(chalk.gray('    tzukwan agent collab "Critique this experiment design"'));
    console.log();
  } catch (err) {
    displayError(`Failed to load agents: ${String(err)}`);
  }
}

export async function agentChat(agentId: string, message: string, config: Config): Promise<void> {
  const runtime = await loadRuntime(config);
  if (!runtime) return;
  const { orchestrator } = runtime;

  const agent = orchestrator.getAgent(agentId);
  if (!agent) {
    displayError(`Unknown agent: ${agentId}. Run \`tzukwan agent list\` to inspect available agents.`);
    runtime.mcpManager.stopAll();
    return;
  }

  console.log(`\n${agent.emoji} ${chalk.bold.cyan(agent.name)} (${chalk.gray(agent.role)})\n`);
  console.log(chalk.gray('─'.repeat(60)));
  process.stdout.write('\n');

  try {
    await orchestrator.chatWithAgent(agentId, message, (chunk) => {
      process.stdout.write(chunk);
    });
    process.stdout.write('\n\n');
    orchestrator.saveConversations();
  } catch (err) {
    process.stdout.write('\n');
    displayError(`Agent response failed: ${String(err)}`);
    process.exitCode = 1;
  } finally {
    runtime.mcpManager.stopAll();
  }
}

export async function agentCollaborate(task: string, config: Config, agentIds?: string[]): Promise<void> {
  const runtime = await loadRuntime(config);
  if (!runtime) return;
  const { orchestrator } = runtime;

  const targetIds = agentIds ?? orchestrator.getAgents().map((agent) => agent.id);

  console.log('\n' + chalk.bold.cyan('Multi-Agent Collaboration'));
  console.log(chalk.gray(`Task: ${task}`));
  console.log(chalk.gray(`Agents: ${targetIds.join(', ')}\n`));
  console.log(chalk.gray('─'.repeat(60)));

  try {
    const result = await orchestrator.collaborate(task, targetIds, (update) => {
      process.stdout.write(chalk.yellow(update));
    });

    console.log('\n' + chalk.bold.green('Synthesis') + '\n');
    console.log(result.synthesis);
    console.log(chalk.gray('\nAgent contribution preview:'));
    for (const contribution of result.contributions) {
      const agent = orchestrator.getAgent(contribution.agentId);
      const preview = contribution.response.length > 120
        ? `${contribution.response.slice(0, 120)}...`
        : contribution.response;
      console.log(`  ${(agent?.emoji ?? '•')} ${chalk.bold.white(contribution.agentName)}: ${chalk.gray(preview)}`);
    }
    console.log();
    orchestrator.saveConversations();
  } catch (err) {
    displayError(`Collaboration failed: ${String(err)}`);
    process.exitCode = 1;
  } finally {
    runtime.mcpManager.stopAll();
  }
}

export async function agentHistory(agentId: string, config: Config): Promise<void> {
  const runtime = await loadRuntime(config);
  if (!runtime) return;
  const { orchestrator } = runtime;

  const agent = orchestrator.getAgent(agentId);
  if (!agent) {
    displayError(`Unknown agent: ${agentId}`);
    runtime.mcpManager.stopAll();
    return;
  }

  const conversation = orchestrator.getConversation(agentId);
  if (conversation.messages.length === 0) {
    displayInfo(`${agent.emoji} ${agent.name} has no conversation history yet.`);
    runtime.mcpManager.stopAll();
    return;
  }

  console.log(`\n${agent.emoji} ${chalk.bold.cyan(agent.name)} conversation history (${conversation.messages.length} messages)\n`);
  conversation.messages.forEach((message, index) => {
    const label = message.role === 'user'
      ? chalk.bold.blue('User')
      : `${agent.emoji} ${chalk.bold.cyan(agent.name)}`;
    const content = Array.isArray(message.content)
      ? message.content.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c) ? (c as { text: string }).text : '').join(' ')
      : (message.content ?? '');
    const preview = content.length > 200
      ? `${content.slice(0, 200)}...`
      : content;
    console.log(`${chalk.gray(`${index + 1}.`)} ${label}:\n${chalk.white(preview)}\n`);
  });
  runtime.mcpManager.stopAll();
}

export async function agentReset(agentId: string, config: Config): Promise<void> {
  const runtime = await loadRuntime(config);
  if (!runtime) return;
  const { orchestrator } = runtime;

  const agent = orchestrator.getAgent(agentId);
  if (!agent) {
    displayError(`Unknown agent: ${agentId}`);
    runtime.mcpManager.stopAll();
    return;
  }

  orchestrator.resetConversation(agentId);
  orchestrator.saveConversations();
  displaySuccess(`${agent.emoji} ${agent.name} conversation history cleared.`);
  runtime.mcpManager.stopAll();
}
