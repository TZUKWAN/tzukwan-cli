/**
 * Shared constants for tzukwan-cli.
 * Centralizes hardcoded values to improve maintainability.
 */

import * as path from 'path';
import * as os from 'os';

// Directory paths
export const TZUKWAN_DIR = path.join(os.homedir(), '.tzukwan');
export const SESSIONS_DIR = path.join(TZUKWAN_DIR, 'sessions');
export const CONFIG_PATH = path.join(TZUKWAN_DIR, 'config.json');
export const PROFILE_PATH = path.join(TZUKWAN_DIR, 'user-profile.json');
export const MEMORY_FILE = path.join(TZUKWAN_DIR, 'memory.jsonl');
export const CMD_HISTORY_FILE = path.join(TZUKWAN_DIR, 'cmd-history.txt');

// Network timeouts (ms)
export const DEFAULT_TIMEOUT = 30000;
export const LONG_TIMEOUT = 60000;
export const MCP_REQUEST_TIMEOUT = 10000;
export const HOOK_EXEC_TIMEOUT = 10000;
export const TELEGRAM_POLL_TIMEOUT = 30000;

// API Rate limiting
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;
export const RATE_LIMIT_STATUS = 429;

// Memory limits
export const MAX_ERROR_HISTORY = 1000;
export const MAX_USAGE_PATTERNS = 500;
export const MAX_MEMORY_ENTRIES = 10000;
export const MAX_NOTE_LENGTH = 1000;

// File size limits
export const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
export const MAX_TELEGRAM_CAPTION_LENGTH = 1024;
export const MAX_CMD_HISTORY_SIZE = 500;

// Default configuration values
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_PAPERS = 20;

// Paper workspace
export const PAPERS_DIR = path.join(TZUKWAN_DIR, 'papers');

// Cache settings
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
