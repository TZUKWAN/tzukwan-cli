import { Command } from 'commander';
import chalk from 'chalk';
import { agentChat, agentCollaborate, agentHistory, agentList, agentReset } from './commands/agent.js';
import { configInit, configSet, configShow, ensureConfig } from './commands/config.js';
import { paperAnalyze, paperCompile, paperGenerate, paperMonitor, paperReproduce, paperReview } from './commands/paper.js';
import { searchDatasets, searchLiterature, listDatasets } from './commands/search.js';
import { skillsInstall, skillsList, skillsUpdate } from './commands/skills.js';
import { executeSinglePrompt } from './repl.js';
import { startRepl } from './tui-repl.js';
import {
  getWebServerStatus,
  restartWebServerProcess,
  startDetachedWebServer,
  startWebServer,
  stopWebServerProcess,
  waitForWebServer,
} from './web.js';
import { displayBanner } from './ui/display.js';

const VERSION = '1.0.0';

/** Parse an integer CLI option, returning `fallback` for non-numeric or missing values */
function parseIntOpt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function printWebServerStatus(host = '127.0.0.1', port = 3847): Promise<boolean> {
  const status = await getWebServerStatus(host, port);
  const stateLabel = status.reachable ? chalk.green('healthy') : status.running ? chalk.yellow('listening') : chalk.red('stopped');
  console.log(`Web service: ${stateLabel}`);
  console.log(`URL: http://${status.host}:${status.port}`);
  console.log(`Port: ${status.port}`);
  console.log(`Reachable: ${status.reachable ? 'yes' : 'no'}`);
  console.log(`PIDs: ${status.pids.length ? status.pids.join(', ') : 'none'}`);
  return status.reachable;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('tzukwan')
    .description(
      chalk.cyan('Tzukwan') +
        ' - Open-source AI agent for academic research\n' +
        chalk.gray('  Documentation: https://github.com/tzukwan/tzukwan-cli'),
    )
    .version(VERSION, '-v, --version', 'Show version number')
    .option('-p, --prompt <text>', 'Execute a single prompt and exit')
    .option('-m, --model <model>', 'Override the model for this session')
    .option('--config', 'Run the guided setup wizard')
    .addHelpText(
      'after',
      `
${chalk.bold('Examples:')}
  ${chalk.cyan('tzukwan')}                              Start interactive mode
  ${chalk.cyan('tzukwan -p "Explain transformers"')}    Single-shot query
  ${chalk.cyan('tzukwan --config')}                     Run guided setup
  ${chalk.cyan('tzukwan paper generate')}               Generate a paper
  ${chalk.cyan('tzukwan search "neural scaling"')}      Search literature
`,
    )
    // Configure help command explicitly
    .configureHelp({
      sortSubcommands: true,
      showGlobalOptions: true,
    })
    // Handle unknown commands - must be registered before any commands
    .on('command:*', (operands) => {
      console.error(chalk.red(`\n  Error: Unknown command '${operands[0]}'`));
      console.log(chalk.gray(`  Run 'tzukwan --help' to see available commands.\n`));
      process.exit(1);
    })
    // Show help when no command provided (instead of falling through to default action)
    .showHelpAfterError(chalk.gray('Run tzukwan --help for usage information.'));

  const webCmd = program
    .command('web')
    .description('Start the web interface alongside the TUI runtime')
    .option('--host <host>', 'Bind host for the web server', '127.0.0.1')
    .option('--port <port>', 'Bind port for the web server', '3847')
    .option('--serve', 'Internal: run the web server process in the foreground')
    .action(async (opts: { host?: string; port?: string; serve?: boolean }) => {
      const cfg = await ensureConfig();
      const port = parseIntOpt(opts.port, 3847);
      if (opts.serve) {
        await startWebServer({
          config: cfg,
          host: opts.host,
          port,
          autoOpenBrowser: false,
        });
        return;
      }
      const result = startDetachedWebServer(opts.host, port);
      const host = opts.host ?? '127.0.0.1';
      const ready = result.started ? await waitForWebServer(host, port, 15000) : false;
      console.log(result.message);
      if (ready) {
        console.log(`Open http://${host}:${port} in your browser.`);
      } else {
        console.log(`Web server did not become reachable on http://${host}:${port} within 15s.`);
        process.exitCode = 1;
      }
    });

  program
    .command('status')
    .description('Show background Tzukwan web service status')
    .option('--host <host>', 'Host to probe', '127.0.0.1')
    .option('--port <port>', 'Port to probe', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const reachable = await printWebServerStatus(opts.host ?? '127.0.0.1', parseIntOpt(opts.port, 3847));
      if (!reachable) process.exitCode = 1;
    });

  program
    .command('stop')
    .description('Stop the background Tzukwan web service')
    .option('--host <host>', 'Host to probe after stop', '127.0.0.1')
    .option('--port <port>', 'Port to stop', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const host = opts.host ?? '127.0.0.1';
      const port = parseIntOpt(opts.port, 3847);
      const result = stopWebServerProcess(host, port);
      console.log(result.message);
      const status = await getWebServerStatus(host, port);
      if (status.running || status.reachable) {
        console.log(chalk.red(`Web server still appears active on http://${host}:${port}.`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`Confirmed stopped on http://${host}:${port}.`));
    });

  program
    .command('restart')
    .description('Restart the background Tzukwan web service')
    .option('--host <host>', 'Bind host for the web server', '127.0.0.1')
    .option('--port <port>', 'Bind port for the web server', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const host = opts.host ?? '127.0.0.1';
      const port = parseIntOpt(opts.port, 3847);
      const result = restartWebServerProcess(host, port);
      console.log(result.message);
      if (!result.restarted) {
        process.exitCode = 1;
        return;
      }
      const ready = await waitForWebServer(host, port, 15000);
      if (!ready) {
        console.log(chalk.red(`Web server did not become reachable on http://${host}:${port} within 15s.`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`Web server is healthy on http://${host}:${port}.`));
    });

  webCmd.command('status')
    .description('Show the web server status')
    .option('--host <host>', 'Host to probe', '127.0.0.1')
    .option('--port <port>', 'Port to probe', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const reachable = await printWebServerStatus(opts.host ?? '127.0.0.1', parseIntOpt(opts.port, 3847));
      if (!reachable) process.exitCode = 1;
    });

  webCmd.command('stop')
    .description('Stop the background web server')
    .option('--host <host>', 'Host to probe after stop', '127.0.0.1')
    .option('--port <port>', 'Port to stop', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const host = opts.host ?? '127.0.0.1';
      const port = parseIntOpt(opts.port, 3847);
      const result = stopWebServerProcess(host, port);
      console.log(result.message);
      const status = await getWebServerStatus(host, port);
      if (status.running || status.reachable) {
        console.log(chalk.red(`Web server still appears active on http://${host}:${port}.`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`Confirmed stopped on http://${host}:${port}.`));
    });

  webCmd.command('restart')
    .description('Restart the background web server')
    .option('--host <host>', 'Bind host for the web server', '127.0.0.1')
    .option('--port <port>', 'Bind port for the web server', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const host = opts.host ?? '127.0.0.1';
      const port = parseIntOpt(opts.port, 3847);
      const result = restartWebServerProcess(host, port);
      console.log(result.message);
      if (!result.restarted) {
        process.exitCode = 1;
        return;
      }
      const ready = await waitForWebServer(host, port, 15000);
      if (!ready) {
        console.log(chalk.red(`Web server did not become reachable on http://${host}:${port} within 15s.`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`Web server is healthy on http://${host}:${port}.`));
    });

  webCmd.command('start')
    .description('Start the web server in the background')
    .option('--host <host>', 'Bind host for the web server', '127.0.0.1')
    .option('--port <port>', 'Bind port for the web server', '3847')
    .action(async (opts: { host?: string; port?: string }) => {
      const host = opts.host ?? '127.0.0.1';
      const port = parseIntOpt(opts.port, 3847);
      const result = startDetachedWebServer(host, port);
      console.log(result.message);
      if (!result.started) {
        process.exitCode = 1;
        return;
      }
      const ready = await waitForWebServer(host, port, 15000);
      if (!ready) {
        console.log(chalk.red(`Web server did not become reachable on http://${host}:${port} within 15s.`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`Web server is healthy on http://${host}:${port}.`));
    });

  program
    .command('version')
    .description('Display version information')
    .action(() => {
      displayBanner(VERSION);
      console.log(chalk.gray(`  Node.js: ${process.version}`));
      console.log(chalk.gray(`  Platform: ${process.platform}`));
      console.log();
    });

  const configCmd = program.command('config').description('Manage Tzukwan configuration');

  configCmd
    .command('init')
    .description('Run guided setup for Base URL, API key, model, profile, and research needs')
    .action(async () => {
      await configInit();
    });

  configCmd
    .command('show')
    .description('Display current configuration')
    .action(async () => {
      await configShow();
    });

  configCmd
    .command('set <key> <value>')
    .description(
      'Set a configuration value\n' +
      chalk.gray('  Keys: api_key, base_url, model'),
    )
    .action(async (key: string, value: string) => {
      await configSet(key, value);
    });

  const paperCmd = program
    .command('paper')
    .description('Paper Factory - generate, analyze, and reproduce academic papers');

  paperCmd
    .command('generate')
    .description('Generate a new research paper using AI')
    .option('-t, --topic <topic>', 'Paper topic or research question')
    .option('--field <field>', 'Research field, e.g. economics|healthcare|ai', 'general')
    .option('--type <type>', 'Paper type: journal|master|phd', 'journal')
    .option('-o, --output <dir>', 'Output directory for generated files', './output')
    .option('-f, --format <fmt>', 'Output format: markdown|latex|docx', 'markdown')
    .option('--resume [paperId]', 'Resume generation from the latest checkpoint, or from the given paper ID')
    .option('--checkpoint-interval <minutes>', 'Save a checkpoint every N minutes (default: 5)', '5')
    .action(async (opts: {
      topic?: string;
      output?: string;
      format?: string;
      field?: string;
      type?: 'journal' | 'master' | 'phd';
      resume?: string | boolean;
      checkpointInterval?: string;
    }) => {
      // --resume with no value is parsed as true by commander; normalise to empty string
      // so downstream code can distinguish "resume latest" vs "resume <id>".
      const resumeValue: string | undefined = opts.resume === true ? '' : (opts.resume || undefined);
      await paperGenerate({
        topic: opts.topic,
        output: opts.output,
        format: opts.format,
        field: opts.field,
        type: opts.type,
        resume: resumeValue,
        checkpointInterval: parseIntOpt(opts.checkpointInterval, 5),
      });
    });

  paperCmd
    .command('analyze <id>')
    .description('Analyze an arXiv paper by its ID, for example 2301.00001')
    .option('-o, --output <dir>', 'Output directory for analysis report')
    .action(async (id: string, opts: { output?: string }) => {
      await paperAnalyze(id, { output: opts.output });
    });

  paperCmd
    .command('reproduce <id>')
    .description('Generate a reproduction package for an arXiv paper')
    .option('-o, --output <dir>', 'Output directory for reproduction files')
    .action(async (id: string, opts: { output?: string }) => {
      await paperReproduce(id, { output: opts.output });
    });

  paperCmd
    .command('monitor')
    .description('Fetch the latest arXiv papers in specified categories')
    .option('-l, --limit <n>', 'Maximum number of papers to show', '20')
    .option('--categories <list>', 'Comma-separated arXiv categories', 'cs.AI')
    .option('-o, --output <dir>', 'Output directory to save paper list')
    .action(async (opts: { limit?: string; output?: string; categories?: string }) => {
      await paperMonitor({
        limit: parseIntOpt(opts.limit, 20),
        categories: opts.categories
          ? opts.categories.split(',').map((item) => item.trim()).filter(Boolean)
          : ['cs.AI'],
        output: opts.output,
      });
    });

  paperCmd
    .command('review <topic>')
    .description('Generate a literature review on a topic')
    .option('-l, --limit <n>', 'Number of papers to include', '30')
    .option('-o, --output <dir>', 'Output directory for the review document')
    .action(async (topic: string, opts: { limit?: string; output?: string }) => {
      await paperReview(topic, {
        limit: parseIntOpt(opts.limit, 30),
        output: opts.output,
      });
    });

  paperCmd
    .command('compile <tex-file>')
    .description('Compile a LaTeX file to PDF using system TeX Live')
    .option('-e, --engine <engine>', 'LaTeX engine: xelatex|pdflatex|lualatex', 'xelatex')
    .option('-o, --output <dir>', 'Output directory for the PDF')
    .option('-t, --times <n>', 'Number of compile passes for cross-references', '2')
    .option('--bibtex', 'Enable bibliography processing with bibtex/biber')
    .action(async (texFile: string, opts: { engine?: string; output?: string; times?: string; bibtex?: boolean }) => {
      await paperCompile(texFile, {
        engine: opts.engine,
        output: opts.output,
        times: parseIntOpt(opts.times, 2),
        bibtex: opts.bibtex,
      });
    });

  program
    .command('search <query>')
    .description('Search academic literature')
    .option('-s, --source <src>', 'Search source: arxiv|pubmed|semantic-scholar|all', 'all')
    .option('-l, --limit <n>', 'Maximum number of results', '10')
    .option('-y, --year <year>', 'Filter by publication year')
    .option('--sort <field>', 'Sort by: relevance|date|citations', 'relevance')
    .action(async (
      query: string,
      opts: {
        source?: string;
        limit?: string;
        year?: string;
        sort?: string;
      },
    ) => {
      await searchLiterature(query, {
        source: opts.source as 'arxiv' | 'pubmed' | 'semantic-scholar' | 'all',
        limit: parseIntOpt(opts.limit, 10),
        year: opts.year ? parseIntOpt(opts.year, 0) || undefined : undefined,
        sort: opts.sort as 'relevance' | 'date' | 'citations',
      });
    });

  const datasetCmd = program.command('dataset').description('Search and browse public datasets');

  datasetCmd
    .command('search <query>')
    .description('Search awesome-public-datasets by keyword')
    .option('-l, --limit <n>', 'Maximum number of results', '20')
    .action(async (query: string, opts: { limit?: string }) => {
      await searchDatasets(query, {
        limit: parseIntOpt(opts.limit, 20),
      });
    });

  datasetCmd
    .command('list')
    .description('List all dataset categories')
    .option('--field <field>', 'Show only a specific dataset category')
    .action(async (opts: { field?: string }) => {
      await listDatasets(opts.field);
    });

  const skillsCmd = program.command('skills').description('Manage Tzukwan skills');

  skillsCmd
    .command('list')
    .description('List all installed skills and available tools')
    .action(async () => {
      await skillsList();
    });

  skillsCmd
    .command('install <source>')
    .description('Install a skill by name, URL, or local path')
    .action(async (source: string) => {
      await skillsInstall(source);
    });

  skillsCmd
    .command('update <sourceOrName>')
    .description('Update an installed skill by name or original source')
    .action(async (sourceOrName: string) => {
      await skillsUpdate(sourceOrName);
    });

  const qqbotCmd = program.command('qqbot').description('Manage QQ Bot bridge service');

  qqbotCmd
    .command('start')
    .description('Start the QQ Bot bridge service')
    .action(async () => {
      const { QQBridge } = await import('@tzukwan/core');
      const { loadCore } = await import('./repl.js');
      const cfg = await ensureConfig();
      const core = await loadCore(cfg);

      if (!core?.orchestrator) {
        console.error('❌ Tzukwan core not loaded. Please check your configuration.');
        return;
      }

      const bridge = new QQBridge();
      const config = bridge.getConfig();

      if (!config.enabled) {
        console.log('⚠️  QQ Bot not configured yet. Run "tzukwan qqbot config" first.');
        return;
      }

      // Start the bridge
      bridge.start(async (text, sessionId, context) => {
        try {
          const response = await core.orchestrator!.chat(text, () => {});
          return response;
        } catch (error) {
          return `❌ Error: ${String(error)}`;
        }
      });

      console.log(`✅ QQ Bot service started on http://${config.host}:${config.port}`);
      console.log('Press Ctrl+C to stop');

      // Keep process alive
      await new Promise(() => {});
    });

  qqbotCmd
    .command('config')
    .description('Configure QQ Bot settings')
    .action(async () => {
      const { QQBridge } = await import('@tzukwan/core');
      const bridge = new QQBridge();
      const currentConfig = bridge.getConfig();

      console.log('\n=== QQ Bot Configuration ===\n');
      console.log('Current settings:');
      console.log(`  Port: ${currentConfig.port}`);
      console.log(`  Command Prefix: ${currentConfig.commandPrefix}`);
      console.log(`  Private Messages: ${currentConfig.enablePrivate ? 'enabled' : 'disabled'}`);
      console.log(`  Group Messages: ${currentConfig.enableGroup ? 'enabled' : 'disabled'}`);
      console.log(`  Require @ in Group: ${currentConfig.requireAtInGroup ? 'yes' : 'no'}`);
      console.log('');
      console.log('To change settings, use the REPL command: /qqbot config');
    });

  qqbotCmd
    .command('status')
    .description('Show QQ Bot status')
    .action(async () => {
      const { QQBridge } = await import('@tzukwan/core');
      const bridge = new QQBridge();
      const config = bridge.getConfig();

      console.log('QQ Bot Status:');
      console.log(`  Configured: ${config.enabled ? '✅ Yes' : '❌ No'}`);
      console.log(`  Running: ${bridge.isRunning() ? '✅ Yes' : '⏹️  No'}`);
      console.log(`  Endpoint: http://${config.host}:${config.port}`);
    });

  // Chat command (shortcut for interactive chat)
  program
    .command('chat [message]')
    .description('Start an interactive chat or send a single message')
    .option('-a, --agent <agentId>', 'Target specific agent')
    .action(async (message: string | undefined, opts: { agent?: string }) => {
      const cfg = await ensureConfig();
      if (message) {
        if (opts.agent) {
          await agentChat(opts.agent, message, cfg);
        } else {
          await executeSinglePrompt(message, cfg);
        }
      } else {
        await startRepl({ config: cfg });
      }
    });

  // MCP command
  const mcpCmd = program.command('mcp').description('Manage MCP (Model Context Protocol) servers');

  mcpCmd
    .command('list')
    .description('List configured MCP servers')
    .action(async () => {
      const { listMcpServers } = await import('./commands/mcp.js');
      await listMcpServers();
    });

  mcpCmd
    .command('add <name> <url>')
    .description('Add a new MCP server')
    .option('-t, --type <type>', 'Server type: stdio|sse', 'stdio')
    .action(async (name: string, url: string, opts: { type?: string }) => {
      const { addMcpServer } = await import('./commands/mcp.js');
      await addMcpServer(name, url, opts.type as 'stdio' | 'sse');
    });

  mcpCmd
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      const { removeMcpServer } = await import('./commands/mcp.js');
      await removeMcpServer(name);
    });

  mcpCmd
    .command('test <name>')
    .description('Test connection to an MCP server')
    .action(async (name: string) => {
      const { testMcpServer } = await import('./commands/mcp.js');
      await testMcpServer(name);
    });

  const agentCmd = program.command('agent').description('Manage and interact with specialized AI agents');

  agentCmd
    .command('list')
    .description('List all available specialized agents')
    .action(async () => {
      await agentList();
    });

  agentCmd
    .command('chat <agentId> <message>')
    .description('Send a message to a specific agent')
    .action(async (agentId: string, message: string) => {
      const cfg = await ensureConfig();
      await agentChat(agentId, message, cfg);
    });

  agentCmd
    .command('collab <task>')
    .description('Start a multi-agent collaboration on a task')
    .option('--agents <ids>', 'Comma-separated agent IDs, default is all')
    .action(async (task: string, opts: { agents?: string }) => {
      const cfg = await ensureConfig();
      const ids = opts.agents ? opts.agents.split(',').map((item) => item.trim()) : undefined;
      await agentCollaborate(task, cfg, ids);
    });

  agentCmd
    .command('history <agentId>')
    .description('Show conversation history for an agent')
    .action(async (agentId: string) => {
      const cfg = await ensureConfig();
      await agentHistory(agentId, cfg);
    });

  agentCmd
    .command('reset <agentId>')
    .description('Reset conversation history for an agent')
    .action(async (agentId: string) => {
      const cfg = await ensureConfig();
      await agentReset(agentId, cfg);
    });

  program.action(async (opts: { prompt?: string; model?: string; config?: boolean }, command: Command) => {
    // Check if there are any unknown arguments (treat them as unknown commands)
    const args = command.args;
    if (args.length > 0 && !opts.prompt) {
      console.error(chalk.red(`\n  Error: Unknown command '${args[0]}'`));
      console.log(chalk.gray(`  Run 'tzukwan --help' to see available commands.\n`));
      process.exit(1);
    }

    if (opts.config) {
      await configInit();
      return;
    }

    const cfg = await ensureConfig();

    if (opts.prompt) {
      await executeSinglePrompt(opts.prompt, cfg, opts.model);
      return;
    }

    await startRepl({ config: cfg, model: opts.model });
  });

  return program;
}
