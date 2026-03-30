/**
 * @file session-manager.ts — Auto-creates and manages sessions from proxy traffic.
 * Groups agent activity into sessions based on agent ID + time gaps.
 * A new session starts when an agent sends its first request or after 30min of idle.
 */

import { store } from './database';
import { genId, genTraceId, genSpanId, type AgentState, type AgentEvent, type Session } from '../schema';
import { eventBus } from './event-bus';

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes of silence = new session

// Model pricing per 1M tokens (input/output)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':           { input: 2.50, output: 10.00 },
  'gpt-4o-mini':      { input: 0.15, output: 0.60 },
  'gpt-4-turbo':      { input: 10.00, output: 30.00 },
  'gpt-4':            { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':    { input: 0.50, output: 1.50 },
  'claude-sonnet-4-20250514':    { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514':      { input: 15.00, output: 75.00 },
  'claude-haiku-3-5-20241022':     { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229':  { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Find closest matching model
  const key = Object.keys(MODEL_PRICING).find(k => model.toLowerCase().includes(k.toLowerCase()))
    || Object.keys(MODEL_PRICING).find(k => model.toLowerCase().startsWith(k.split('-')[0]));
  if (!key) return 0;
  const pricing = MODEL_PRICING[key];
  return ((inputTokens / 1_000_000) * pricing.input) + ((outputTokens / 1_000_000) * pricing.output);
}

class SessionManager {
  // Track active session per agent
  private activeSessions: Map<string, { sessionId: string; lastActivity: number }> = new Map();

  /**
   * Get or create a session for an agent. Returns session ID.
   */
  getOrCreateSession(agentId: string, agentName: string, model: string): string {
    const now = Date.now();
    const entry = this.activeSessions.get(agentId);

    // Check if existing session is still valid
    if (entry && (now - entry.lastActivity) < SESSION_GAP_MS) {
      entry.lastActivity = now;
      // Update session
      store.updateSession({
        id: entry.sessionId,
        state: 'executing' as AgentState,
        model,
      });
      return entry.sessionId;
    }

    // Close old session if exists
    if (entry) {
      this.endSession(entry.sessionId, 'completed');
    }

    // Create new session
    const sessionId = genId('sess');
    store.createSession({
      id: sessionId,
      title: `${agentName} session`,
      agent_id: agentId,
      agent_name: agentName,
      model,
      start_time: new Date().toISOString(),
      state: 'executing' as AgentState,
      final_status: 'running',
      current_task: 'Processing requests',
    });

    this.activeSessions.set(agentId, { sessionId, lastActivity: now });

    // Emit session started event
    const event: AgentEvent = {
      id: genId('evt'),
      session_id: sessionId,
      agent_id: agentId,
      trace_id: genTraceId(),
      span_id: genSpanId(),
      timestamp: new Date().toISOString(),
      event_type: 'session.started',
      state: 'executing',
      summary: `${agentName} started a new session`,
      icon: '🚀',
      color: 'green',
      severity: 'info',
      risk_level: 0,
      metadata: { model },
    };
    store.insertEvent(event);
    eventBus.emit('session:started', { sessionId, agentId, agentName });

    return sessionId;
  }

  /**
   * Record a proxy event (LLM request or response) into the session.
   */
  recordProxyEvent(opts: {
    agentId: string;
    agentName: string;
    model: string;
    eventType: 'llm.request.started' | 'llm.request.completed';
    summary: string;
    metadata: Record<string, unknown>;
    parentSpanId?: string;
  }): AgentEvent {
    const sessionId = this.getOrCreateSession(opts.agentId, opts.agentName, opts.model);
    const traceId = genTraceId();
    const spanId = genSpanId();

    const event: AgentEvent = {
      id: genId('evt'),
      session_id: sessionId,
      agent_id: opts.agentId,
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: opts.parentSpanId,
      timestamp: new Date().toISOString(),
      event_type: opts.eventType,
      state: opts.eventType === 'llm.request.started' ? 'thinking' : 'executing',
      summary: opts.summary,
      icon: opts.eventType === 'llm.request.started' ? '💬' : '✨',
      color: 'yellow',
      severity: 'info',
      risk_level: 0,
      metadata: opts.metadata,
    };

    store.insertEvent(event);

    // Update session tokens and cost
    if (opts.eventType === 'llm.request.completed') {
      const inputTokens = Number(opts.metadata.inputTokens || opts.metadata.promptTokens || 0);
      const outputTokens = Number(opts.metadata.outputTokens || opts.metadata.completionTokens || 0);
      const totalTokens = inputTokens + outputTokens;
      const cost = estimateCost(opts.model, inputTokens, outputTokens);

      const session = store.getSession(sessionId);
      if (session) {
        store.updateSession({
          id: sessionId,
          total_tokens: (session.total_tokens || 0) + totalTokens,
          total_cost: (session.total_cost || 0) + cost,
          last_action: opts.summary,
        });
      }
    }

    return event;
  }

  /**
   * End a session.
   */
  endSession(sessionId: string, status: 'completed' | 'failed' | 'cancelled' = 'completed') {
    const session = store.getSession(sessionId);
    if (!session) return;

    const now = new Date();
    const startTime = new Date(session.start_time).getTime();
    const duration = now.getTime() - startTime;

    store.updateSession({
      id: sessionId,
      state: status === 'completed' ? 'completed' : 'failed',
      final_status: status,
      end_time: now.toISOString(),
      total_duration_ms: duration,
    });

    // Insert session ended event
    const event: AgentEvent = {
      id: genId('evt'),
      session_id: sessionId,
      agent_id: session.agent_id,
      trace_id: genTraceId(),
      span_id: genSpanId(),
      timestamp: now.toISOString(),
      event_type: 'session.ended',
      state: status === 'completed' ? 'completed' : 'failed',
      summary: `Session ended (${status}) — ${(duration / 1000).toFixed(0)}s, ${session.total_tokens} tokens, $${(session.total_cost || 0).toFixed(4)}`,
      icon: status === 'completed' ? '✅' : '❌',
      color: status === 'completed' ? 'green' : 'red',
      severity: 'info',
      risk_level: 0,
      metadata: { duration, status, tokens: session.total_tokens, cost: session.total_cost },
    };
    store.insertEvent(event);
    eventBus.emit('session:ended', { sessionId, status });

    // Remove from active map
    for (const [agentId, entry] of this.activeSessions) {
      if (entry.sessionId === sessionId) {
        this.activeSessions.delete(agentId);
        break;
      }
    }
  }

  /**
   * Check for idle sessions and close them.
   */
  checkIdleSessions() {
    const now = Date.now();
    for (const [agentId, entry] of this.activeSessions) {
      if ((now - entry.lastActivity) >= SESSION_GAP_MS) {
        this.endSession(entry.sessionId, 'completed');
      }
    }
  }

  /**
   * Get active sessions from memory.
   */
  getActiveSessions(): Array<{ agentId: string; sessionId: string }> {
    return Array.from(this.activeSessions.entries()).map(([agentId, entry]) => ({
      agentId,
      sessionId: entry.sessionId,
    }));
  }
}

export const sessionManager = new SessionManager();

// Check for idle sessions every 60 seconds
setInterval(() => sessionManager.checkIdleSessions(), 60_000);
