/**
 * Tests for the agent state machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stateMachine } from '../src/services/state-machine';
import { eventBus } from '../src/services/event-bus';

describe('State Machine', () => {
  it('creates agent state on first transition', () => {
    stateMachine.transition('sm-agent-1', 'thinking', 'Test', 'sess-1');
    const state = stateMachine.getState('sm-agent-1');
    expect(state).toBeTruthy();
    expect(state!.currentState).toBe('thinking');
  });

  it('transitions between states', () => {
    stateMachine.transition('sm-agent-2', 'thinking', 'Request sent', 'sess-2');
    expect(stateMachine.getState('sm-agent-2')!.currentState).toBe('thinking');

    stateMachine.transition('sm-agent-2', 'executing', 'Response received', 'sess-2');
    expect(stateMachine.getState('sm-agent-2')!.currentState).toBe('executing');
    expect(stateMachine.getState('sm-agent-2')!.previousState).toBe('thinking');
  });

  it('records transitions', () => {
    const transitions = stateMachine.getTransitions('sm-agent-2');
    expect(transitions.length).toBeGreaterThanOrEqual(2);
    expect(transitions[0].from).toBeDefined();
    expect(transitions[0].to).toBeDefined();
    expect(transitions[0].reason).toBeDefined();
  });

  it('emits state:changed events', () => {
    const spy = vi.fn();
    eventBus.on('state:changed', spy);

    stateMachine.transition('sm-agent-3', 'planning', 'Started planning', 'sess-3');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'sm-agent-3',
      to: 'planning',
    }));

    eventBus.off('state:changed', spy);
  });

  it('does not transition if already in same state', () => {
    stateMachine.transition('sm-agent-4', 'thinking', 'First', 'sess-4');
    const transitions1 = stateMachine.getTransitions('sm-agent-4');
    const count1 = transitions1.length;

    stateMachine.transition('sm-agent-4', 'thinking', 'Again', 'sess-4');
    const transitions2 = stateMachine.getTransitions('sm-agent-4');
    // No new transition should be recorded
    expect(transitions2.length).toBe(count1);
  });

  it('infers state from proxy activity - request', () => {
    stateMachine.onProxyActivity('sm-proxy-1', 'Cursor', 'sess-p1', 'request');
    const state = stateMachine.getState('sm-proxy-1');
    expect(state).toBeTruthy();
    expect(state!.currentState).toBe('thinking');
  });

  it('infers state from proxy activity - response', () => {
    stateMachine.onProxyActivity('sm-proxy-1', 'Cursor', 'sess-p1', 'response');
    const state = stateMachine.getState('sm-proxy-1');
    expect(state!.currentState).toBe('executing');
  });

  it('marks agent as completed', () => {
    stateMachine.transition('sm-complete-1', 'executing', 'Working', 'sess-c1');
    stateMachine.complete('sm-complete-1');
    expect(stateMachine.getState('sm-complete-1')!.currentState).toBe('completed');
  });

  it('returns all agent states', () => {
    const all = stateMachine.getAllStates();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown agent', () => {
    const state = stateMachine.getState('nonexistent-agent');
    expect(state).toBeUndefined();
  });

  it('returns empty transitions for unknown agent', () => {
    const transitions = stateMachine.getTransitions('nonexistent-agent');
    expect(transitions).toEqual([]);
  });
});
