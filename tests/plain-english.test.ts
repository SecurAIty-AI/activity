/**
 * Tests for the plain English translation engine.
 * Every event type must produce a human-readable translation.
 */

import { describe, it, expect } from 'vitest';
import { translateToPlainEnglish, type ActivityType } from '../src/services/plain-english';

describe('Plain English Translator', () => {
  const agentName = 'Cursor';

  // ── LLM Events ──────────────────────────────────────────────

  it('translates llm:request with user message', () => {
    const result = translateToPlainEnglish({
      type: 'llm:request',
      details: { model: 'gpt-4o', lastUserMessage: 'Fix the login bug', messageCount: 3 },
      agentName,
    });
    expect(result.plain).toContain('Cursor');
    expect(result.plain).toContain('gpt-4o');
    expect(result.plain).toContain('Fix the login bug');
    expect(result.icon).toBe('💬');
    expect(result.color).toBe('yellow');
  });

  it('translates llm:request without user message', () => {
    const result = translateToPlainEnglish({
      type: 'llm:request',
      details: { model: 'claude-sonnet-4-20250514', messageCount: 5, promptTokens: 1000 },
      agentName,
    });
    expect(result.plain).toContain('5 messages');
    expect(result.plain).toContain('~1000 tokens');
    expect(result.label).toBe('Sending prompt');
  });

  it('translates llm:response with preview', () => {
    const result = translateToPlainEnglish({
      type: 'llm:response',
      details: { model: 'gpt-4o', latencyMs: 1200, responsePreview: 'Here is the fix...', completionTokens: 200 },
      agentName,
    });
    expect(result.plain).toContain('gpt-4o');
    expect(result.plain).toContain('Here is the fix');
    expect(result.plain).toContain('1.2s');
    expect(result.icon).toBe('✨');
  });

  it('translates llm:response without preview', () => {
    const result = translateToPlainEnglish({
      type: 'llm:response',
      details: { model: 'claude-sonnet-4-20250514', completionTokens: 500, latencyMs: 3000 },
      agentName,
    });
    expect(result.plain).toContain('500 tokens');
    expect(result.plain).toContain('3.0s');
  });

  // ── File Events ─────────────────────────────────────────────

  it('translates file:read', () => {
    const result = translateToPlainEnglish({
      type: 'file:read',
      details: { path: '/Users/dev/project/src/App.tsx' },
      agentName,
    });
    expect(result.plain).toContain('reading');
    expect(result.plain).toContain('App.tsx');
    expect(result.icon).toBe('📖');
    expect(result.color).toBe('blue');
  });

  it('translates file:write with size', () => {
    const result = translateToPlainEnglish({
      type: 'file:write',
      details: { filename: 'index.ts', size: 2048 },
      agentName,
    });
    expect(result.plain).toContain('editing');
    expect(result.plain).toContain('2.0KB');
    expect(result.icon).toBe('✍️');
    expect(result.color).toBe('green');
  });

  it('translates file:create', () => {
    const result = translateToPlainEnglish({
      type: 'file:create',
      details: { filename: 'useData.ts' },
      agentName,
    });
    expect(result.plain).toContain('created');
    expect(result.plain).toContain('useData.ts');
    expect(result.icon).toBe('📄');
  });

  it('translates file:delete', () => {
    const result = translateToPlainEnglish({
      type: 'file:delete',
      details: { path: '/tmp/old-file.js' },
      agentName,
    });
    expect(result.plain).toContain('deleted');
    expect(result.icon).toBe('🗑️');
    expect(result.color).toBe('red');
  });

  // ── Process Events ──────────────────────────────────────────

  it('translates process:exec with npm command', () => {
    const result = translateToPlainEnglish({
      type: 'process:exec',
      details: { command: 'npm install react-query' },
      agentName,
    });
    expect(result.plain).toContain('installing/running packages');
    expect(result.icon).toBe('💻');
    expect(result.color).toBe('green');
  });

  it('translates process:exec with git command', () => {
    const result = translateToPlainEnglish({
      type: 'process:exec',
      details: { command: 'git commit -m "fix bug"' },
      agentName,
    });
    expect(result.plain).toContain('Git');
  });

  it('translates process:exec with rm command', () => {
    const result = translateToPlainEnglish({
      type: 'process:exec',
      details: { command: 'rm -rf node_modules' },
      agentName,
    });
    expect(result.plain).toContain('deleting');
  });

  it('translates process:exec with test command', () => {
    const result = translateToPlainEnglish({
      type: 'process:exec',
      details: { command: 'npx vitest run' },
      agentName,
    });
    expect(result.plain).toContain('running tests');
  });

  // ── Network Events ──────────────────────────────────────────

  it('translates network:outbound with known domains', () => {
    const openai = translateToPlainEnglish({
      type: 'network:outbound',
      details: { domain: 'api.openai.com' },
      agentName,
    });
    expect(openai.plain).toContain('OpenAI');

    const anthropic = translateToPlainEnglish({
      type: 'network:outbound',
      details: { domain: 'api.anthropic.com' },
      agentName,
    });
    expect(anthropic.plain).toContain('Anthropic');
  });

  it('translates network:outbound with unknown domain', () => {
    const result = translateToPlainEnglish({
      type: 'network:outbound',
      details: { domain: 'custom-api.example.com' },
      agentName,
    });
    expect(result.plain).toContain('custom-api.example.com');
    expect(result.icon).toBe('🌐');
    expect(result.color).toBe('purple');
  });

  // ── Tool Events ─────────────────────────────────────────────

  it('translates tool:call', () => {
    const result = translateToPlainEnglish({
      type: 'tool:call',
      details: { tool: 'web_search', args: 'React Query migration guide' },
      agentName,
    });
    expect(result.plain).toContain('web_search');
    expect(result.plain).toContain('React Query');
    expect(result.icon).toBe('🔧');
  });

  it('translates tool:result', () => {
    const result = translateToPlainEnglish({
      type: 'tool:result',
      details: { tool: 'web_search' },
      agentName,
    });
    expect(result.plain).toContain('results back');
    expect(result.icon).toBe('📋');
  });

  // ── Thinking Events ─────────────────────────────────────────

  it('translates thought:reasoning with content', () => {
    const result = translateToPlainEnglish({
      type: 'thought:reasoning',
      details: { content: 'I should use React Query for caching' },
      agentName,
    });
    expect(result.plain).toContain('thinking');
    expect(result.plain).toContain('React Query');
    expect(result.icon).toBe('🧠');
    expect(result.color).toBe('blue');
  });

  it('translates thought:plan', () => {
    const result = translateToPlainEnglish({
      type: 'thought:plan',
      details: { content: 'Step 1: Read file. Step 2: Edit component.' },
      agentName,
    });
    expect(result.plain).toContain('planning');
    expect(result.icon).toBe('📐');
  });

  // ── Idle Events ─────────────────────────────────────────────

  it('translates idle:start', () => {
    const result = translateToPlainEnglish({
      type: 'idle:start',
      details: {},
      agentName,
    });
    expect(result.plain).toContain('idle');
    expect(result.icon).toBe('💤');
    expect(result.color).toBe('gray');
  });

  it('translates idle:end', () => {
    const result = translateToPlainEnglish({
      type: 'idle:end',
      details: {},
      agentName,
    });
    expect(result.plain).toContain('back');
    expect(result.icon).toBe('⚡');
  });

  // ── Error Events ────────────────────────────────────────────

  it('translates error', () => {
    const result = translateToPlainEnglish({
      type: 'error',
      details: { message: 'Connection refused' },
      agentName,
    });
    expect(result.plain).toContain('problem');
    expect(result.plain).toContain('Connection refused');
    expect(result.icon).toBe('❌');
    expect(result.color).toBe('red');
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles unknown event type gracefully', () => {
    const result = translateToPlainEnglish({
      type: 'unknown:event' as ActivityType,
      details: {},
      agentName,
    });
    expect(result.plain).toContain('Cursor');
    expect(result.icon).toBe('❓');
  });

  it('handles missing agentName', () => {
    const result = translateToPlainEnglish({
      type: 'llm:request',
      details: { model: 'gpt-4o', lastUserMessage: 'hello' },
      agentName: '',
    });
    expect(result.plain).toContain('The AI');
  });

  it('truncates long messages', () => {
    const longMsg = 'A'.repeat(200);
    const result = translateToPlainEnglish({
      type: 'llm:request',
      details: { model: 'gpt-4o', lastUserMessage: longMsg },
      agentName,
    });
    expect(result.plain).toContain('...');
    expect(result.plain.length).toBeLessThan(300);
  });

  // ── Structure ───────────────────────────────────────────────

  it('all translations return required fields', () => {
    const types: ActivityType[] = [
      'llm:request', 'llm:response', 'file:read', 'file:write', 'file:create',
      'file:delete', 'process:exec', 'process:spawn', 'network:outbound',
      'tool:call', 'tool:result', 'thought:reasoning', 'thought:plan',
      'idle:start', 'idle:end', 'error',
    ];

    for (const type of types) {
      const result = translateToPlainEnglish({ type, details: {}, agentName });
      expect(result).toHaveProperty('plain');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('icon');
      expect(result).toHaveProperty('color');
      expect(typeof result.plain).toBe('string');
      expect(result.plain.length).toBeGreaterThan(0);
      expect(['blue', 'green', 'yellow', 'gray', 'red', 'purple']).toContain(result.color);
    }
  });
});
