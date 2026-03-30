/**
 * @file state-machine.ts — Agent State Machine
 * @description Tracks the lifecycle state of each agent session.
 * Infers state from proxy traffic patterns:
 *   - Request sent → thinking (waiting for response)
 *   - Response received → executing (acting on result)
 *   - No activity for threshold → idle
 *   - No activity for 5+ min → stalled (alert)
 *
 * States: idle → planning → thinking → executing → tool_calling → waiting → verifying → completed/failed
 */

import { eventBus } from './event-bus';
import { store } from './database';
import { genId, genTraceId, genSpanId, type AgentState, type AgentEvent } from '../schema';

interface AgentStateEntry {
  agentId: string;
  agentName: string;
  sessionId: string;
  currentState: AgentState;
  previousState: AgentState;
  stateChangedAt: number;  // timestamp ms
  lastActivityAt: number;
  transitions: Array<{ from: AgentState; to: AgentState; at: string; reason: string }>;
}

const IDLE_THRESHOLD_MS = 30_000;     // 30s → idle
const STALL_THRESHOLD_MS = 5 * 60_000; // 5min → stalled (alert)

class StateMachine {
  private agents: Map<string, AgentStateEntry> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private stallTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Transition an agent to a new state. Records in DB + emits event.
   */
  transition(agentId: string, newState: AgentState, reason: string, sessionId?: string) {
    let entry = this.agents.get(agentId);

    if (!entry) {
      // First time seeing this agent — create entry
      entry = {
        agentId,
        agentName: agentId,
        sessionId: sessionId || '',
        currentState: 'idle',
        previousState: 'idle',
        stateChangedAt: Date.now(),
        lastActivityAt: Date.now(),
        transitions: [],
      };
      this.agents.set(agentId, entry);
    }

    const oldState = entry.currentState;
    if (oldState === newState) {
      // Just update activity timestamp, no state change
      entry.lastActivityAt = Date.now();
      this.resetTimers(agentId);
      return;
    }

    entry.previousState = oldState;
    entry.currentState = newState;
    entry.stateChangedAt = Date.now();
    entry.lastActivityAt = Date.now();
    if (sessionId) entry.sessionId = sessionId;

    const transitionRecord = {
      from: oldState,
      to: newState,
      at: new Date().toISOString(),
      reason,
    };
    entry.transitions.push(transitionRecord);

    // Keep last 100 transitions per agent
    if (entry.transitions.length > 100) {
      entry.transitions = entry.transitions.slice(-100);
    }

    // Persist state change event to DB (only if session exists)
    if (entry.sessionId) {
      try {
        const session = store.getSession(entry.sessionId);
        if (session) {
          const event: AgentEvent = {
            id: genId('evt'),
            session_id: entry.sessionId,
            agent_id: agentId,
            trace_id: genTraceId(),
            span_id: genSpanId(),
            timestamp: new Date().toISOString(),
            event_type: 'agent.state.changed',
            state: newState,
            summary: `${entry.agentName}: ${oldState} → ${newState} (${reason})`,
            icon: stateIcon(newState),
            color: stateColor(newState),
            severity: newState === 'stalled' ? 'warn' : 'info',
            risk_level: newState === 'stalled' ? 30 : 0,
            metadata: { from: oldState, to: newState, reason },
          };
          store.insertEvent(event);
        }
      } catch {
        // DB not available or session doesn't exist — continue without persisting
      }
    }

    // Emit for WebSocket
    eventBus.emit('state:changed', {
      agentId,
      agentName: entry.agentName,
      from: oldState,
      to: newState,
      reason,
      sessionId: entry.sessionId,
    });

    // Reset idle/stall timers
    this.resetTimers(agentId);
  }

