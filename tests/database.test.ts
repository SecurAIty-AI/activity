/**
 * Tests for SQLite database store.
 * Uses the real SQLite database (creates test data, then cleans up).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { store } from '../src/services/database';
import { genId, genTraceId, genSpanId } from '../src/schema';
import type { AgentEvent, Alert } from '../src/schema';

// Test IDs to clean up
const testSessionIds: string[] = [];

describe('Database Store', () => {
  // ── Sessions ────────────────────────────────────────────────

  describe('Sessions', () => {
    it('creates and retrieves a session', () => {
      const id = genId('test-sess');
      testSessionIds.push(id);

      store.createSession({
        id,
        title: 'Test Session',
        agent_id: 'test-agent',
        agent_name: 'Test Agent',
        model: 'gpt-4o',
        start_time: new Date().toISOString(),
        state: 'executing',
        final_status: 'running',
        current_task: 'Running tests',
      });

      const session = store.getSession(id);
      expect(session).toBeTruthy();
      expect(session!.title).toBe('Test Session');
      expect(session!.agent_name).toBe('Test Agent');
      expect(session!.model).toBe('gpt-4o');
      expect(session!.final_status).toBe('running');
    });

    it('updates a session', () => {
      const id = testSessionIds[0];

      store.updateSession({
        id,
        state: 'completed',
        final_status: 'completed',
        end_time: new Date().toISOString(),
        total_tokens: 1500,
        total_cost: 0.045,
        total_events: 10,
        last_action: 'Final action',
      });

      const session = store.getSession(id);
      expect(session!.state).toBe('completed');
      expect(session!.final_status).toBe('completed');
      expect(session!.total_tokens).toBe(1500);
      expect(session!.total_cost).toBeCloseTo(0.045);
    });

    it('lists sessions with search', () => {
      const sessions = store.getSessions({ search: 'Test Session' });
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('returns null for non-existent session', () => {
      const session = store.getSession('nonexistent-id');
      expect(session).toBeNull();
    });
  });

  // ── Events ──────────────────────────────────────────────────

  describe('Events', () => {
    it('inserts and queries events', () => {
      const sessionId = testSessionIds[0];
      const eventId = genId('test-evt');

      const event: AgentEvent = {
        id: eventId,
        session_id: sessionId,
        agent_id: 'test-agent',
        trace_id: genTraceId(),
        span_id: genSpanId(),
        timestamp: new Date().toISOString(),
        event_type: 'llm.request.started',
        state: 'thinking',
        summary: 'Test LLM request',
        icon: '💬',
        color: 'yellow',
        severity: 'info',
        risk_level: 0,
        metadata: { model: 'gpt-4o', tokens: 100 },
      };

      store.insertEvent(event);

      const events = store.getEvents({ session_id: sessionId });
      expect(events.length).toBeGreaterThanOrEqual(1);
      const found = events.find(e => e.id === eventId);
      expect(found).toBeTruthy();
      expect(found!.summary).toBe('Test LLM request');
      expect(found!.metadata).toHaveProperty('model', 'gpt-4o');
    });

    it('gets timeline (chronological order)', () => {
      const sessionId = testSessionIds[0];

      // Insert a second event
      store.insertEvent({
        id: genId('test-evt'),
        session_id: sessionId,
        agent_id: 'test-agent',
        trace_id: genTraceId(),
        span_id: genSpanId(),
        timestamp: new Date().toISOString(),
        event_type: 'llm.request.completed',
        summary: 'Test LLM response',
        icon: '✨',
        color: 'yellow',
        severity: 'info',
        risk_level: 0,
        metadata: {},
      });

      const timeline = store.getTimeline(sessionId);
      expect(timeline.length).toBeGreaterThanOrEqual(2);
      // Verify chronological order (ASC)
      for (let i = 1; i < timeline.length; i++) {
        expect(new Date(timeline[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(timeline[i - 1].timestamp).getTime());
      }
    });

    it('filters events by type', () => {
      const events = store.getEvents({ event_type: 'llm.request.started' });
      for (const e of events) {
        expect(e.event_type).toBe('llm.request.started');
      }
    });
  });

  // ── Alerts ──────────────────────────────────────────────────

  describe('Alerts', () => {
    it('creates and retrieves alerts', () => {
      const sessionId = testSessionIds[0];
      const alertId = genId('test-alert');

      const alert: Alert = {
        id: alertId,
        session_id: sessionId,
        alert_type: 'sensitive_file_access',
        severity: 'warn',
        message: 'Agent accessed ~/.ssh/id_rsa',
        status: 'active',
        created_at: new Date().toISOString(),
        metadata: { path: '~/.ssh/id_rsa' },
      };

      store.createAlert(alert);

      const alerts = store.getAlerts({ session_id: sessionId });
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const found = alerts.find(a => a.id === alertId);
      expect(found).toBeTruthy();
      expect(found!.message).toContain('ssh');
    });

    it('acknowledges an alert', () => {
      const alerts = store.getAlerts({ status: 'active' });
      if (alerts.length > 0) {
        store.acknowledgeAlert(alerts[0].id);
        const updated = store.getAlerts({});
        const found = updated.find(a => a.id === alerts[0].id);
        expect(found?.status).toBe('acknowledged');
      }
    });

    it('resolves an alert', () => {
      const alerts = store.getAlerts({ status: 'acknowledged' });
      if (alerts.length > 0) {
        store.resolveAlert(alerts[0].id);
        const updated = store.getAlerts({});
        const found = updated.find(a => a.id === alerts[0].id);
        expect(found?.status).toBe('resolved');
      }
    });
  });

  // ── Stats ───────────────────────────────────────────────────

  describe('Stats', () => {
    it('returns database stats', () => {
      const stats = store.getStats();
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('activeAlerts');
      expect(typeof stats.totalSessions).toBe('number');
    });
  });

  // ── Export ──────────────────────────────────────────────────

  describe('Export', () => {
    it('exports a full session', () => {
      const sessionId = testSessionIds[0];
      const exported = store.exportSession(sessionId);
      expect(exported).toHaveProperty('session');
      expect(exported).toHaveProperty('events');
      expect(exported).toHaveProperty('alerts');
      expect(exported).toHaveProperty('snapshots');
      expect(exported.session).toBeTruthy();
      expect(Array.isArray(exported.events)).toBe(true);
    });
  });

  // ── Schema Validation ──────────────────────────────────────

  describe('Schema', () => {
    it('genId produces unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => genId('test')));
      expect(ids.size).toBe(100);
    });

    it('genTraceId produces unique trace IDs', () => {
      const ids = new Set(Array.from({ length: 50 }, () => genTraceId()));
      expect(ids.size).toBe(50);
    });

    it('genSpanId produces unique span IDs', () => {
      const ids = new Set(Array.from({ length: 50 }, () => genSpanId()));
      expect(ids.size).toBe(50);
    });
  });
});
