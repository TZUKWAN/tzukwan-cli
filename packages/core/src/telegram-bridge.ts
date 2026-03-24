// Telegram Bridge — sends/receives messages via the Telegram Bot API
// Uses Node.js built-in https module only (no axios)

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface TelegramMessage {
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  disableNotification?: boolean;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

interface TelegramGetMeResult {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

// ---------------------------------------------------------------------------
// Low-level HTTPS helpers
// ---------------------------------------------------------------------------

function httpsRequest(options: https.RequestOptions, body?: string, timeoutMs: number = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer | string) => { data += chunk; });
      res.on('end', () => {
        // Check HTTP status code
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 400) {
          reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.setTimeout(timeoutMs);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * POST multipart/form-data — used to send files via sendDocument
 */
function httpsMultipart(
  options: https.RequestOptions,
  fields: Record<string, string>,
  fileField: string,
  fileName: string,
  fileData: Buffer,
  mimeType: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const boundary = `----TzukwanBoundary${Date.now().toString(16)}`;
    const crlf = '\r\n';

    const parts: Buffer[] = [];

    // Text fields
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}${crlf}` +
        `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
        `${value}${crlf}`,
        'utf-8',
      ));
    }

    // File field
    parts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"${crlf}` +
      `Content-Type: ${mimeType}${crlf}${crlf}`,
      'utf-8',
    ));
    parts.push(fileData);
    parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`, 'utf-8'));

    const body = Buffer.concat(parts);

    const reqOptions: https.RequestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(reqOptions, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer | string) => { data += chunk; });
      res.on('end', () => {
        // Check HTTP status code for errors
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 400) {
          reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.setTimeout(30000); // 30 second timeout
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// TelegramBridge
// ---------------------------------------------------------------------------

const TZUKWAN_DIR = path.join(os.homedir(), '.tzukwan');

export class TelegramBridge {
  private configFile: string;
  private stateFile: string;
  private config: TelegramConfig;
  private lastUpdateId: number = 0;
  private pollingActive: boolean = false;
  private pollingAbortController: AbortController | null = null;

  constructor() {
    this.configFile = path.join(TZUKWAN_DIR, 'telegram.json');
    this.stateFile = path.join(TZUKWAN_DIR, 'telegram-state.json');
    this.config = this.loadConfig();
    this.loadState();
  }

  // ── Config ────────────────────────────────────────────────────────────────

  private loadConfig(): TelegramConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return JSON.parse(raw) as TelegramConfig;
      }
    } catch {
      // Non-fatal — start with empty config
    }
    return { botToken: '', chatId: '', enabled: false };
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(TZUKWAN_DIR, { recursive: true }); // idempotent, eliminates TOCTOU
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf-8');
        const state = JSON.parse(raw) as { lastUpdateId?: number };
        this.lastUpdateId = state.lastUpdateId ?? 0;
      }
    } catch {
      // Non-fatal
    }
  }

  private saveState(): void {
    try {
      fs.mkdirSync(TZUKWAN_DIR, { recursive: true }); // idempotent, eliminates TOCTOU
      fs.writeFileSync(this.stateFile, JSON.stringify({ lastUpdateId: this.lastUpdateId }, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  configure(botToken: string, chatId: string): void {
    this.config = { botToken: botToken.trim(), chatId: chatId.trim(), enabled: true };
    this.saveConfig();
  }

  /**
   * Enable or disable Telegram notifications without changing the token/chatId.
   * Persists the change to disk.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveConfig();
  }

  isConfigured(): boolean {
    return !!(this.config.botToken && this.config.chatId && this.config.enabled);
  }

  /**
   * Send a text message to the configured chat.
   * Returns true on success, false on failure (non-throwing).
   * Handles rate limiting (429) with exponential backoff.
   */
  async sendMessage(text: string, options?: Partial<TelegramMessage> & { chatId?: string }): Promise<boolean> {
    const targetChatId = options?.chatId?.trim() || this.config.chatId;
    if (!this.config.botToken || !this.config.enabled || !targetChatId) return false;

    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const truncated = text.slice(0, 4096);
        const payload = JSON.stringify({
          chat_id: targetChatId,
          text: truncated,
          parse_mode: options?.parseMode ?? 'Markdown',
          disable_notification: options?.disableNotification ?? false,
        });
        const result = await httpsRequest(
          {
            hostname: 'api.telegram.org',
            path: `/bot${this.config.botToken}/sendMessage`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
          },
          payload,
        );
        const parsed = JSON.parse(result) as TelegramApiResponse;
        return parsed.ok === true;
      } catch (err) {
        const errorStr = String(err);
        // Check for rate limiting (429)
        if (errorStr.includes('429') || errorStr.includes('Too Many Requests')) {
          retries++;
          if (retries < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, retries - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        return false;
      }
    }
    return false;
  }

  /**
   * Send a file (document) to the configured chat.
   * Returns true on success, false on failure (non-throwing).
   */
  async sendDocument(filePath: string, caption?: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      if (!fs.existsSync(filePath)) return false;
      const fileData = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const fields: Record<string, string> = { chat_id: this.config.chatId };
      if (caption) fields['caption'] = caption.slice(0, 1024);

      const result = await httpsMultipart(
        {
          hostname: 'api.telegram.org',
          path: `/bot${this.config.botToken}/sendDocument`,
          method: 'POST',
        },
        fields,
        'document',
        fileName,
        fileData,
        'application/octet-stream',
      );
      const parsed = JSON.parse(result) as TelegramApiResponse;
      return parsed.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Test the bot connection via getMe.
   */
  async testConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
    if (!this.config.botToken) {
      return { ok: false, error: 'Bot token not configured' };
    }
    try {
      const result = await httpsRequest({
        hostname: 'api.telegram.org',
        path: `/bot${this.config.botToken}/getMe`,
        method: 'GET',
      });
      const parsed = JSON.parse(result) as TelegramApiResponse;
      if (parsed.ok) {
        const me = parsed.result as TelegramGetMeResult;
        return { ok: true, botName: me.username ? `@${me.username}` : me.first_name };
      }
      return { ok: false, error: parsed.description ?? 'Unknown error' };
    } catch (err) {
      // Sanitize error to prevent token exposure
      const errorStr = String(err);
      const sanitized = errorStr
        .replace(this.config.botToken, '[REDACTED]')
        .replace(/\/bot\d+:[A-Za-z0-9_-]+/, '/bot[REDACTED]');
      return { ok: false, error: sanitized };
    }
  }

  /**
   * Start long-polling. For each incoming message calls onMessage(text, chatId)
   * and sends the returned string back as a reply.
   * Persists lastUpdateId to avoid duplicate processing across restarts.
   */
  async startPolling(
    onMessage: (text: string, chatId: string) => Promise<string>,
  ): Promise<void> {
    if (this.pollingActive) return;
    if (!this.isConfigured()) return;

    this.pollingActive = true;
    this.pollingAbortController = new AbortController();

    const poll = async (): Promise<void> => {
      while (this.pollingActive) {
        try {
          const offset = this.lastUpdateId + 1;
          const qs = `?offset=${offset}&timeout=30&allowed_updates=["message"]`;
          // Use 40s socket timeout — must exceed the 30s long-poll hold time to avoid spurious timeouts
          const raw = await httpsRequest({
            hostname: 'api.telegram.org',
            path: `/bot${this.config.botToken}/getUpdates${qs}`,
            method: 'GET',
          }, undefined, 40000);
          const response = JSON.parse(raw) as { ok: boolean; result: TelegramUpdate[] };
          if (!response.ok || !Array.isArray(response.result)) continue;

          for (const update of response.result) {
            // Advance offset to mark as processed
            if (update.update_id > this.lastUpdateId) {
              this.lastUpdateId = update.update_id;
            }
            const msgText = update.message?.text;
            const chatId = update.message?.chat?.id;
            if (msgText && chatId !== undefined) {
              try {
                const reply = await onMessage(msgText, String(chatId));
                if (reply) {
                  await this.sendMessage(reply, { chatId: String(chatId) });
                }
              } catch {
                // Individual message handler errors should not crash the loop
              }
            }
          }
          this.saveState();
        } catch {
          // Network errors: wait briefly before retrying
          await new Promise<void>(resolve => setTimeout(resolve, 5000));
        }
      }
    };

    // Run non-blocking (caller may await or ignore)
    poll().catch(() => {
      this.pollingActive = false;
    });
  }

  /** Stop the polling loop. */
  stopPolling(): void {
    this.pollingActive = false;
    this.pollingAbortController?.abort();
    this.pollingAbortController = null;
  }
}
