// QQ Bot command handler
// Handles /qqbot start|stop|status|config|whitelist

import * as readline from 'readline';
import type { QQBridge as QQBridgeType, SessionContext, HookEvent, HookContext } from '@tzukwan/core';
import type { Config } from './config.js';
import type { REPLState } from '../repl.js';

interface CoreAPI {
  orchestrator: {
    chat: (message: string, onStream?: (chunk: string) => void) => Promise<string>;
    getActiveAgent: () => { name: string; emoji: string } | null;
  };
  hookManager?: {
    trigger: (event: HookEvent, context: HookContext) => Promise<void>;
  };
}

/**
 * Prompt the user for a single line of input
 */
function promptInput(question: string): Promise<string> {
  return new Promise(resolve => {
    const iface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    process.stdout.write(question);
    iface.once('line', (line: string) => {
      iface.close();
      resolve(line.trim());
    });
  });
}

// Global bridge instance and state
let globalBridge: QQBridgeType | null = null;
let globalCore: CoreAPI | null = null;

/**
 * Handle incoming QQ message using tzukwan core
 */
async function handleQQMessage(
  text: string,
  sessionId: string,
  _context: SessionContext,
): Promise<string> {
  if (!globalCore?.orchestrator) {
    return '❌ Tzukwan 核心未初始化';
  }

  try {
    // Pass text directly to orchestrator — it manages conversation history internally.
    // Previously injecting context.messages as prefix caused double-injection since
    // the orchestrator already maintains per-session history.
    const response = await globalCore.orchestrator.chat(text, (chunk) => {
      // Stream callback placeholder - progress indication if needed
      void chunk;
    });

    // Trigger hook if available
    if (globalCore.hookManager) {
      try {
        await globalCore.hookManager.trigger('post-message', {
          event: 'post-message',
          timestamp: new Date().toISOString(),
          agentId: 'qqbot',
          message: response,
        });
      } catch (hookErr) {
        console.warn('[QQ Bot] post-message hook error:', hookErr instanceof Error ? hookErr.message : hookErr);
      }
    }

    return response;
  } catch (error) {
    console.error('[QQ Bot] Error handling message:', error);
    return `❌ 处理消息时出错: ${String(error)}`;
  }
}

/**
 * Start the QQ Bot server
 */
async function startBridge(bridge: QQBridgeType, core: CoreAPI): Promise<string> {
  if (bridge.isRunning()) {
    return '⚠️ QQ Bot 服务已经在运行中';
  }

  globalBridge = bridge;
  globalCore = core;

  try {
    bridge.start(handleQQMessage);
    return `✅ QQ Bot 服务已启动\n监听地址: http://${bridge.getConfig().host}:${bridge.getConfig().port}\n请配置 go-cqhttp 的 HTTP 上报地址指向上述地址`;
  } catch (error) {
    return `❌ 启动失败: ${String(error)}`;
  }
}

/**
 * Stop the QQ Bot server
 */
async function stopBridge(bridge: QQBridgeType): Promise<string> {
  if (!bridge.isRunning()) {
    return '⚠️ QQ Bot 服务未在运行';
  }

  try {
    bridge.stop();
  } finally {
    globalBridge = null;
  }
  return '✅ QQ Bot 服务已停止';
}

/**
 * Configure QQ Bot settings
 */
async function configureBridge(bridge: QQBridgeType): Promise<string> {
  console.log('\n=== QQ Bot 配置向导 ===\n');
  console.log('此向导将配置 QQ Bot 桥接服务参数。\n');

  const currentConfig = bridge.getConfig();

  // Port
  const portInput = await promptInput(`监听端口 [${currentConfig.port}]: `);
  const port = portInput ? parseInt(portInput, 10) : currentConfig.port;
  if (portInput && (isNaN(port) || port < 1 || port > 65535)) {
    return '❌ 配置取消：无效的端口号';
  }

  // Command prefix
  const prefix = await promptInput(`命令前缀 [${currentConfig.commandPrefix}]: `);

  // Enable private
  const privateInput = await promptInput(`启用私聊消息 [${currentConfig.enablePrivate ? 'Y' : 'N'}]: `);
  const enablePrivate = privateInput
    ? privateInput.toLowerCase().startsWith('y')
    : currentConfig.enablePrivate;

  // Enable group
  const groupInput = await promptInput(`启用群聊消息 [${currentConfig.enableGroup ? 'Y' : 'N'}]: `);
  const enableGroup = groupInput
    ? groupInput.toLowerCase().startsWith('y')
    : currentConfig.enableGroup;

  // Require @ in group
  const atInput = await promptInput(`群聊中是否需要@机器人 [${currentConfig.requireAtInGroup ? 'Y' : 'N'}]: `);
  const requireAtInGroup = atInput
    ? atInput.toLowerCase().startsWith('y')
    : currentConfig.requireAtInGroup;

  // Max message length
  const maxLenInput = await promptInput(`最大消息长度 [${currentConfig.maxMessageLength}]: `);
  const parsedMaxLen = maxLenInput ? parseInt(maxLenInput, 10) : NaN;
  if (maxLenInput && (isNaN(parsedMaxLen) || parsedMaxLen < 1)) {
    return '❌ 配置取消：无效的最大消息长度';
  }
  const maxMessageLength = !isNaN(parsedMaxLen) ? parsedMaxLen : currentConfig.maxMessageLength;

  bridge.configure({
    enabled: true,
    port,
    commandPrefix: prefix || currentConfig.commandPrefix,
    enablePrivate,
    enableGroup,
    requireAtInGroup,
    maxMessageLength,
  });

  return '✅ QQ Bot 配置已保存';
}

