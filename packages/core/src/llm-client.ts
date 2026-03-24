import OpenAI, { APIConnectionTimeoutError } from 'openai';
import type { ClientOptions } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { LLMConfig, Message, ChatOptions, ChatResponse, ToolCall } from './types.js';
import { getContextWindow } from './model-config.js';

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig> = Object.freeze({
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: Object.freeze([429, 500, 502, 503, 504]) as unknown as number[],
});

/**
 * Context overflow error patterns across providers.
 * Covers OpenAI, Anthropic, Gemini, DeepSeek, Mistral, and generic OpenAI-compat endpoints.
 */
const CONTEXT_OVERFLOW_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  // HTTP 400 with context/token keywords
  /context.{0,30}(length|window|limit|overflow|exceeded)/i,
  /token.{0,30}(limit|exceeded|overflow|maximum|too.?many)/i,
  /maximum.{0,30}(context|token)/i,
  // Provider-specific messages
  /This model's maximum context length/i,             // OpenAI
  /reduce.{0,30}(message|input|prompt)/i,             // OpenAI variant
  /prompt is too long/i,                              // Anthropic
  /Input.*too long/i,                                 // Anthropic/Gemini
  /context_length_exceeded/i,                        // OpenAI error code
  /string too long/i,                                 // some compat providers
  /total tokens.*exceed/i,
  /exceeds.{0,30}(limit|maximum|context)/i,
  /request too large/i,
  // GLM/Zhipu AI specific patterns
  /输入.*过长/i,                                       // GLM: "input too long" (Chinese)
  /超出.{0,20}上下文/i,                                 // GLM: "exceed context" (Chinese)
  /超出.{0,20}token/i,                                 // GLM: "exceed token" (Chinese)
  /input is too long/i,                               // GLM English variant
  /content too large/i,                               // GLM/BigModel platform
  /exceeds the maximum context/i,                     // GLM variant
  /message count exceeds/i,                           // GLM multi-turn limit
]);

/**
 * Detect whether an error is a context-overflow / context-length error.
 * Returns true for HTTP 500 (may carry context errors) and HTTP 400 with matching message.
 */
function isContextOverflowError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 400) {
      const message = [
        error.message,
        typeof error.error === 'object' && error.error !== null
          ? String((error.error as Record<string, unknown>).message ?? '')
          : '',
      ].join(' ');
      return CONTEXT_OVERFLOW_PATTERNS.some(p => p.test(message));
    }
    // Some providers return 500 for context errors; treat conservatively
    if (error.status === 500) {
      const message = error.message ?? '';
      return CONTEXT_OVERFLOW_PATTERNS.some(p => p.test(message));
    }
  }
  if (error instanceof LLMAPIError && (error.statusCode === 400 || error.statusCode === 500)) {
    return CONTEXT_OVERFLOW_PATTERNS.some(p => p.test(error.message));
  }
  return false;
}

function emitStructuredDebugLog(payload: Record<string, unknown>): void {
  if (process.env.TZUKWAN_DEBUG_LOGS !== '1') return;
  console.log(JSON.stringify(payload));
}

/**
 * Error thrown when the LLM API returns an error.
 */
export class LLMAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'LLMAPIError';
  }
}

/**
 * Error thrown when a network error occurs.
 */
export class LLMNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMNetworkError';
  }
}

/**
 * Error thrown when the request times out.
 */
export class LLMTimeoutError extends Error {
  constructor(message: string = 'LLM request timed out') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

/**
 * Client for interacting with LLM providers via OpenAI-compatible API.
 * Supports any provider that implements the OpenAI API specification.
 */
export class LLMClient {
  private client: OpenAI;
  private config: LLMConfig;
  private retryConfig: RetryConfig;

  constructor(config: LLMConfig, retryConfig?: Partial<RetryConfig>) {
    const derivedTimeout = config.timeout ?? LLMClient.deriveDefaultTimeout(config);
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      ...config,
      timeout: derivedTimeout,
      apiKey: config.apiKey?.trim() || 'none',
    };

    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    const clientConfig: ClientOptions = {
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: 0, // We handle retries manually for better control
    };

