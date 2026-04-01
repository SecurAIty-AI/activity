/**
 * @file activity-monitor.ts — Core Activity Monitor
 * @description Tracks everything AI agents do on the machine.
 * Simplified from SecurAIty's brain-monitor — no security rules, no permissions,
 * no threat detection. Just pure activity tracking with plain English translations.
 */

import { eventBus } from './event-bus';
import { translateToPlainEnglish, type ActivityType } from './plain-english';

// ─── Types ───────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  type: ActivityType;
  category: 'llm' | 'file' | 'process' | 'network' | 'tool' | 'thought' | 'idle' | 'error';
  /** Raw technical summary */
  summary: string;
  /** Plain English translation */
  plain: string;
  /** Short UI label */
  label: string;
  /** Emoji icon */
  icon: string;
  /** UI color bucket */
  color: string;
  /** Full details payload */
  details: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  status: 'active' | 'idle' | 'offline';
  /** What the agent is doing right now in plain English */
  currentActivity: string;
  requestCount: number;
  model: string;
  provider: string;
  userAgent: string;
}

// ─── Activity Monitor ────────────────────────────────────────────

class ActivityMonitor {
  private events: ActivityEvent[] = [];
  private agents: Map<string, Agent> = new Map();
  private maxEvents = 10000;
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly IDLE_TIMEOUT = 30000; // 30s without activity = idle

  // ─── Record Activity ────────────────────────────────────────

  record(input: {
    agentId: string;
    agentName: string;
    type: ActivityType;
    summary: string;
    details: Record<string, unknown>;
  }): ActivityEvent {
    // Translate to plain English
    const translation = translateToPlainEnglish({
      type: input.type,
      details: input.details,
      agentName: input.agentName,
    });

    const category = input.type.split(':')[0] as ActivityEvent['category'];

    const event: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      agentId: input.agentId,
      agentName: input.agentName,
      type: input.type,
      category,
      summary: input.summary,
      plain: translation.plain,
      label: translation.label,
      icon: translation.icon,
      color: translation.color,
      details: input.details,
    };

    // Store event (ring buffer)
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update agent
    this.touchAgent(input.agentId, input.agentName, event, input.details);

    // Emit for WebSocket broadcast
    eventBus.emit('activity', event);

    return event;
  }

  // ─── Agent Tracking ─────────────────────────────────────────

  private touchAgent(agentId: string, agentName: string, event: ActivityEvent, details: Record<string, unknown>) {
    // If this is a real agent and demo data exists, clear it
    if (!agentId.startsWith('demo-')) {
      const hasDemoAgents = Array.from(this.agents.keys()).some(id => id.startsWith('demo-'));
      if (hasDemoAgents) {
        this.clearDemoData();
      }
    }

    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: agentName,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'active',
        currentActivity: event.plain,
        requestCount: 0,
        model: '',
        provider: '',
        userAgent: '',
      };
      this.agents.set(agentId, agent);
      eventBus.emit('agent:new', agent);
    }

    agent.lastSeen = new Date().toISOString();
    agent.status = 'active';
    agent.currentActivity = event.plain;
    agent.requestCount++;

    if (details.model) agent.model = String(details.model);
    if (details.provider) agent.provider = String(details.provider);
    if (details.userAgent) agent.userAgent = String(details.userAgent);

    // Reset idle timer
    const existingTimer = this.idleTimers.get(agentId);
    if (existingTimer) clearTimeout(existingTimer);

    this.idleTimers.set(agentId, setTimeout(() => {
      const a = this.agents.get(agentId);
      if (a && a.status === 'active') {
        a.status = 'idle';
        a.currentActivity = `${a.name} is idle — waiting for something to do`;
        eventBus.emit('agent:idle', a);
      }
    }, this.IDLE_TIMEOUT));
  }

  // ─── Register/update agent from proxy ───────────────────────

  registerAgent(agentId: string, agentName: string, meta: Partial<Agent>) {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: agentName,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'active',
        currentActivity: 'Just connected',
        requestCount: 0,
        model: '',
        provider: '',
        userAgent: '',
      };
      this.agents.set(agentId, agent);
      eventBus.emit('agent:new', agent);
    }

    Object.assign(agent, meta, { id: agentId, name: agentName });
    agent.lastSeen = new Date().toISOString();
  }

  // ─── Clear Demo Data ─────────────────────────────────────────

  clearDemoData() {
    // Remove all demo events
    this.events = this.events.filter(e => !e.agentId.startsWith('demo-'));

    // Remove demo agents and their idle timers
    for (const [id, _agent] of this.agents) {
      if (id.startsWith('demo-')) {
        const timer = this.idleTimers.get(id);
        if (timer) clearTimeout(timer);
        this.idleTimers.delete(id);
        this.agents.delete(id);
      }
    }

    // Notify dashboard
    eventBus.emit('demo:cleared', {});
  }

  // ─── Queries ────────────────────────────────────────────────

  getEvents(options: {
    agentId?: string;
    category?: string;
    since?: string;
    limit?: number;
  } = {}): ActivityEvent[] {
    let filtered = [...this.events];

    if (options.agentId) filtered = filtered.filter(e => e.agentId === options.agentId);
    if (options.category) filtered = filtered.filter(e => e.category === options.category);
    if (options.since) {
      const ts = new Date(options.since).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= ts);
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (options.limit) filtered = filtered.slice(0, options.limit);
    return filtered;
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getStats() {
    const now = Date.now();
    const lastHour = this.events.filter(e => (now - new Date(e.timestamp).getTime()) < 3600000);
    return {
      totalEvents: this.events.length,
      totalAgents: this.agents.size,
      activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'active').length,
      eventsLastHour: lastHour.length,
      byCategory: {
        llm: this.events.filter(e => e.category === 'llm').length,
        file: this.events.filter(e => e.category === 'file').length,
        process: this.events.filter(e => e.category === 'process').length,
        network: this.events.filter(e => e.category === 'network').length,
        tool: this.events.filter(e => e.category === 'tool').length,
        thought: this.events.filter(e => e.category === 'thought').length,
      },
    };
  }
}

export const activityMonitor = new ActivityMonitor();