/**
 * Manage whitelist
 */
async function manageWhitelist(bridge: QQBridgeType, args: string[]): Promise<string> {
  const subCommand = args[1]?.toLowerCase();
  const currentConfig = bridge.getConfig();

  if (subCommand === 'add') {
    const type = args[2]?.toLowerCase();
    const id = args[3];

    if (!type || !id) {
      return '用法: /qqbot whitelist add <user|group> <id>';
    }

    if (type === 'user') {
      const newList = [...new Set([...currentConfig.userWhitelist, id])];
      bridge.configure({ ...currentConfig, userWhitelist: newList });
      return `✅ 已添加用户 ${id} 到白名单`;
    } else if (type === 'group') {
      const newList = [...new Set([...currentConfig.groupWhitelist, id])];
      bridge.configure({ ...currentConfig, groupWhitelist: newList });
      return `✅ 已添加群组 ${id} 到白名单`;
    } else {
      return '类型必须是 user 或 group';
    }
  }

  if (subCommand === 'remove') {
    const type = args[2]?.toLowerCase();
    const id = args[3];

    if (!type || !id) {
      return '用法: /qqbot whitelist remove <user|group> <id>';
    }

    if (type === 'user') {
      const newList = currentConfig.userWhitelist.filter(u => u !== id);
      bridge.configure({ ...currentConfig, userWhitelist: newList });
      return `✅ 已从白名单移除用户 ${id}`;
    } else if (type === 'group') {
      const newList = currentConfig.groupWhitelist.filter(g => g !== id);
      bridge.configure({ ...currentConfig, groupWhitelist: newList });
      return `✅ 已从白名单移除群组 ${id}`;
    } else {
      return '类型必须是 user 或 group';
    }
  }

  if (subCommand === 'clear') {
    const type = args[2]?.toLowerCase();
    if (type === 'user') {
      bridge.configure({ ...currentConfig, userWhitelist: [] });
      return '✅ 用户白名单已清空';
    } else if (type === 'group') {
      bridge.configure({ ...currentConfig, groupWhitelist: [] });
      return '✅ 群组白名单已清空';
    } else if (type === 'all') {
      bridge.configure({ ...currentConfig, userWhitelist: [], groupWhitelist: [] });
      return '✅ 白名单已全部清空';
    } else {
      return '用法: /qqbot whitelist clear <user|group|all>';
    }
  }

  // Show current whitelist
  const users = currentConfig.userWhitelist;
  const groups = currentConfig.groupWhitelist;

  return [
    '当前白名单设置：',
    '',
    `用户白名单 (${users.length}): ${users.join(', ') || '(空 - 允许所有用户)'}`,
    `群组白名单 (${groups.length}): ${groups.join(', ') || '(空 - 允许所有群组)'}`,
    '',
    '用法：',
    '  /qqbot whitelist add <user|group> <id>',
    '  /qqbot whitelist remove <user|group> <id>',
    '  /qqbot whitelist clear <user|group|all>',
  ].join('\n');
}

/**
 * Main entry point for /qqbot sub-commands
 */
export async function handleQQBotCommand(
  args: string[],
  bridge: QQBridgeType | null,
  core: CoreAPI | null,
): Promise<string> {
  const sub = (args[0] ?? '').toLowerCase();

  if (!bridge) {
    return '❌ QQ Bridge 未初始化';
  }

  // ── start ────────────────────────────────────────────────────────────────
  if (sub === 'start') {
    if (!core?.orchestrator) {
      return '❌ Tzukwan 核心未加载，无法启动 QQ Bot';
    }
    return startBridge(bridge, core);
  }

  // ── stop ─────────────────────────────────────────────────────────────────
  if (sub === 'stop') {
    return stopBridge(bridge);
  }

  // ── status ───────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const config = bridge.getConfig();
    const isRunning = bridge.isRunning();

    return [
      'QQ Bot 状态：',
      '',
      `运行状态: ${isRunning ? '✅ 运行中' : '⏹️ 已停止'}`,
      `服务地址: http://${config.host}:${config.port}`,
      `命令前缀: ${config.commandPrefix}`,
      `私聊消息: ${config.enablePrivate ? '✅ 启用' : '❌ 禁用'}`,
      `群聊消息: ${config.enableGroup ? '✅ 启用' : '❌ 禁用'}`,
      `群聊需要@: ${config.requireAtInGroup ? '✅ 是' : '❌ 否'}`,
      `最大消息长度: ${config.maxMessageLength}`,
      `用户白名单: ${config.userWhitelist.length} 个`,
      `群组白名单: ${config.groupWhitelist.length} 个`,
    ].join('\n');
  }

  // ── config ───────────────────────────────────────────────────────────────
  if (sub === 'config') {
    return configureBridge(bridge);
  }

  // ── whitelist ────────────────────────────────────────────────────────────
  if (sub === 'whitelist') {
    return manageWhitelist(bridge, args);
  }

  // ── help / default ───────────────────────────────────────────────────────
  return [
    '用法: /qqbot <子命令>',
    '',
    '  start     — 启动 QQ Bot 服务',
    '  stop      — 停止 QQ Bot 服务',
    '  status    — 查看服务状态',
    '  config    — 配置向导',
    '  whitelist — 管理白名单 (add/remove/clear)',
    '',
    '配置说明：',
    '  1. 运行 /qqbot config 配置基本参数',
    '  2. 运行 /qqbot start 启动服务',
    '  3. 配置 go-cqhttp 的 HTTP 上报地址为服务地址',
    '  4. 在 QQ 中使用 "<前缀> <消息>" 触发 AI 回复',
  ].join('\n');
}
