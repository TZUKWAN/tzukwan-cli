/**
 * Intelligent conversation compression using LLM-based summarization.
 *
 * Instead of simple truncation, this module compresses older messages into
 * a structured summary that preserves key information — decisions, facts,
 * user preferences, pending actions, and important tool results.
 *
 * Inspired by Gemini CLI's compression approach (separate summarization step
 * with critical self-evaluation), but integrated with the project's existing
 * LLMClient interface.
 */

import type { Message } from './types.js';
import type { LLMClient } from './llm-client.js';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface CompressionConfig {
  /** Enable or disable LLM-based smart compression. Default: true */
  enabled: boolean;
  /**
   * Fraction of the context limit at which compression is triggered.
   * E.g. 0.5 means: trigger when context exceeds 50% of maxChars.
   * Range: 0.2–0.9. Default: 0.5
   */
  triggerThreshold: number;
  /**
   * Absolute token threshold for auto-compaction.
   * When estimated tokens exceed this value, compression is triggered
   * regardless of triggerThreshold. Default: 20000
   */
  autoCompactionTokens: number;
  /**
   * Fraction of the oldest messages to compress in one pass.
   * E.g. 0.4 means: compress the oldest 40% of messages into a summary.
   * Range: 0.1–0.7. Default: 0.4
   */
  compressionRatio: number;
  /**
   * Always keep the N most recent messages uncompressed (never compress them).
   * Default: 6
   */
  preserveRecent: number;
  /**
   * Enable a self-verification step where the LLM critically evaluates its
   * own summary for completeness, then optionally refines it.
   * Adds one extra LLM call. Default: true
   */
  selfVerify: boolean;
  /**
   * Maximum tokens to allocate for the summary output.
   * Keep this low to ensure the summary is genuinely compact.
   * Default: 600
   */
  summaryMaxTokens: number;
}

export const DEFAULT_COMPRESSION_CONFIG: Readonly<CompressionConfig> = Object.freeze({
  enabled: true,
  triggerThreshold: 0.5,
  autoCompactionTokens: 20000,
  compressionRatio: 0.4,
  preserveRecent: 6,
  selfVerify: true,
  summaryMaxTokens: 600,
});

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Structured summary produced by the compression engine.
 * Stored as a JSON-encoded user message in the conversation history so that
 * all LLM providers see it as normal context (no custom message roles needed).
 */
export interface ConversationSummary {
  type: 'conversation_summary';
  originalMessageCount: number;
  compressedAt: string;                  // ISO timestamp
  keyDecisions: string[];               // Decisions taken / conclusions reached
  importantFacts: string[];             // Key facts / data discovered
  userPreferences: string[];            // User's stated preferences or constraints
  pendingActions: string[];             // Open todos or follow-up items
  toolResultHighlights: string[];       // Critical information from tool calls
  narrativeSummary: string;             // Concise prose summary of the exchange
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateChars(messages: Message[]): number {
  return messages.reduce((sum, m) => {
    const body =
      typeof m.content === 'string' ? m.content
        : JSON.stringify((m as { tool_calls?: unknown }).tool_calls ?? '');
    return sum + body.length;
  }, 0);
}

/**
 * Estimate token count from text using byte-level approximation.
 * Codex-style: ~4 bytes per token for accurate budget prediction.
 */
function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  const byteLength = new TextEncoder().encode(text).length;
  return Math.ceil(byteLength / 4);
}

/**
 * Estimate total tokens for a message array.
 */
function estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => {
    const body =
      typeof m.content === 'string' ? m.content
        : JSON.stringify((m as { tool_calls?: unknown }).tool_calls ?? '');
    return sum + estimateTokensFromText(body) + 4; // +4 for message overhead
  }, 0);
}

/**
 * Serialize a message to a human-readable transcript line suitable for feeding
 * back to the LLM as summarization input.
 */
function messageToTranscriptLine(m: Message): string {
  if (m.role === 'system') {
    return `[SYSTEM] ${typeof m.content === 'string' ? m.content : ''}`;
  }
  if (m.role === 'user') {
    return `[USER] ${m.content}`;
  }
  if (m.role === 'assistant') {
    const text = typeof m.content === 'string' ? m.content : '';
    const tcSummary =
      m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0
        ? ` [called tools: ${m.tool_calls.map(tc => tc.function.name).join(', ')}]`
        : '';
    return `[ASSISTANT]${tcSummary} ${text}`;
  }
  if (m.role === 'tool') {
    // Truncate long tool results — the summary will highlight what mattered
    const body = m.content.length > 800
      ? m.content.slice(0, 600) + `…[${m.content.length - 600} chars omitted]`
      : m.content;
    return `[TOOL RESULT (id:${m.tool_call_id})] ${body}`;
  }
  return '';
}

