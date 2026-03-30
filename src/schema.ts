/**
 * @file schema.ts — Core Event Schema
 * @description Normalized event types for all AI agent activity.
 * Based on OpenTelemetry trace/span concepts but with our own product language.
 * Every event carries a human-readable summary via the plain English engine.
 */

// ─── Event Types ─────────────────────────────────────────────────

export type EventType =
  // Session lifecycle
  | 'session.started'
  | 'session.ended'
  // Agent state
  | 'agent.state.changed'
  // LLM interactions
  | 'llm.request.started'
  | 'llm.request.completed'
  | 'llm.request.failed'
  // Tool usage
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  // File system
  | 'fs.read'
  | 'fs.write'
  | 'fs.create'
  | 'fs.delete'
  | 'fs.rename'
  // Shell/process
  | 'process.started'
  | 'process.completed'
  | 'process.failed'
  // Browser
  | 'browser.opened'
  | 'browser.navigated'
  | 'browser.clicked'
  | 'browser.closed'
  // Network
  | 'network.request'
  | 'network.response'
  // Human interaction
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  // Idle/activity
  | 'idle.started'
  | 'idle.ended'
  // Errors
  | 'error.raised'
  // System/resource
  | 'resource.snapshot';

// ─── Agent States ────────────────────────────────────────────────

export type AgentState =
  | 'queued'
  | 'initializing'
  | 'planning'
  | 'executing'
  | 'waiting'       // waiting for API/network
  | 'thinking'      // model reasoning
  | 'tool_calling'  // running a tool
  | 'verifying'
  | 'needs_approval'
  | 'completed'
  | 'failed'
  | 'idle'
  | 'stalled'       // no activity for too long
  | 'paused';       // user paused

// ─── Severity Levels ─────────────────────────────────────────────

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

// ─── Core Event ──────────────────────────────────────────────────

export interface AgentEvent {
  id: string;
  session_id: string;
  agent_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  timestamp: string;       // ISO 8601
  event_type: EventType;
  state?: AgentState;
  summary: string;         // plain English
  icon: string;            // emoji
  color: string;           // UI color bucket
  duration_ms?: number;
  severity: Severity;
  risk_level: number;      // 0-100
  metadata: Record<string, unknown>;
}

// ─── Session ─────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  agent_id: string;
  agent_name: string;
  model: string;
  start_time: string;
  end_time?: string;
  state: AgentState;
  final_status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_duration_ms: number;
  total_cost: number;
  total_tokens: number;
  total_events: number;
  current_task: string;
  last_action: string;
  progress_stage: number;     // which stage we're in
  progress_total: number;     // total expected stages (0 = unknown)
  metadata: Record<string, unknown>;
}

// ─── Alert ───────────────────────────────────────────────────────

export type AlertType =
  | 'sensitive_file_access'
  | 'unexpected_domain'
  | 'repeated_retries'
  | 'excessive_writes'
  | 'idle_timeout'
  | 'self_loop'
  | 'browser_automation'
  | 'outside_allowed_folder'
  | 'high_cost'
  | 'stalled_agent';

export interface Alert {
  id: string;
  session_id: string;
  alert_type: AlertType;
  severity: Severity;
  message: string;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
  metadata: Record<string, unknown>;
}

// ─── Resource Snapshot ───────────────────────────────────────────

export interface ResourceSnapshot {
  timestamp: string;
  cpu_percent: number;
  memory_mb: number;
  tokens_this_session: number;
  requests_per_minute: number;
  cost_this_session: number;
  active_tools: string[];
  network_wait_ms: number;
  file_reads: number;
  file_writes: number;
  retry_count: number;
}

// ─── ID Generators ───────────────────────────────────────────────

let eventCounter = 0;
export function genId(prefix: string = 'evt'): string {
  return `${prefix}-${Date.now()}-${(++eventCounter).toString(36)}`;
}

export function genTraceId(): string {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function genSpanId(): string {
  return `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
