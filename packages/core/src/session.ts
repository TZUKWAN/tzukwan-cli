import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type { Session, Message, TzukwanConfig } from './types.js';

/** Directory where sessions are persisted */
const SESSIONS_DIR = path.join(os.homedir(), '.tzukwan', 'sessions');

/**
 * Manages conversation sessions including creation, persistence, and retrieval.
 */
export class SessionManager {
  private sessionsDir: string;

  /**
   * Creates a new SessionManager.
   * @param sessionsDir - Override for the sessions directory (used in tests)
   */
  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? SESSIONS_DIR;
  }

  /**
   * Ensures the sessions directory exists.
   */
  private async ensureSessionsDir(): Promise<void> {
    await fs.promises.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Creates a new empty session with the given config.
   * @param config - Config snapshot to associate with this session
   * @returns Newly created Session
   */
  createSession(config: TzukwanConfig): Session {
    return {
      id: randomUUID(),
      messages: [],
      createdAt: new Date(),
      config,
    };
  }

  /**
   * Appends a message to the session's history.
   * Accepts either a full Message object or (role, content) shorthand.
   */
  addMessage(session: Session, message: Message): void;
  addMessage(session: Session, role: 'user' | 'assistant' | 'system', content: string): void;
  addMessage(session: Session, roleOrMessage: Message | 'user' | 'assistant' | 'system', content?: string): void {
    if (typeof roleOrMessage === 'string') {
      session.messages.push({ role: roleOrMessage, content: content! } as Message);
    } else {
      session.messages.push(roleOrMessage);
    }
  }

  /**
   * Returns a copy of the session's message history.
   * @param session - Session to read
   */
  getHistory(session: Session): Message[] {
    return [...session.messages];
  }

  /**
   * Clears all messages from the session.
   * @param session - Session to clear
   */
  clearHistory(session: Session): void {
    session.messages = [];
  }

  /**
   * Serialises and persists a session to disk.
   * Stored as JSON at {sessionsDir}/{session.id}.json
   * @param session - Session to save
   */
  async saveSession(session: Session): Promise<void> {
    await this.ensureSessionsDir();

    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    const data: SerializedSession = {
      id: session.id,
      messages: session.messages,
      createdAt: session.createdAt.toISOString(),
      config: session.config,
    };

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Loads a session from disk.
   * @param id - Session UUID
   * @returns Session or null if not found
   */
  private validateSessionId(id: string): void {
    // Accept UUID v4 format only to prevent path traversal
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`Invalid session ID format: ${id}`);
    }
  }

  async loadSession(id: string): Promise<Session | null> {
    this.validateSessionId(id);
    const filePath = path.join(this.sessionsDir, `${id}.json`);

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as SerializedSession;

      return {
        id: data.id,
        messages: data.messages,
        createdAt: new Date(data.createdAt),
        config: data.config,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // Log corrupted session but don't throw to allow loading other valid sessions
      console.error(`[SessionManager] Corrupted session file ${id}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Returns all sessions stored on disk, sorted by creation date (newest first).
   */
  async listSessions(): Promise<Session[]> {
    await this.ensureSessionsDir();

    let files: string[];
    try {
      files = await fs.promises.readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const sessions: Session[] = [];

    for (const file of jsonFiles) {
      const id = path.basename(file, '.json');
      try {
        const session = await this.loadSession(id);
        if (session) {
          sessions.push(session);
        }
      } catch {
        // Skip corrupted or invalid session files
      }
    }

    // Sort newest first
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return sessions;
  }

  /**
   * Deletes a session from disk.
   * @param id - Session UUID to delete
   * @returns true if the session was deleted, false if it was not found
   */
  async deleteSession(id: string): Promise<boolean> {
    this.validateSessionId(id);
    const filePath = path.join(this.sessionsDir, `${id}.json`);

    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw new Error(`Failed to delete session ${id}: ${(error as Error).message}`);
    }
  }
}

/** Internal representation used when serialising to disk */
interface SerializedSession {
  id: string;
  messages: Message[];
  createdAt: string;
  config: TzukwanConfig;
}
