// QQ Bridge — sends/receives messages via go-cqhttp HTTP API
// Compatible with iFlow QQ Bridge configuration

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';

export interface QQBridgeConfig {
  // HTTP API settings
  enabled: boolean;
  port: number;
  host: string;

  // QQ Bot settings
  commandPrefix: string;
  userWhitelist: string[];
  groupWhitelist: string[];
  enablePrivate: boolean;
  enableGroup: boolean;
  requireAtInGroup: boolean;
  maxMessageLength: number;
  truncateLongMessages: boolean;

  // Response templates
  templates: {
    waiting: string;
    timeout: string;
    error: string;
    responseFooter: string;
  };

  // Session settings
  sessionTimeout: number; // seconds
}

export interface QQMessage {
  post_type: string;
  message_type: 'private' | 'group' | 'guild';
  sub_type?: string;
  message_id: number;
  user_id: string;
  group_id?: string;
  guild_id?: string;
  channel_id?: string;
  message: string;
  raw_message: string;
  font: number;
  time: number;
  self_id: number;
  sender?: {
    user_id: string;
    nickname: string;
    card?: string;
    role?: string;
    title?: string;
  };
}

export interface QQSendMessageRequest {
  user_id?: string;
  group_id?: string;
  guild_id?: string;
  channel_id?: string;
  message: string;
  auto_escape?: boolean;
}

