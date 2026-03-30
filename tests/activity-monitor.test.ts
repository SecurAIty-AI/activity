/**
 * Tests for the in-memory activity monitor.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// We need a fresh instance per test, so we'll test the class directly
// by importing and re-creating
describe('ActivityMonitor', () => {
  // Import the singleton — tests share state but that's fine for validation
  let monitor: any;

  beforeEach(async () => {
    // Dynamic import to get fresh module reference
    const mod = await import('../src/services/activity-monitor');
    monitor = mod.activityMonitor;
  });

  it('records an event and returns it', () => {
    const event = monitor.record({
      agentId: 'test-agent-1',
      agentName: 'Test Agent',
      type: 'llm:request' as const,
      summary: 'Test request',
      details: { model: 'gpt-4o', lastUserMessage: 'Hello' },
    });

    expect(event).toHaveProperty('id');
    expect(event.agentId).toBe('test-agent-1');
    expect(event.agentName).toBe('Test Agent');
    expect(event.type).toBe('llm:request');
    expect(event.plain).toBeTruthy(); // plain English translation
    expect(event.icon).toBe('💬');
  });

  it('auto-creates agent on first event', () => {
    monitor.record({
      agentId: 'new-agent-99',
      agentName: 'New Agent',
      type: 'file:read' as const,
      summary: 'Reading a file',
      details: { path: '/test.txt' },
    });

    const agent = monitor.getAgent('new-agent-99');
    expect(agent).toBeTruthy();
    expect(agent!.name).toBe('New Agent');
    expect(agent!.status).toBe('active');
  });

  it('queries events with filters', () => {
    // Record events for different agents
    monitor.record({
      agentId: 'filter-agent-a',
      agentName: 'Agent A',
      type: 'llm:request' as const,
      summary: 'A request',
      details: {},
    });
    monitor.record({
      agentId: 'filter-agent-b',
      agentName: 'Agent B',
      type: 'file:write' as const,
      summary: 'B write',
      details: {},
    });

    const agentAEvents = monitor.getEvents({ agentId: 'filter-agent-a' });
    expect(agentAEvents.some((e: any) => e.agentId === 'filter-agent-a')).toBe(true);

    const fileEvents = monitor.getEvents({ category: 'file' });
    expect(fileEvents.some((e: any) => e.category === 'file')).toBe(true);
  });

  it('limits event results', () => {
    for (let i = 0; i < 10; i++) {
      monitor.record({
        agentId: 'limit-agent',
        agentName: 'Limit',
        type: 'llm:request' as const,
        summary: `Request ${i}`,
        details: {},
      });
    }

    const limited = monitor.getEvents({ limit: 3 });
    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it('returns sorted events (newest first)', () => {
    const events = monitor.getEvents({ limit: 5 });
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i - 1].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(events[i].timestamp).getTime());
    }
  });

  it('tracks agent stats', () => {
    monitor.record({
      agentId: 'stats-agent',
      agentName: 'Stats',
      type: 'llm:request' as const,
      summary: 'Request',
      details: { model: 'gpt-4o', provider: 'openai' },
    });

    const agent = monitor.getAgent('stats-agent');
    expect(agent).toBeTruthy();
    expect(agent!.requestCount).toBeGreaterThanOrEqual(1);
  });

  it('returns overall stats', () => {
    const stats = monitor.getStats();
    expect(stats).toHaveProperty('totalEvents');
    expect(stats).toHaveProperty('totalAgents');
    expect(stats).toHaveProperty('activeAgents');
    expect(stats).toHaveProperty('eventsLastHour');
    expect(stats).toHaveProperty('byCategory');
    expect(typeof stats.totalEvents).toBe('number');
  });

  it('registers agent via registerAgent', () => {
    monitor.registerAgent('reg-agent', 'Registered', {
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    });

    const agent = monitor.getAgent('reg-agent');
    expect(agent).toBeTruthy();
    expect(agent!.name).toBe('Registered');
    expect(agent!.model).toBe('claude-sonnet-4-20250514');
  });

  it('returns all agents', () => {
    const agents = monitor.getAgents();
    expect(Array.isArray(agents)).toBe(true);
  });
});