  /**
   * Called when we see proxy activity from an agent.
   * Infers the state from the event type.
   */
  onProxyActivity(agentId: string, agentName: string, sessionId: string, eventType: 'request' | 'response') {
    let entry = this.agents.get(agentId);
    if (entry) {
      entry.agentName = agentName;
      entry.sessionId = sessionId;
    }

    if (eventType === 'request') {
      // Agent sent a request → it's thinking (waiting for model response)
      this.transition(agentId, 'thinking', 'LLM request sent', sessionId);
    } else if (eventType === 'response') {
      // Got a response → agent is now executing (acting on the response)
      this.transition(agentId, 'executing', 'LLM response received', sessionId);
    }
  }

  /**
   * Reset idle/stall detection timers for an agent.
   */
  private resetTimers(agentId: string) {
    // Clear existing
    const existing = this.timers.get(agentId);
    if (existing) clearTimeout(existing);
    const stallExisting = this.stallTimers.get(agentId);
    if (stallExisting) clearTimeout(stallExisting);

    const entry = this.agents.get(agentId);
    if (!entry || entry.currentState === 'completed' || entry.currentState === 'failed') return;

    // Idle timer
    this.timers.set(agentId, setTimeout(() => {
      const e = this.agents.get(agentId);
      if (e && e.currentState !== 'idle' && e.currentState !== 'stalled' && e.currentState !== 'completed') {
        this.transition(agentId, 'idle', 'No activity for 30s');
      }
    }, IDLE_THRESHOLD_MS));

    // Stall timer
    this.stallTimers.set(agentId, setTimeout(() => {
      const e = this.agents.get(agentId);
      if (e && e.currentState !== 'completed' && e.currentState !== 'failed') {
        this.transition(agentId, 'stalled', 'No activity for 5+ minutes');

        // Create alert
        if (e.sessionId) {
          try {
            store.createAlert({
              id: genId('alert'),
              session_id: e.sessionId,
              alert_type: 'stalled_agent',
              severity: 'warn',
              message: `${e.agentName} has been inactive for 5+ minutes — might be stuck`,
              status: 'active',
              created_at: new Date().toISOString(),
              metadata: { agentId, lastState: e.previousState },
            });
          } catch { /* session may not exist in DB */ }
          eventBus.emit('alert:created', { agentId, type: 'stalled_agent' });
        }
      }
    }, STALL_THRESHOLD_MS));
  }

  /**
   * Get current state for an agent.
   */
  getState(agentId: string): AgentStateEntry | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent states.
   */
  getAllStates(): AgentStateEntry[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get state transitions for an agent.
   */
  getTransitions(agentId: string): AgentStateEntry['transitions'] {
    return this.agents.get(agentId)?.transitions || [];
  }

  /**
   * Mark an agent session as completed.
   */
  complete(agentId: string) {
    this.transition(agentId, 'completed', 'Session ended');
    // Clean up timers
    const timer = this.timers.get(agentId);
    if (timer) clearTimeout(timer);
    this.timers.delete(agentId);
    const stallTimer = this.stallTimers.get(agentId);
    if (stallTimer) clearTimeout(stallTimer);
    this.stallTimers.delete(agentId);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function stateIcon(state: AgentState): string {
  const map: Record<string, string> = {
    idle: '💤', initializing: '🔄', planning: '📐', executing: '⚡',
    waiting: '⏳', thinking: '🧠', tool_calling: '🔧', verifying: '✅',
    needs_approval: '🔐', completed: '🏁', failed: '❌', stalled: '⚠️',
    paused: '⏸️', queued: '📋',
  };
  return map[state] || '❓';
}

function stateColor(state: AgentState): string {
  const map: Record<string, string> = {
    idle: 'gray', initializing: 'blue', planning: 'blue', executing: 'green',
    waiting: 'yellow', thinking: 'blue', tool_calling: 'green', verifying: 'green',
    needs_approval: 'yellow', completed: 'green', failed: 'red', stalled: 'red',
    paused: 'gray', queued: 'gray',
  };
  return map[state] || 'gray';
}

export const stateMachine = new StateMachine();