export interface SessionContext {
  userId: string;
  groupId?: string;
  guildId?: string;
  lastActivity: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; time: number }>;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpRequest(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  body?: string,
  headers?: Record<string, string>,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.setTimeout(30000);

    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// QQBridge
// ---------------------------------------------------------------------------

const TZUKWAN_DIR = path.join(os.homedir(), '.tzukwan');
const QQ_CONFIG_FILE = path.join(TZUKWAN_DIR, 'qq-bridge.json');
const SESSIONS_DIR = path.join(TZUKWAN_DIR, 'qq-sessions');

export class QQBridge {
  private config: QQBridgeConfig;
  private server: http.Server | null = null;
  private sessions: Map<string, SessionContext> = new Map();
  private messageHandler: ((text: string, sessionId: string, context: SessionContext) => Promise<string>) | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.ensureSessionsDir();
    this.startCleanupInterval();
  }

  // ── Config ────────────────────────────────────────────────────────────────

  private loadConfig(): QQBridgeConfig {
    try {
      if (fs.existsSync(QQ_CONFIG_FILE)) {
        const raw = fs.readFileSync(QQ_CONFIG_FILE, 'utf-8');
        return { ...this.getDefaultConfig(), ...JSON.parse(raw) };
      }
    } catch {
      // Non-fatal — start with default config
    }
    return this.getDefaultConfig();
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(TZUKWAN_DIR, { recursive: true }); // idempotent, eliminates TOCTOU
      fs.writeFileSync(QQ_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  private getDefaultConfig(): QQBridgeConfig {
    return {
      enabled: false,
      port: 3002,
      host: '0.0.0.0',
      commandPrefix: '#ai',
      userWhitelist: [],
      groupWhitelist: [],
      enablePrivate: true,
      enableGroup: true,
      requireAtInGroup: true,
      maxMessageLength: 3000,
      truncateLongMessages: true,
      templates: {
        waiting: '🤔 正在思考中，请稍候...',
        timeout: '⏱️ 执行超时，请简化问题后重试',
        error: '❌ 执行出错: {{message}}',
        responseFooter: '\n\n---\n🤖 Powered by Tzukwan',
      },
      sessionTimeout: 3600, // 1 hour
    };
  }

  private ensureSessionsDir(): void {
    try {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true }); // idempotent, eliminates TOCTOU
    } catch {
      // Non-fatal
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Clean up every minute
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const timeout = this.config.sessionTimeout * 1000;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > timeout) {
        this.sessions.delete(sessionId);
        // Also delete session file
        try {
          const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
          if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
          }
        } catch {
          // Non-fatal
        }
      }
    }
  }

  // ── Public Config API ─────────────────────────────────────────────────────

  configure(config: Partial<QQBridgeConfig>): void {
    this.config = { ...this.config, ...config, enabled: true };
    this.saveConfig();
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveConfig();
  }

  isConfigured(): boolean {
    return this.config.enabled;
  }

  getConfig(): QQBridgeConfig {
    return { ...this.config };
  }

  // ── Session Management ────────────────────────────────────────────────────

  /**
   * Sanitize a component of a session ID to prevent path traversal.
   * Only alphanumeric chars, digits, hyphens, underscores, and dots are allowed.
   */
  private sanitizeIdComponent(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  }

  private getSessionId(message: QQMessage): string {
    const userId = this.sanitizeIdComponent(String(message.user_id));
    if (message.guild_id) {
      const guildId = this.sanitizeIdComponent(String(message.guild_id));
      const channelId = this.sanitizeIdComponent(String(message.channel_id || 'default'));
      return `${userId}_${guildId}_${channelId}`;
    }
    const groupId = this.sanitizeIdComponent(String(message.group_id || 'private'));
    return `${userId}_${groupId}`;
  }

  private getOrCreateSession(sessionId: string, userId: string, groupId?: string, guildId?: string): SessionContext {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      return session;
    }

    // Try to load from file
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    try {
      if (fs.existsSync(sessionFile)) {
        const raw = fs.readFileSync(sessionFile, 'utf-8');
        const loaded = JSON.parse(raw) as SessionContext;
        loaded.lastActivity = Date.now();
        this.sessions.set(sessionId, loaded);
        return loaded;
      }
    } catch {
      // Non-fatal, create new session
    }

    const newSession: SessionContext = {
      userId,
      groupId,
      guildId,
      lastActivity: Date.now(),
      messages: [],
    };
    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  private saveSession(sessionId: string, session: SessionContext): void {
    try {
      const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  // ── Message Handling ──────────────────────────────────────────────────────

  private shouldProcessMessage(message: QQMessage): { shouldProcess: boolean; reason?: string } {
    // Check if it's a message event
    if (message.post_type !== 'message') {
      return { shouldProcess: false, reason: 'Not a message event' };
    }

    // Check message type
    if (message.message_type === 'private' && !this.config.enablePrivate) {
      return { shouldProcess: false, reason: 'Private messages disabled' };
    }

    if (message.message_type === 'group' && !this.config.enableGroup) {
      return { shouldProcess: false, reason: 'Group messages disabled' };
    }

    // Check user whitelist
    if (this.config.userWhitelist.length > 0 && !this.config.userWhitelist.includes(message.user_id)) {
      return { shouldProcess: false, reason: 'User not in whitelist' };
    }

    // Check group whitelist
    if (message.message_type === 'group' && this.config.groupWhitelist.length > 0) {
      if (!message.group_id || !this.config.groupWhitelist.includes(message.group_id)) {
        return { shouldProcess: false, reason: 'Group not in whitelist' };
      }
    }

    return { shouldProcess: true };
  }

  private extractPrompt(message: QQMessage): string | null {
    const text = message.raw_message || message.message || '';

    // Check command prefix
    if (this.config.commandPrefix && !text.startsWith(this.config.commandPrefix)) {
      // In groups, also check for @ mention if required
      if (message.message_type === 'group' && this.config.requireAtInGroup) {
        // Check if message contains @ mention (CQ:at)
        if (!text.includes('[CQ:at')) {
          return null;
        }
        // Extract text after @ mention
        const afterAt = text.replace(/^\[CQ:at[^\]]+\]\s*/, '').trim();
        if (!afterAt) return null;
        return afterAt;
      }
      return null;
    }

    // Extract prompt after prefix
    if (this.config.commandPrefix) {
      return text.substring(this.config.commandPrefix.length).trim();
    }

    return text.trim();
  }

  private async handleMessage(message: QQMessage): Promise<string | null> {
    const { shouldProcess, reason } = this.shouldProcessMessage(message);
    if (!shouldProcess) {
      return null;
    }

    const prompt = this.extractPrompt(message);
    if (!prompt) {
      return `请输入您想执行的内容，例如：${this.config.commandPrefix} 帮我写一个Python脚本`;
    }

    const sessionId = this.getSessionId(message);
    const session = this.getOrCreateSession(sessionId, message.user_id, message.group_id, message.guild_id);

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: prompt,
      time: Date.now(),
    });

    // Keep only last 20 messages
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    if (!this.messageHandler) {
      return '消息处理器未配置';
    }

    try {
      const response = await this.messageHandler(prompt, sessionId, session);

      // Add assistant response to session
      session.messages.push({
        role: 'assistant',
        content: response,
        time: Date.now(),
      });

      // Save session
      this.saveSession(sessionId, session);

      // Format response
      let output = response;
      if (this.config.templates.responseFooter) {
        output += this.config.templates.responseFooter;
      }

      if (this.config.truncateLongMessages && output.length > this.config.maxMessageLength) {
        output = output.substring(0, this.config.maxMessageLength) + '\n\n... (消息过长已截断)';
      }

      return output;
    } catch (error) {
      return this.config.templates.error.replace('{{message}}', String(error));
    }
  }

  // ── HTTP Server ───────────────────────────────────────────────────────────

  start(handler: (text: string, sessionId: string, context: SessionContext) => Promise<string>): void {
    if (this.server) {
      throw new Error('QQ Bridge server is already running');
    }

    this.messageHandler = handler;

    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || '/';

      // Health check
      if (url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'Tzukwan-QQ-Bridge',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      const MAX_BODY_BYTES = 1024 * 1024; // 1 MB request body limit

      // go-cqhttp message endpoint
      if (url === '/cqhttp/message' && req.method === 'POST') {
        let body = '';
        let bodySize = 0;
        req.on('data', (chunk: Buffer) => {
          bodySize += chunk.length;
          if (bodySize > MAX_BODY_BYTES) { req.destroy(); return; }
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const message = JSON.parse(body) as QQMessage;
            const reply = await this.handleMessage(message);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (reply) {
              res.end(JSON.stringify({ reply }));
            } else {
              res.end(JSON.stringify({ status: 'ignored' }));
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      // Manual execute endpoint
      if (url === '/api/execute' && req.method === 'POST') {
        let body = '';
        let bodySize2 = 0;
        req.on('data', (chunk: Buffer) => {
          bodySize2 += chunk.length;
          if (bodySize2 > MAX_BODY_BYTES) { req.destroy(); return; }
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const { prompt, session_id, user_id = 'manual' } = JSON.parse(body);
            if (!prompt) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing prompt parameter' }));
              return;
            }

            const sessionId = session_id || `${user_id}_manual`;
            const session = this.getOrCreateSession(sessionId, user_id);

            if (!this.messageHandler) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Message handler not configured' }));
              return;
            }

            const response = await this.messageHandler(prompt, sessionId, session);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              output: response,
              session_id: sessionId,
            }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    this.server.listen(this.config.port, this.config.host, () => {
      console.log(`[QQ Bridge] Server started on http://${this.config.host}:${this.config.port}`);
      console.log(`[QQ Bridge] Health check: http://localhost:${this.config.port}/health`);
      console.log(`[QQ Bridge] go-cqhttp endpoint: http://localhost:${this.config.port}/cqhttp/message`);
    });

    this.server.on('error', (err) => {
      console.error('[QQ Bridge] Server error:', err.message);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('[QQ Bridge] Server stopped');
      });
      this.server = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Save all sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      this.saveSession(sessionId, session);
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
