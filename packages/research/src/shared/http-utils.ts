/**
 * Shared HTTP utilities with retry logic and rate limit handling.
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function shouldLogHttpRetryAttempts(): boolean {
  return process.env.TZUKWAN_DEBUG_HTTP === '1';
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Cap attempt to prevent overflow: 2^1024 = Infinity
  const cappedAttempt = Math.min(attempt, 30);
  // Exponential backoff: 2^attempt * baseDelay
  const exponential = Math.pow(2, cappedAttempt) * baseDelay;
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponential * (0.75 + Math.random() * 0.5);
  return Math.min(jitter, maxDelay);
}

/** Network error codes that are safe to retry */
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNABORTED', 'ENETUNREACH']);

/**
 * Check if an error is retryable based on status code or transient network error
 */
export function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  // Retry on known HTTP status codes
  if (status !== undefined) return retryableStatuses.includes(status);
  // Also retry on transient network errors (no response received)
  const code = (error as { code?: string }).code;
  return code !== undefined && RETRYABLE_NETWORK_CODES.has(code);
}

/**
 * Execute an HTTP request with automatic retry logic
 */
export async function httpRequestWithRetry<T = unknown>(
  config: AxiosRequestConfig,
  retryConfig: Partial<RetryConfig> = {}
): Promise<AxiosResponse<T>> {
  const retry = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: unknown;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      const response = await axios.request<T>(config);
      return response;
    } catch (error) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === retry.maxRetries) break;

      // Check if error is retryable
      if (!isRetryableError(error, retry.retryableStatuses)) {
        throw error;
      }

      // Get retry-after header if present (for 429)
      let delayMs = calculateDelay(attempt, retry.baseDelayMs, retry.maxDelayMs);
      if (axios.isAxiosError(error)) {
        const retryAfter = error.response?.headers['retry-after'];
        if (retryAfter) {
          // retry-after can be seconds (integer) or an HTTP date string
          const seconds = parseInt(retryAfter, 10);
          const headerDelay = !isNaN(seconds)
            ? seconds * 1000
            : Math.max(0, new Date(retryAfter).getTime() - Date.now());
          // Cap to maxDelayMs to prevent excessively long waits
          if (headerDelay > 0) delayMs = Math.min(headerDelay, retry.maxDelayMs);
        }
      }

      if (shouldLogHttpRetryAttempts()) {
        console.warn(`[HTTP] Request failed (attempt ${attempt + 1}/${retry.maxRetries + 1}), retrying in ${Math.round(delayMs)}ms...`);
      }
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Convenience method for GET requests with retry
 */
export async function getWithRetry<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
  retryConfig?: Partial<RetryConfig>
): Promise<AxiosResponse<T>> {
  return httpRequestWithRetry<T>({ ...config, method: 'GET', url }, retryConfig);
}

/**
 * Check if an error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 429;
}