function buildTranscript(messages: Message[]): string {
  return messages
    .map(messageToTranscriptLine)
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Build the summarization prompt given a transcript of messages to compress.
 */
function buildSummarizationPrompt(transcript: string): string {
  return `You are a conversation summarizer. Your job is to compress the following conversation transcript into a concise, structured summary that preserves all information a future agent would need to continue the conversation intelligently.

TRANSCRIPT TO SUMMARIZE:
---
${transcript}
---

Produce a JSON object with exactly this schema (no markdown fences, raw JSON only):
{
  "keyDecisions": ["..."],
  "importantFacts": ["..."],
  "userPreferences": ["..."],
  "pendingActions": ["..."],
  "toolResultHighlights": ["..."],
  "narrativeSummary": "..."
}

Guidelines:
- keyDecisions: Explicit decisions taken or conclusions reached (e.g. "User decided to use DeepSeek as the LLM provider").
- importantFacts: Data, numbers, file paths, URLs, or factual information discovered (e.g. "The project has 5 agents").
- userPreferences: What the user stated they want or don't want (e.g. "User prefers verbose output").
- pendingActions: Tasks that were mentioned but not yet completed (e.g. "Need to add error handling to tool X").
- toolResultHighlights: Key findings from tool calls (e.g. "search_arxiv returned 3 relevant papers on RAG").
- narrativeSummary: A short (2-4 sentence) plain-English summary of what was discussed and accomplished.

Be specific and faithful to the transcript. Do not invent or embellish. If a list is empty, use [].`;
}

/**
 * Build the self-verification prompt asking the LLM to critically review its summary.
 */
function buildVerificationPrompt(transcript: string, draft: string): string {
  return `You produced the following summary of a conversation. Critically evaluate it for completeness and accuracy, then return a final improved version.

ORIGINAL TRANSCRIPT:
---
${transcript}
---

YOUR DRAFT SUMMARY (JSON):
---
${draft}
---

Task: Review the draft. Ask yourself:
1. Is any critical decision, fact, or preference missing from the summary?
2. Is any item inaccurate or misleading?
3. Are the pending actions complete?

Return ONLY the final JSON object (same schema as the draft, no markdown fences). If the draft is already accurate and complete, return it unchanged.`;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────

export interface CompressionResult {
  compressedMessages: Message[];
  summary: ConversationSummary;
  beforeCount: number;
  afterCount: number;
  beforeChars: number;
  afterChars: number;
}

/**
 * Compress a segment of conversation messages into an LLM-generated summary.
 * Returns the summary message plus the unchanged tail messages.
 *
 * @param llmClient   - LLMClient instance to call for summarization
 * @param messages    - Full message list to compress (no system message included)
 * @param config      - Compression configuration
 */
export async function compressConversationSegment(
  llmClient: LLMClient,
  messages: Message[],
  config: CompressionConfig = DEFAULT_COMPRESSION_CONFIG,
): Promise<CompressionResult | null> {
  if (!config.enabled || messages.length === 0) return null;

  const beforeCount = messages.length;
  const beforeChars = estimateChars(messages);

  // Filter out system messages — they are managed separately
  const nonSystem = messages.filter(m => m.role !== 'system');
  if (nonSystem.length < 4) return null; // Nothing meaningful to compress

  // Determine how many messages to compress (oldest portion)
  const preserveCount = Math.max(config.preserveRecent, 2);
  const compressCount = Math.max(
    2,
    Math.floor(nonSystem.length * config.compressionRatio),
  );

  // Must always leave at least preserveCount messages untouched
  if (nonSystem.length - compressCount < preserveCount) {
    const adjusted = nonSystem.length - preserveCount;
    if (adjusted < 2) return null;
  }

  const actualCompressCount = Math.min(
    compressCount,
    nonSystem.length - preserveCount,
  );

  if (actualCompressCount < 2) return null;

  const toCompress = nonSystem.slice(0, actualCompressCount);
  const toKeep = nonSystem.slice(actualCompressCount);

  // Build transcript for summarization
  const transcript = buildTranscript(toCompress);

  // ── Step 1: Generate draft summary ─────────────────────────────────────────
  let summaryJson: string;
  try {
    const summaryPrompt = buildSummarizationPrompt(transcript);
    const result = await llmClient.chat(
      [
        { role: 'system', content: 'You are a precise conversation summarizer. Output only valid JSON, no markdown.' },
        { role: 'user', content: summaryPrompt },
      ],
      {
        temperature: 0.1,
        maxTokens: config.summaryMaxTokens,
      },
    );
    summaryJson = result.content.trim();
    // Strip any accidental markdown fences
    summaryJson = summaryJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (err) {
    console.warn('[Compression] Summarization LLM call failed:', err);
    return null;
  }

  // ── Step 2: Self-verification (optional) ───────────────────────────────────
  if (config.selfVerify) {
    try {
      const verifyPrompt = buildVerificationPrompt(transcript, summaryJson);
      const verified = await llmClient.chat(
        [
          { role: 'system', content: 'You are a precise conversation summarizer. Output only valid JSON, no markdown.' },
          { role: 'user', content: verifyPrompt },
        ],
        {
          temperature: 0.1,
          maxTokens: config.summaryMaxTokens,
        },
      );
      const verifiedText = verified.content.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      if (verifiedText.startsWith('{')) {
        summaryJson = verifiedText;
      }
    } catch {
      // Verification failure is non-fatal; we use the draft summary
    }
  }

  // ── Step 3: Parse and validate the JSON ────────────────────────────────────
  let parsed: Partial<ConversationSummary>;
  try {
    parsed = JSON.parse(summaryJson) as Partial<ConversationSummary>;
  } catch {
    console.warn('[Compression] Could not parse summary JSON, skipping compression.');
    return null;
  }

  const summary: ConversationSummary = {
    type: 'conversation_summary',
    originalMessageCount: toCompress.length,
    compressedAt: new Date().toISOString(),
    keyDecisions:          Array.isArray(parsed.keyDecisions)          ? parsed.keyDecisions          : [],
    importantFacts:        Array.isArray(parsed.importantFacts)        ? parsed.importantFacts        : [],
    userPreferences:       Array.isArray(parsed.userPreferences)       ? parsed.userPreferences       : [],
    pendingActions:        Array.isArray(parsed.pendingActions)        ? parsed.pendingActions        : [],
    toolResultHighlights:  Array.isArray(parsed.toolResultHighlights)  ? parsed.toolResultHighlights  : [],
    narrativeSummary:      typeof parsed.narrativeSummary === 'string' ? parsed.narrativeSummary      : '',
  };

  // ── Step 4: Build the summary message ──────────────────────────────────────
  const summaryMessageContent = formatSummaryAsText(summary);
  const summaryMessage: Message = {
    role: 'user',
    content: `[CONVERSATION SUMMARY — ${toCompress.length} earlier messages compressed]\n\n${summaryMessageContent}`,
  };

  const compressedMessages: Message[] = [summaryMessage, ...toKeep];
  const afterCount = compressedMessages.length;
  const afterChars = estimateChars(compressedMessages);

  return {
    compressedMessages,
    summary,
    beforeCount,
    afterCount,
    beforeChars,
    afterChars,
  };
}

/**
 * Convert a ConversationSummary to human-readable text suitable for injection
 * into the conversation history.
 */
function formatSummaryAsText(summary: ConversationSummary): string {
  const lines: string[] = [
    `Summary of the first ${summary.originalMessageCount} messages (compressed ${summary.compressedAt}):`,
    '',
  ];

  if (summary.narrativeSummary) {
    lines.push(summary.narrativeSummary, '');
  }

  if (summary.keyDecisions.length > 0) {
    lines.push('Key decisions:', ...summary.keyDecisions.map(d => `  • ${d}`), '');
  }
  if (summary.importantFacts.length > 0) {
    lines.push('Important facts:', ...summary.importantFacts.map(f => `  • ${f}`), '');
  }
  if (summary.userPreferences.length > 0) {
    lines.push('User preferences:', ...summary.userPreferences.map(p => `  • ${p}`), '');
  }
  if (summary.pendingActions.length > 0) {
    lines.push('Pending actions:', ...summary.pendingActions.map(a => `  • ${a}`), '');
  }
  if (summary.toolResultHighlights.length > 0) {
    lines.push('Tool result highlights:', ...summary.toolResultHighlights.map(t => `  • ${t}`), '');
  }

  return lines.join('\n').trimEnd();
}

// ─── Trigger Logic ────────────────────────────────────────────────────────────

/**
 * Check whether the current conversation should be compressed.
 *
 * Triggers compression when either:
 * 1. Character ratio exceeds triggerThreshold (relative to maxChars)
 * 2. Token count exceeds autoCompactionTokens (absolute threshold)
 *
 * @param messages     - Non-system messages in the conversation history
 * @param maxChars     - Context budget (characters)
 * @param config       - Compression config
 */
export function shouldCompress(
  messages: Message[],
  maxChars: number,
  config: CompressionConfig = DEFAULT_COMPRESSION_CONFIG,
): boolean {
  if (!config.enabled) return false;
  if (messages.length < config.preserveRecent + 4) return false;

  // Check character-based threshold
  const threshold = Math.max(0.2, Math.min(0.9, config.triggerThreshold));
  const currentChars = estimateChars(messages);
  if (currentChars >= maxChars * threshold) return true;

  // Check absolute token threshold (auto-compaction)
  const currentTokens = estimateTokens(messages);
  if (currentTokens >= config.autoCompactionTokens) return true;

  return false;
}
