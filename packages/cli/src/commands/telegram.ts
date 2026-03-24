// Telegram command handler for the REPL
// Handles /telegram setup|test|status|on|off

import * as readline from 'readline';
import type { TelegramBridge as TelegramBridgeType } from '@tzukwan/core';

/**
 * Prompt the user for a single line of input (used in setup wizard).
 * Uses the process stdin/stdout directly to avoid disrupting the main rl interface.
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

/**
 * Main entry point for /telegram sub-commands.
 *
 * @param args   The tokens after "/telegram" (e.g. ["setup"] or ["on"])
 * @param bridge An already-constructed TelegramBridge instance, or null if not yet loaded
 * @returns      A string to display to the user
 */
export async function handleTelegramCommand(
  args: string[],
  bridge: TelegramBridgeType | null,
): Promise<string> {
  const sub = (args[0] ?? '').toLowerCase();

  // ── setup ─────────────────────────────────────────────────────────────────
  if (sub === 'setup') {
    if (!bridge) {
      return '❌ Telegram bridge 未初始化。';
    }
    console.log('\n=== Telegram Bot 配置向导 ===\n');
    console.log('您需要一个 Telegram Bot Token 和 Chat ID。');
    console.log('1. 在 Telegram 中找 @BotFather，发送 /newbot 获取 token。');
    console.log('2. Chat ID: 向 @userinfobot 发送任意消息可获取您的 chat id。\n');

    const token = await promptInput('请输入 Bot Token: ');
    if (!token) return '❌ 配置取消：未输入 Bot Token。';

    const chatId = await promptInput('请输入 Chat ID: ');
    if (!chatId) return '❌ 配置取消：未输入 Chat ID。';

    // Save config
    bridge.configure(token, chatId);

    // Test connection
    process.stdout.write('\n正在测试连接...\n');
    const test = await bridge.testConnection();
    if (test.ok) {
      return `✅ 配置成功！Bot: ${test.botName ?? 'unknown'}\n已保存到 ~/.tzukwan/telegram.json`;
    } else {
      return `⚠️  配置已保存，但连接测试失败: ${test.error ?? 'unknown error'}\n请检查 token 是否正确。`;
    }
  }

  // ── test ──────────────────────────────────────────────────────────────────
  if (sub === 'test') {
    if (!bridge) return '❌ Telegram bridge 未初始化。';
    if (!bridge.isConfigured()) {
      return '❌ Telegram 未配置。请先运行 /telegram setup';
    }
    const ok = await bridge.sendMessage(
      '🤖 *Tzukwan CLI* 测试消息\n\nTelegram 通知功能正常工作！',
      { parseMode: 'Markdown' },
    );
    return ok ? '✅ 测试消息已发送！' : '❌ 发送失败，请检查网络或配置。';
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (sub === 'status') {
    if (!bridge) return '❌ Telegram bridge 未初始化。';
    if (!bridge.isConfigured()) {
      return 'Telegram 状态: ❌ 未配置\n运行 /telegram setup 进行配置。';
    }
    const test = await bridge.testConnection();
    if (test.ok) {
      return `Telegram 状态: ✅ 已连接\nBot: ${test.botName ?? 'unknown'}`;
    }
    return `Telegram 状态: ⚠️  配置存在但连接失败\n错误: ${test.error ?? 'unknown'}`;
  }

  // ── on ────────────────────────────────────────────────────────────────────
  if (sub === 'on') {
    if (!bridge) return '❌ Telegram bridge 未初始化。';
    // Check token/chatId are present (may be configured but currently disabled)
    const test = await bridge.testConnection();
    if (!test.ok) {
      return `⚠️  无法启用：连接测试失败 (${test.error ?? 'unknown'})\n请先运行 /telegram setup 进行配置。`;
    }
    bridge.setEnabled(true);
    return `✅ Telegram 通知已启用。Bot: ${test.botName ?? 'unknown'}`;
  }

  // ── off ───────────────────────────────────────────────────────────────────
  if (sub === 'off') {
    if (!bridge) return '❌ Telegram bridge 未初始化。';
    bridge.stopPolling();
    bridge.setEnabled(false);
    return '🔕 Telegram 通知已禁用。使用 /telegram on 重新启用。';
  }

  // ── help / default ────────────────────────────────────────────────────────
  return [
    '用法: /telegram <子命令>',
    '',
    '  setup   — 配置 Bot Token 和 Chat ID（交互向导）',
    '  test    — 发送测试消息',
    '  status  — 查看连接状态',
    '  on      — 启用通知',
    '  off     — 禁用通知',
  ].join('\n');
}
