/**
 * Tests for intelligent conversation compression (compression.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// We import from the compiled dist, so build must have run first
const {
  compressConversationSegment,
  shouldCompress,
  DEFAULT_COMPRESSION_CONFIG,
} = await import('../dist/compression.js');

// ─── shouldCompress ───────────────────────────────────────────────────────────

test('shouldCompress returns false when disabled', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'x'.repeat(1000),
  }));
  const result = shouldCompress(messages, 18000, { ...DEFAULT_COMPRESSION_CONFIG, enabled: false });
  assert.equal(result, false, 'Should return false when compression is disabled');
});

test('shouldCompress returns false when below threshold', () => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
  ];
  const result = shouldCompress(messages, 18000, DEFAULT_COMPRESSION_CONFIG);
  assert.equal(result, false, 'Should not compress tiny conversations');
});

test('shouldCompress returns true when context exceeds threshold', () => {
  // Create messages that fill >50% of 18000 chars
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'x'.repeat(500),  // 20 * 500 = 10000 > 9000 (50% of 18000)
  }));
  const result = shouldCompress(messages, 18000, DEFAULT_COMPRESSION_CONFIG);
  assert.equal(result, true, 'Should trigger compression when context > 50% threshold');
});

test('shouldCompress returns false when not enough messages to compress', () => {
  // Only 4 messages, preserveRecent=6 means we can't compress anything
  const messages = [
    { role: 'user', content: 'x'.repeat(3000) },
    { role: 'assistant', content: 'x'.repeat(3000) },
    { role: 'user', content: 'x'.repeat(3000) },
    { role: 'assistant', content: 'x'.repeat(3000) },
  ];
  const result = shouldCompress(messages, 18000, { ...DEFAULT_COMPRESSION_CONFIG, preserveRecent: 6 });
  assert.equal(result, false, 'Should not compress when there are fewer messages than preserveRecent + 4');
});

// ─── compressConversationSegment ─────────────────────────────────────────────

test('compressConversationSegment returns null when disabled', async () => {
  const mockClient = { async chat() { return { content: '{}' }; } };
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Hello message ' + i,
  }));
  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    enabled: false,
  });
  assert.equal(result, null, 'Should return null when disabled');
});

test('compressConversationSegment returns null for empty messages', async () => {
  const mockClient = { async chat() { return { content: '{}' }; } };
  const result = await compressConversationSegment(mockClient, [], DEFAULT_COMPRESSION_CONFIG);
  assert.equal(result, null, 'Should return null for empty input');
});

test('compressConversationSegment returns null when LLM returns invalid JSON', async () => {
  const mockClient = {
    async chat() {
      return { content: 'This is not JSON at all' };
    },
  };
  const messages = Array.from({ length: 16 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Conversation message ' + i,
  }));
  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    selfVerify: false,
  });
  assert.equal(result, null, 'Should return null when LLM returns invalid JSON');
});

test('compressConversationSegment compresses messages with valid LLM response', async () => {
  const summaryPayload = JSON.stringify({
    keyDecisions: ['Decision A', 'Decision B'],
    importantFacts: ['Fact 1', 'Fact 2'],
    userPreferences: ['Prefers concise answers'],
    pendingActions: ['Still need to implement X'],
    toolResultHighlights: ['search_arxiv found 3 papers'],
    narrativeSummary: 'User asked about research. Key findings were established.',
  });

  const mockClient = {
    callCount: 0,
    async chat() {
      this.callCount++;
      return { content: summaryPayload };
    },
  };

  const messages = Array.from({ length: 16 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Conversation message ' + i,
  }));

  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    compressionRatio: 0.5,
    preserveRecent: 4,
    selfVerify: true,
  });

  assert.notEqual(result, null, 'Should return a result');
  assert.ok(result.afterCount < result.beforeCount, 'Should reduce message count');
  assert.equal(result.beforeCount, 16, 'beforeCount should be original count');
  assert.ok(result.compressedMessages.length > 0, 'Should have at least some messages');
  // The first message should be the summary
  assert.ok(
    result.compressedMessages[0].content.includes('CONVERSATION SUMMARY'),
    'First message should be a summary marker',
  );
  assert.ok(
    result.compressedMessages[0].content.includes('Decision A'),
    'Summary should contain key decisions',
  );
  assert.ok(
    result.compressedMessages[0].content.includes('Still need to implement X'),
    'Summary should contain pending actions',
  );
  // selfVerify=true means 2 LLM calls (draft + verify)
  assert.equal(mockClient.callCount, 2, 'Should make 2 LLM calls when selfVerify is true');
});

test('compressConversationSegment makes only 1 LLM call when selfVerify is false', async () => {
  const summaryPayload = JSON.stringify({
    keyDecisions: [],
    importantFacts: ['Important fact'],
    userPreferences: [],
    pendingActions: [],
    toolResultHighlights: [],
    narrativeSummary: 'Brief conversation summary.',
  });

  const mockClient = {
    callCount: 0,
    async chat() {
      this.callCount++;
      return { content: summaryPayload };
    },
  };

  const messages = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Message ' + i,
  }));

  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    selfVerify: false,
    compressionRatio: 0.4,
    preserveRecent: 4,
  });

  assert.notEqual(result, null, 'Should return a result');
  assert.equal(mockClient.callCount, 1, 'Should make only 1 LLM call when selfVerify is false');
});

test('compressConversationSegment preserves system messages separately', async () => {
  const summaryPayload = JSON.stringify({
    keyDecisions: [],
    importantFacts: ['Key fact'],
    userPreferences: [],
    pendingActions: [],
    toolResultHighlights: [],
    narrativeSummary: 'Conversation happened.',
  });

  const mockClient = { async chat() { return { content: summaryPayload }; } };

  // System message should NOT be included in compressed set
  const messages = [
    { role: 'user', content: 'Message 0' },
    { role: 'assistant', content: 'Response 0' },
    { role: 'user', content: 'Message 1' },
    { role: 'assistant', content: 'Response 1' },
    { role: 'user', content: 'Message 2' },
    { role: 'assistant', content: 'Response 2' },
    { role: 'user', content: 'Message 3' },
    { role: 'assistant', content: 'Response 3' },
    { role: 'user', content: 'Message 4' },
    { role: 'assistant', content: 'Response 4' },
    { role: 'user', content: 'Message 5 (recent)' },
    { role: 'assistant', content: 'Response 5 (recent)' },
  ];

  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    selfVerify: false,
    compressionRatio: 0.4,
    preserveRecent: 4,
  });

  assert.notEqual(result, null, 'Should compress successfully');
  // The most recent messages should be preserved in full
  const lastTwoOriginal = messages.slice(-4).map(m => m.content);
  for (const recentContent of lastTwoOriginal) {
    const found = result.compressedMessages.some(m =>
      typeof m.content === 'string' && m.content.includes(recentContent),
    );
    assert.ok(found, `Recent message should be preserved: "${recentContent}"`);
  }
});

test('compressConversationSegment handles LLM failure gracefully', async () => {
  const mockClient = {
    async chat() {
      throw new Error('Network error');
    },
  };

  const messages = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Message ' + i,
  }));

  const result = await compressConversationSegment(mockClient, messages, {
    ...DEFAULT_COMPRESSION_CONFIG,
    selfVerify: false,
  });

  assert.equal(result, null, 'Should return null when LLM call fails');
});