    this.client = new OpenAI(clientConfig);
  }

  private static deriveDefaultTimeout(config: LLMConfig): number {
    const providerFloor = config.provider === 'custom'
      ? 180000
      : config.provider === 'gemini'
        ? 240000
        : 120000;
    const completionBudget = Math.max(1024, config.maxTokens ?? 4096);
    return Math.min(Math.max(60000, providerFloor + (completionBudget * 8)), 600000);
  }

  private createClient(timeout: number): OpenAI {
    return new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout,
      maxRetries: 0,
    });
  }

  /**
   * Sleep helper for exponential backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private getRetryDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Check if an error is retryable.
   * Accepts both raw errors (from the API) and converted custom error types.
   */
  private isRetryableError(error: unknown): boolean {
    // Custom error types are explicitly designed for retryable scenarios
    if (error instanceof LLMNetworkError || error instanceof LLMTimeoutError) {
      return true;
    }
    if (error instanceof OpenAI.APIError) {
      return this.retryConfig.retryableStatuses.includes(error.status ?? 0);
    }
    if (error instanceof APIConnectionTimeoutError) {
      return true;
    }
    // AbortError from AbortController timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return true;
    }
    if (error instanceof Error) {
      const networkErrorPatterns = [
        'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET',
        'EAI_AGAIN', 'fetch failed', 'network error', 'socket hang up',
      ];
      return networkErrorPatterns.some(p =>
        error.message.toLowerCase().includes(p.toLowerCase())
      );
    }
    return false;
  }

  /**
   * Estimate total tokens for a message array plus optional tool definitions.
   */
  private estimateTotalTokens(messages: Message[], toolDefsCount = 0): number {
    const messageTokens = messages.reduce((sum, msg) => {
      const contentLen = typeof msg.content === 'string' ? msg.content.length : 0;
      const toolCallLen = msg.role === 'assistant' && msg.tool_calls
        ? JSON.stringify(msg.tool_calls).length
        : 0;
      return sum + Math.ceil((contentLen + toolCallLen) / 4) + 8;
    }, 0);
    return messageTokens + toolDefsCount * 120;
  }

  /**
   * Proactively truncate messages if estimated token count exceeds 80% of the
   * model's context window. Preserves the system prompt, maintains user-assistant
   * message alternation, and always keeps at least the final user message.
   *
   * @param messages  - Full message array to evaluate
   * @param toolDefsCount - Number of tool definitions being sent (each ~120 tokens)
   * @returns Possibly-truncated message array (original returned if no truncation needed)
   */
  private preCheckAndTruncate(messages: Message[], toolDefsCount = 0): Message[] {
    const contextWindow = getContextWindow(this.config.model);
    const threshold = Math.floor(contextWindow * 0.8);
    const estimated = this.estimateTotalTokens(messages, toolDefsCount);

    if (estimated <= threshold) return messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    // Walk backwards building valid pairs (tool → assistant → ... → user)
    // and drop oldest complete pairs until we fit under threshold.
    let kept = [...nonSystem];
    const maxPasses = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      const candidate = [...systemMessages, ...kept];
      if (this.estimateTotalTokens(candidate, toolDefsCount) <= threshold) break;
      if (kept.length <= 1) break; // Never drop the final user message

      // Remove the oldest message, but if it's an assistant with tool_calls,
      // also remove the immediately following tool result(s) to maintain alternation.
      const removed = kept.shift();
      if (!removed) break;
      if (removed.role === 'assistant' && removed.tool_calls && removed.tool_calls.length > 0) {
        // Drop all leading tool messages that correspond to those tool calls
        while (kept.length > 0 && kept[0]?.role === 'tool') {
          kept.shift();
        }
      }
      // If we just orphaned a leading tool message (shouldn't normally happen), drop it too
      while (kept.length > 1 && kept[0]!.role === 'tool') {
        kept.shift();
      }
    }

    // Always guarantee there is at least one user message
    const hasUser = kept.some(m => m.role === 'user');
    if (!hasUser) {
      const lastUser = [...nonSystem].reverse().find(m => m.role === 'user');
      if (lastUser) kept = [lastUser];
    }

    const result = [...systemMessages, ...kept];
    const after = this.estimateTotalTokens(result, toolDefsCount);
    console.warn(
      `[LLMClient] Pre-send token check: estimated ${estimated} tokens exceeded ` +
      `${threshold} (80% of ${contextWindow} context). ` +
      `Truncated ${messages.length} → ${result.length} messages (now ~${after} tokens).`
    );
    emitStructuredDebugLog({
      type: 'llm.context.truncation',
      phase: 'pre-check',
      reason: 'token_budget_exceeded',
      model: this.config.model,
      originalCount: messages.length,
      truncatedCount: result.length,
      estimatedTokens: estimated,
      thresholdTokens: threshold,
      contextWindow,
      systemMessagesKept: systemMessages.length,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Truncate conversation history by removing oldest messages.
   * Preserves system messages and the most recent user/assistant/tool messages.
   * Maintains proper user-assistant alternation required by the OpenAI API.
   * @param messages - Original message array
   * @param ratio - Fraction of non-system messages to remove (0.25 = oldest 25%)
   * @returns Truncated message array
   */
  private truncateMessages(messages: Message[], ratio = 0.25): Message[] {
    if (messages.length <= 2) return messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const removeCount = Math.max(1, Math.floor(nonSystem.length * ratio));
    let kept = nonSystem.slice(removeCount);

    // Drop any leading orphaned messages that reference dropped history:
    // 1. A leading tool message has no paired assistant — drop it.
    // 2. A leading assistant message with tool_calls has no paired tool results that
    //    precede it — its results might still follow, so keep it. But if the *very
    //    first* message is an assistant with tool_calls AND the next messages are NOT
    //    tool messages (i.e. the results were already dropped), drop this assistant too.
    while (kept.length > 1 && kept[0]!.role === 'tool') {
      kept = kept.slice(1);
    }
    // Also drop a leading assistant+tool_calls when its tool results are missing
    const firstMsg = kept[0] as (Message & { tool_calls?: unknown[] }) | undefined;
    if (
      kept.length > 1 &&
      firstMsg?.role === 'assistant' &&
      firstMsg.tool_calls?.length &&
      kept[1]!.role !== 'tool'
    ) {
      kept = kept.slice(1) as Message[];
      // Re-check: after dropping that assistant, next might be another orphan tool message
      while (kept.length > 1 && kept[0]!.role === 'tool') {
        kept = kept.slice(1) as Message[];
      }
    }

    // Ensure we always retain at least the last user message
    const hasUserMessage = kept.some(m => m.role === 'user');
    if (!hasUserMessage && nonSystem.length > 0) {
      const lastUser = [...nonSystem].reverse().find(m => m.role === 'user');
      if (lastUser) kept = [lastUser];
    }

    return [...systemMessages, ...kept];
  }

  /**
   * Execute a function with retry logic and automatic context truncation on overflow.
   * The operation receives the (possibly-truncated) message array on each attempt.
   */
  private async withRetry<T>(
    operation: (messages: Message[]) => Promise<T>,
    operationName: string,
    messages: Message[]
  ): Promise<T> {
    let lastError: Error | undefined;
    let currentMessages = messages;
    let truncationAttempt = 0;
    const maxTruncations = 3;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation(currentMessages);
      } catch (error) {
        lastError = this.handleError(error);

        // Check for context overflow and attempt reactive truncation + retry
        const overflowDetected = isContextOverflowError(error) || isContextOverflowError(lastError);
        if (overflowDetected) {
          if (truncationAttempt < maxTruncations) {
            truncationAttempt++;
            const ratio = truncationAttempt === 1 ? 0.25 : truncationAttempt === 2 ? 0.5 : 0.75;
            const originalCount = currentMessages.length;
            currentMessages = this.truncateMessages(currentMessages, ratio);
            console.warn(
              `[LLMClient] Context overflow detected. Truncated ${originalCount} → ${currentMessages.length} messages ` +
              `(${Math.round(ratio * 100)}% removed, attempt ${truncationAttempt}/${maxTruncations}). Retrying ${operationName}...`
            );
            emitStructuredDebugLog({
              type: 'llm.context.truncation',
              phase: 'reactive',
              reason: 'context_overflow_error',
              model: this.config.model,
              truncationAttempt,
              maxTruncations,
              removalRatio: ratio,
              originalCount,
              truncatedCount: currentMessages.length,
              operation: operationName,
              timestamp: new Date().toISOString(),
            });
            // Reset attempt counter to give full retry budget after truncation
            attempt = -1;
            continue;
          }
          // Truncation budget exhausted — throw immediately, no point retrying without reducing context
          throw lastError;
        }

        if (attempt < this.retryConfig.maxRetries && (this.isRetryableError(lastError) || this.isRetryableError(error))) {
          const delay = this.getRetryDelay(attempt);
          const statusCode = error instanceof OpenAI.APIError ? error.status : 'N/A';
          console.warn(
            `[LLMClient] ${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}, status: ${statusCode}). ` +
            `Retrying in ${Math.round(delay)}ms...`
          );
          await this.sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new LLMAPIError(`${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts`);
  }

  private composeAssistantContent(content: string, reasoningContent?: string): string {
    if (!reasoningContent?.trim()) {
      return content;
    }

    const reasoningBlock = `<think>${reasoningContent}</think>`;
    return content ? `${reasoningBlock}\n${content}` : reasoningBlock;
  }

  private extractVisibleContent(content: string): string {
    return content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, '')
      .trim();
  }

  /**
   * Converts our internal Message union type to OpenAI's ChatCompletionMessageParam format.
   * Handles system/user, assistant (with optional tool_calls), and tool result messages.
   */
  private convertMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map((msg): ChatCompletionMessageParam => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      const allowed = ['system', 'user', 'assistant'] as const;
      type AllowedRole = (typeof allowed)[number];
      if (!(allowed as readonly string[]).includes(msg.role)) {
        throw new LLMAPIError(
          `convertMessages: unrecognised message role "${msg.role}". ` +
          `Allowed roles are: ${allowed.join(', ')}.`
        );
      }
      return { role: msg.role as AllowedRole, content: (msg as { content: string }).content };
    });
  }

  /**
   * Sends a non-streaming chat request and returns the complete response.
   * Runs a proactive token pre-check: if estimated tokens exceed 80% of the
   * model's context window, oldest messages are truncated before the first attempt.
   * When the model responds with tool calls, they are returned in `tool_calls`.
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature;
    const requestTimeout = options?.timeout ?? this.config.timeout!;
    const client = options?.timeout ? this.createClient(requestTimeout) : this.client;

    const toolDefsCount = options?.tools?.length ?? 0;
    // Proactive pre-check before the first attempt
    const preparedMessages = this.preCheckAndTruncate(messages, toolDefsCount);

    return this.withRetry(async (msgs: Message[]) => {
      const createParams: ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model,
        messages: this.convertMessages(msgs),
        temperature,
        max_tokens: maxTokens,
      };
      if (options?.tools && options.tools.length > 0) {
        createParams.tools = options.tools as ChatCompletionTool[];
        createParams.tool_choice = 'auto';
      }
      const response = await client.chat.completions.create(createParams);

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new LLMAPIError('Empty response from LLM API');
      }

      const message = choice.message as {
        content?: string | null;
        reasoning_content?: string;
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
      };
      const content = this.composeAssistantContent(message.content ?? '', message.reasoning_content);
      const rawToolCalls = message.tool_calls;

      let finalContent = content;
      if (this.extractVisibleContent(finalContent).length === 0 && (!rawToolCalls || rawToolCalls.length === 0)) {
        try {
          const recoveryTemperature = typeof temperature === 'number' ? Math.min(temperature, 0.2) : 0.2;
          const recoveryMaxTokens = typeof maxTokens === 'number' ? Math.min(maxTokens, 1024) : 1024;
          const recovery = await client.chat.completions.create({
            model: this.config.model,
            messages: [
              ...this.convertMessages(msgs),
              { role: 'assistant', content: finalContent || null },
              {
                role: 'user',
                content: 'Return only the final answer to the previous request. Do not include thinking tags, analysis, or tool calls.',
              },
            ],
            temperature: recoveryTemperature,
            max_tokens: recoveryMaxTokens,
          });
          const recoveryMessage = recovery.choices[0]?.message as {
            content?: string | null;
            reasoning_content?: string;
          } | undefined;
          if (recoveryMessage) {
            finalContent = this.composeAssistantContent(
              recoveryMessage.content ?? '',
              recoveryMessage.reasoning_content,
            );
          }
        } catch {
          // Ignore recovery failures and fall back to the original response.
        }
        if (this.extractVisibleContent(finalContent).length === 0) {
          const lastUserMessage = [...msgs].reverse().find((message) => message.role === 'user');
          if (lastUserMessage?.content) {
            try {
              const retry = await client.chat.completions.create({
                model: this.config.model,
                messages: [
                  {
                    role: 'system',
                    content: 'Answer the user directly. Do not include thinking tags, hidden reasoning, XML tags, or tool calls.',
                  },
                  {
                    role: 'user',
                    content: lastUserMessage.content,
                  },
                ],
                temperature: 0,
                max_tokens: 256,
              });
              const retryMessage = retry.choices[0]?.message as {
                content?: string | null;
                reasoning_content?: string;
              } | undefined;
              if (retryMessage) {
                finalContent = this.composeAssistantContent(
                  retryMessage.content ?? '',
                  retryMessage.reasoning_content,
                );
              }
            } catch {
              // Ignore second-stage recovery failures.
            }
          }
        }
      }

      // Require either text content or tool_calls
      if (!finalContent && (!rawToolCalls || rawToolCalls.length === 0)) {
        throw new LLMAPIError('Empty response from LLM API');
      }

      const tool_calls: ToolCall[] | undefined = rawToolCalls && rawToolCalls.length > 0
        ? rawToolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }))
        : undefined;

      return {
        content: finalContent,
        tool_calls,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    }, 'chat', preparedMessages);
  }

  /**
   * Sends a streaming chat request.
   * Runs a proactive token pre-check: if estimated tokens exceed 80% of the
   * model's context window, oldest messages are truncated before the first attempt.
   * Content chunks are delivered via onChunk callback.
   * If the model responds with tool calls (instead of text), they are accumulated
   * and returned in `tool_calls` on the final response (no onChunk calls occur
   * in that case since tool_call deltas have no displayable content).
   */
  async chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature;
    const requestTimeout = options?.timeout ?? this.config.timeout!;
    const client = options?.timeout ? this.createClient(requestTimeout) : this.client;

    const toolDefsCount = options?.tools?.length ?? 0;
    // Proactive pre-check before the first attempt
    const preparedMessages = this.preCheckAndTruncate(messages, toolDefsCount);

    return this.withRetry(async (msgs: Message[]) => {
      const streamParams: ChatCompletionCreateParamsStreaming = {
        model: this.config.model,
        messages: this.convertMessages(msgs),
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      };
      if (options?.tools && options.tools.length > 0) {
        streamParams.tools = options.tools as ChatCompletionTool[];
        streamParams.tool_choice = 'auto';
      }

      // Create an AbortController for timeout handling
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, requestTimeout);

      let timeoutCleared = false;
      const safeClearTimeout = (): void => {
        if (!timeoutCleared) {
          clearTimeout(timeoutId);
          timeoutCleared = true;
        }
      };

      try {
        const stream = await client.chat.completions.create(
          streamParams,
          { signal: abortController.signal }
        );

        let fullContent = '';
        let fullReasoning = '';
        let promptTokens = 0;
        let completionTokens = 0;
        let reasoningOpened = false;
        // Accumulate tool_call fragments delivered across stream deltas
        const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};

        for await (const chunk of stream) {
          // Clear timeout on first chunk received
          if (promptTokens === 0 && completionTokens === 0 && !fullContent && !fullReasoning) {
            safeClearTimeout();
          }

          const delta = chunk.choices[0]?.delta as { content?: string; reasoning_content?: string } | undefined;
          if (delta?.reasoning_content) {
            fullReasoning += delta.reasoning_content;
            if (!reasoningOpened) {
              fullContent += '<think>';
              onChunk('<think>');
              reasoningOpened = true;
            }
            fullContent += delta.reasoning_content;
            onChunk(delta.reasoning_content);
          }
          if (delta?.content) {
            if (reasoningOpened) {
              fullContent += '</think>';
              onChunk('</think>');
              reasoningOpened = false;
            }
            fullContent += delta.content;
            onChunk(delta.content);
          }

          // Accumulate tool_calls streamed in fragments
          const deltaToolCalls = (delta as Record<string, unknown> | undefined)?.['tool_calls'] as
            | Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
            | undefined;
          if (deltaToolCalls) {
            for (const tc of deltaToolCalls) {
              if (!toolCallAccum[tc.index]) {
                toolCallAccum[tc.index] = { id: '', name: '', arguments: '' };
              }
              const accum = toolCallAccum[tc.index];
              if (accum) {
                if (tc.id) accum.id = tc.id;
                if (tc.function?.name) accum.name = tc.function.name;
                if (tc.function?.arguments) accum.arguments += tc.function.arguments;
              }
            }
          }

          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        safeClearTimeout();

        if (reasoningOpened) {
          fullContent += '</think>';
          onChunk('</think>');
        }

        if (!fullContent && fullReasoning) {
          fullContent = this.composeAssistantContent('', fullReasoning);
        }

        // If tool calls were collected, return them (no text content in this case)
        const accumulatedCalls = Object.values(toolCallAccum).filter(tc => tc.name);
        const tool_calls: ToolCall[] | undefined = accumulatedCalls.length > 0
          ? accumulatedCalls.map((tc, i) => ({
              id: tc.id || `call_stream_${i}`,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined;

        return {
          content: fullContent,
          tool_calls,
          usage:
            promptTokens > 0 || completionTokens > 0
              ? { promptTokens, completionTokens }
              : undefined,
        };
      } catch (error) {
        safeClearTimeout();
        throw error;
      }
    }, 'chatStream', preparedMessages);
  }

  /**
   * Tests if the LLM provider is available and responding.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });
      return response.choices.length > 0;
    } catch {
      return false;
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof LLMAPIError || error instanceof LLMNetworkError || error instanceof LLMTimeoutError) {
      return error;
    }
    if (error instanceof OpenAI.APIError) {
      // Extract detailed error message from response body if available
      let detailedMessage = error.message;
      const errorBody = error.error as Record<string, unknown> | undefined;
      if (errorBody) {
        const bodyMessage = errorBody.message ?? errorBody.error?.toString();
        if (bodyMessage && typeof bodyMessage === 'string' && bodyMessage !== error.message) {
          detailedMessage = `${error.message} - ${bodyMessage}`;
        }
      }
      return new LLMAPIError(
        `LLM API Error: ${detailedMessage} (${error.type || 'unknown type'})`,
        error.status,
        error.error
      );
    }
    if (error instanceof APIConnectionTimeoutError) {
      return new LLMTimeoutError(`Request timed out after ${this.config.timeout}ms`);
    }
    // Handle AbortError from timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return new LLMTimeoutError(`Request aborted due to timeout (${this.config.timeout}ms)`);
    }
    if (error instanceof Error) {
      const networkErrorPatterns = [
        'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET',
        'EAI_AGAIN', 'fetch failed', 'network error', 'socket hang up',
        'abort', 'timeout',
      ];
      if (networkErrorPatterns.some(p => error.message.toLowerCase().includes(p.toLowerCase()))) {
        return new LLMNetworkError(
          `Network error connecting to LLM provider at ${this.config.baseUrl || 'default endpoint'}: ${error.message}`,
          error
        );
      }
    }
    return new LLMAPIError(
      `Unexpected error during LLM request: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LLMConfig>, retryConfig?: Partial<RetryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      apiKey: config.apiKey !== undefined ? (config.apiKey.trim() || 'none') : this.config.apiKey,
    };
    if (retryConfig) {
      this.retryConfig = { ...this.retryConfig, ...retryConfig };
    }
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: 0, // We handle retries manually
    });
  }

  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
