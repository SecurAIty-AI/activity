/**
 * @file database.ts — SQLite Storage Layer
 * @description Local-first persistent storage for all agent activity.
 * Sessions, events, alerts, artifacts — everything stored in a single SQLite file.
 * Supports session history, replay, search, and export.
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { AgentEvent, Session, Alert, Severity } from '../schema';

// ─── Database Path ───────────────────────────────────────────────

const DB_DIR = process.env.ACTIVITY_DB_DIR || path.join(os.homedir(), '.activity-monitor');
const DB_PATH = path.join(DB_DIR, 'activity.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ─── Initialize Database ─────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT 'Unknown Agent',
    model TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL,
    end_time TEXT,
    state TEXT NOT NULL DEFAULT 'initializing',
    final_status TEXT NOT NULL DEFAULT 'running',
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_events INTEGER NOT NULL DEFAULT 0,
    current_task TEXT NOT NULL DEFAULT '',
    last_action TEXT NOT NULL DEFAULT '',
    progress_stage INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    state TEXT,
    summary TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '❓',
    color TEXT NOT NULL DEFAULT 'gray',
    duration_ms INTEGER,
    severity TEXT NOT NULL DEFAULT 'info',
    risk_level INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path_or_url TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS resource_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    cpu_percent REAL NOT NULL DEFAULT 0,
    memory_mb REAL NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    requests_per_min REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    active_tools TEXT NOT NULL DEFAULT '[]',
    network_wait_ms INTEGER NOT NULL DEFAULT 0,
    file_reads INTEGER NOT NULL DEFAULT 0,
    file_writes INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Indexes for fast queries
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
  CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
  CREATE INDEX IF NOT EXISTS idx_snapshots_session ON resource_snapshots(session_id);
`);

// ─── Prepared Statements ─────────────────────────────────────────

const insertSession = db.prepare(`
  INSERT INTO sessions (id, title, agent_id, agent_name, model, start_time, state, final_status, current_task, metadata)
  VALUES (@id, @title, @agent_id, @agent_name, @model, @start_time, @state, @final_status, @current_task, @metadata)
`);

const updateSession = db.prepare(`
  UPDATE sessions SET
    state = @state,
    final_status = @final_status,
    end_time = @end_time,
    total_duration_ms = @total_duration_ms,
    total_cost = @total_cost,
    total_tokens = @total_tokens,
    total_events = @total_events,
    current_task = @current_task,
    last_action = @last_action,
    progress_stage = @progress_stage,
    progress_total = @progress_total,
    model = @model
  WHERE id = @id
`);

const insertEvent = db.prepare(`
  INSERT INTO events (id, session_id, agent_id, trace_id, span_id, parent_span_id, timestamp, event_type, state, summary, icon, color, duration_ms, severity, risk_level, metadata)
  VALUES (@id, @session_id, @agent_id, @trace_id, @span_id, @parent_span_id, @timestamp, @event_type, @state, @summary, @icon, @color, @duration_ms, @severity, @risk_level, @metadata)
`);

const insertAlert = db.prepare(`
  INSERT INTO alerts (id, session_id, alert_type, severity, message, status, created_at, metadata)
  VALUES (@id, @session_id, @alert_type, @severity, @message, @status, @created_at, @metadata)
`);

const insertSnapshot = db.prepare(`
  INSERT INTO resource_snapshots (session_id, timestamp, cpu_percent, memory_mb, tokens, requests_per_min, cost, active_tools, network_wait_ms, file_reads, file_writes, retry_count)
  VALUES (@session_id, @timestamp, @cpu_percent, @memory_mb, @tokens, @requests_per_min, @cost, @active_tools, @network_wait_ms, @file_reads, @file_writes, @retry_count)
`);

// ─── Public API ──────────────────────────────────────────────────

export const store = {
  // ── Sessions ────────────────────────────────────────────────

  createSession(session: Partial<Session> & { id: string; agent_id: string }): void {
    insertSession.run({
      id: session.id,
      title: session.title || '',
      agent_id: session.agent_id,
      agent_name: session.agent_name || 'Unknown Agent',
      model: session.model || '',
      start_time: session.start_time || new Date().toISOString(),
      state: session.state || 'initializing',
      final_status: session.final_status || 'running',
      current_task: session.current_task || '',
      metadata: JSON.stringify(session.metadata || {}),
    });
  },

  updateSession(session: Partial<Session> & { id: string }): void {
    const existing = this.getSession(session.id);
    if (!existing) return;

    updateSession.run({
      id: session.id,
      state: session.state ?? existing.state,
      final_status: session.final_status ?? existing.final_status,
      end_time: session.end_time ?? existing.end_time ?? null,
      total_duration_ms: session.total_duration_ms ?? existing.total_duration_ms,
      total_cost: session.total_cost ?? existing.total_cost,
      total_tokens: session.total_tokens ?? existing.total_tokens,
      total_events: session.total_events ?? existing.total_events,
      current_task: session.current_task ?? existing.current_task,
      last_action: session.last_action ?? existing.last_action,
      progress_stage: session.progress_stage ?? existing.progress_stage,
      progress_total: session.progress_total ?? existing.progress_total,
      model: session.model ?? existing.model,
    });
  },

  getSession(id: string): Session | null {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata || '{}') };
  },

  getSessions(options: {
    status?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Session[] {
    let sql = 'SELECT * FROM sessions';
    const params: any[] = [];
    const where: string[] = [];

    if (options.status) {
      where.push('final_status = ?');
      params.push(options.status);
    }
    if (options.search) {
      where.push('(title LIKE ? OR agent_name LIKE ? OR current_task LIKE ?)');
      const s = `%${options.search}%`;
      params.push(s, s, s);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY start_time DESC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset) { sql += ' OFFSET ?'; params.push(options.offset); }

    return (db.prepare(sql).all(...params) as any[]).map(r => ({
      ...r, metadata: JSON.parse(r.metadata || '{}'),
    }));
  },

  getActiveSessions(): Session[] {
    return this.getSessions({ status: 'running' });
  },

  // ── Events ──────────────────────────────────────────────────

  insertEvent(event: AgentEvent): void {
    insertEvent.run({
      id: event.id,
      session_id: event.session_id,
      agent_id: event.agent_id,
      trace_id: event.trace_id,
      span_id: event.span_id,
      parent_span_id: event.parent_span_id || null,
      timestamp: event.timestamp,
      event_type: event.event_type,
      state: event.state || null,
      summary: event.summary,
      icon: event.icon,
      color: event.color,
      duration_ms: event.duration_ms || null,
      severity: event.severity,
      risk_level: event.risk_level,
      metadata: JSON.stringify(event.metadata || {}),
    });

    // Update session event count
    db.prepare('UPDATE sessions SET total_events = total_events + 1 WHERE id = ?').run(event.session_id);
  },

  getEvents(options: {
    session_id?: string;
    agent_id?: string;
    event_type?: string;
    severity?: string;
    since?: string;
    limit?: number;
  } = {}): AgentEvent[] {
    let sql = 'SELECT * FROM events';
    const params: any[] = [];
    const where: string[] = [];

    if (options.session_id) { where.push('session_id = ?'); params.push(options.session_id); }
    if (options.agent_id) { where.push('agent_id = ?'); params.push(options.agent_id); }
    if (options.event_type) { where.push('event_type = ?'); params.push(options.event_type); }
    if (options.severity) { where.push('severity = ?'); params.push(options.severity); }
    if (options.since) { where.push('timestamp >= ?'); params.push(options.since); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY timestamp DESC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }

    return (db.prepare(sql).all(...params) as any[]).map(r => ({
      ...r, metadata: JSON.parse(r.metadata || '{}'),
    }));
  },

  getTimeline(session_id: string): AgentEvent[] {
    return (db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC').all(session_id) as any[]).map(r => ({
      ...r, metadata: JSON.parse(r.metadata || '{}'),
    }));
  },

  // ── Alerts ──────────────────────────────────────────────────

  createAlert(alert: Alert): void {
    insertAlert.run({
      id: alert.id,
      session_id: alert.session_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      status: alert.status || 'active',
      created_at: alert.created_at || new Date().toISOString(),
      metadata: JSON.stringify(alert.metadata || {}),
    });
  },

  getAlerts(options: { session_id?: string; status?: string; limit?: number } = {}): Alert[] {
    let sql = 'SELECT * FROM alerts';
    const params: any[] = [];
    const where: string[] = [];

    if (options.session_id) { where.push('session_id = ?'); params.push(options.session_id); }
    if (options.status) { where.push('status = ?'); params.push(options.status); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }

    return (db.prepare(sql).all(...params) as any[]).map(r => ({
      ...r, metadata: JSON.parse(r.metadata || '{}'),
    }));
  },

  acknowledgeAlert(id: string): void {
    db.prepare("UPDATE alerts SET status = 'acknowledged' WHERE id = ?").run(id);
  },

  resolveAlert(id: string): void {
    db.prepare("UPDATE alerts SET status = 'resolved' WHERE id = ?").run(id);
  },

  // ── Resource Snapshots ──────────────────────────────────────

  insertSnapshot(snapshot: any): void {
    insertSnapshot.run({
      session_id: snapshot.session_id,
      timestamp: snapshot.timestamp || new Date().toISOString(),
      cpu_percent: snapshot.cpu_percent || 0,
      memory_mb: snapshot.memory_mb || 0,
      tokens: snapshot.tokens || 0,
      requests_per_min: snapshot.requests_per_min || 0,
      cost: snapshot.cost || 0,
      active_tools: JSON.stringify(snapshot.active_tools || []),
      network_wait_ms: snapshot.network_wait_ms || 0,
      file_reads: snapshot.file_reads || 0,
      file_writes: snapshot.file_writes || 0,
      retry_count: snapshot.retry_count || 0,
    });
  },

  getSnapshots(session_id: string, limit = 100): any[] {
    return (db.prepare('SELECT * FROM resource_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?').all(session_id, limit) as any[]).map(r => ({
      ...r, active_tools: JSON.parse(r.active_tools || '[]'),
    }));
  },

  // ── Stats ───────────────────────────────────────────────────

  getStats(): Record<string, any> {
    const now = Date.now();
    const hourAgo = new Date(now - 3600000).toISOString();
    const dayAgo = new Date(now - 86400000).toISOString();

    return {
      totalSessions: (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c,
      activeSessions: (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE final_status = 'running'").get() as any).c,
      totalEvents: (db.prepare('SELECT COUNT(*) as c FROM events').get() as any).c,
      eventsLastHour: (db.prepare('SELECT COUNT(*) as c FROM events WHERE timestamp >= ?').get(hourAgo) as any).c,
      eventsLastDay: (db.prepare('SELECT COUNT(*) as c FROM events WHERE timestamp >= ?').get(dayAgo) as any).c,
      activeAlerts: (db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status = 'active'").get() as any).c,
      totalTokens: (db.prepare('SELECT COALESCE(SUM(total_tokens), 0) as s FROM sessions').get() as any).s,
      totalCost: (db.prepare('SELECT COALESCE(SUM(total_cost), 0) as s FROM sessions').get() as any).s,
    };
  },

  // ── Cleanup ─────────────────────────────────────────────────

  cleanup(retentionDays = 30): number {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const sessions = db.prepare('SELECT id FROM sessions WHERE start_time < ?').all(cutoff) as any[];
    for (const s of sessions) {
      db.prepare('DELETE FROM events WHERE session_id = ?').run(s.id);
      db.prepare('DELETE FROM alerts WHERE session_id = ?').run(s.id);
      db.prepare('DELETE FROM artifacts WHERE session_id = ?').run(s.id);
      db.prepare('DELETE FROM resource_snapshots WHERE session_id = ?').run(s.id);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
    }
    return sessions.length;
  },

  // ── Export ──────────────────────────────────────────────────

  exportSession(session_id: string): Record<string, any> {
    return {
      session: this.getSession(session_id),
      events: this.getTimeline(session_id),
      alerts: this.getAlerts({ session_id }),
      snapshots: this.getSnapshots(session_id, 1000),
    };
  },

  close(): void {
    db.close();
  },
};

export default store;
