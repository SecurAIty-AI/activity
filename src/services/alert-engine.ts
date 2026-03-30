/**
 * @file alert-engine.ts — Configurable alert rules for suspicious activity.
 * Flags noteworthy events WITHOUT blocking them — this is monitoring, not security enforcement.
 */

import { store } from './database';
import { eventBus } from './event-bus';
import { genId, type Alert, type AlertType, type Severity } from '../schema';

// ─── Built-in Alert Rules ────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  description: string;
  alertType: AlertType;
  severity: Severity;
  enabled: boolean;
  /** Check function — returns alert message or null (no alert) */
  check: (event: AlertEventInput) => string | null;
}

export interface AlertEventInput {
  eventType: string;
  summary: string;
  metadata: Record<string, unknown>;
  agentId: string;
  agentName: string;
  sessionId: string;
}

const SENSITIVE_PATHS = [
  '/.ssh/', '/id_rsa', '/id_ed25519', '/.env', '/.aws/', '/credentials',
  '/.gnupg/', '/.gitconfig', '/shadow', '/passwd', '/authorized_keys',
  '/.npmrc', '/.pypirc', '/keychain', '/wallet.dat',
];

const SUSPICIOUS_DOMAINS = [
  'pastebin.com', 'transfer.sh', 'ngrok.io', 'serveo.net',
  'burpcollaborator.net', 'webhook.site', 'requestbin.com',
  'canarytokens.com',
];

const builtInRules: AlertRule[] = [
  {
    id: 'sensitive-file',
    name: 'Sensitive File Access',
    description: 'Agent accessed a sensitive file (SSH keys, credentials, env files)',
    alertType: 'sensitive_file_access',
    severity: 'warn',
    enabled: true,
    check: (e) => {
      const path = String(e.metadata.path || e.metadata.filename || '').toLowerCase();
      if (!path) return null;
      const match = SENSITIVE_PATHS.find(s => path.includes(s));
      if (match) return `${e.agentName} accessed a sensitive file: ${path}`;
      return null;
    },
  },
  {
    id: 'unexpected-domain',
    name: 'Unexpected Network Domain',
    description: 'Agent connected to a suspicious or data exfiltration domain',
    alertType: 'unexpected_domain',
    severity: 'warn',
    enabled: true,
    check: (e) => {
      const domain = String(e.metadata.domain || e.metadata.host || e.metadata.url || '').toLowerCase();
      if (!domain) return null;
      const match = SUSPICIOUS_DOMAINS.find(s => domain.includes(s));
      if (match) return `${e.agentName} connected to suspicious domain: ${domain}`;
      return null;
    },
  },
  {
    id: 'excessive-writes',
    name: 'Excessive File Writes',
    description: 'Agent wrote to an unusually large number of files',
    alertType: 'excessive_writes',
    severity: 'info',
    enabled: true,
    check: (e) => {
      // This is tracked externally by the engine, not per-event
      return null;
    },
  },
  {
    id: 'idle-timeout',
    name: 'Agent Idle Timeout',
    description: 'Agent has been idle for too long',
    alertType: 'idle_timeout',
    severity: 'info',
    enabled: true,
    check: (e) => {
      // Handled by state machine
      return null;
    },
  },
  {
    id: 'high-cost',
    name: 'High Cost Session',
    description: 'Session cost exceeded threshold',
    alertType: 'high_cost',
    severity: 'warn',
    enabled: true,
    check: (e) => {
      const cost = Number(e.metadata.totalCost || 0);
      if (cost > 1.0) return `Session cost exceeded $1.00 (current: $${cost.toFixed(2)})`;
      return null;
    },
  },
  {
    id: 'browser-automation',
    name: 'Browser Automation Detected',
    description: 'Agent is controlling a browser',
    alertType: 'browser_automation',
    severity: 'info',
    enabled: true,
    check: (e) => {
      if (e.eventType.startsWith('browser.')) {
        return `${e.agentName} is automating a browser`;
      }
      return null;
    },
  },
  {
    id: 'outside-folder',
    name: 'Activity Outside Allowed Folder',
    description: 'Agent accessed files outside its expected workspace',
    alertType: 'outside_allowed_folder',
    severity: 'warn',
    enabled: true,
    check: (e) => {
      const path = String(e.metadata.path || '');
      if (!path) return null;
      // Flag if agent accesses system dirs
      if (path.startsWith('/etc/') || path.startsWith('/System/') || path.startsWith('/usr/')) {
        return `${e.agentName} accessed system path: ${path}`;
      }
      return null;
    },
  },
];

// ─── Alert Engine ────────────────────────────────────────────────

class AlertEngine {
  private rules: AlertRule[] = [...builtInRules];
  private writeCounters: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly WRITE_THRESHOLD = 50; // 50 writes in 5 min
  private readonly WRITE_WINDOW_MS = 5 * 60_000;

  /**
   * Evaluate an event against all rules. Creates alerts for matches.
   */
  evaluate(input: AlertEventInput): Alert[] {
    const alerts: Alert[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const message = rule.check(input);
      if (message) {
        const alert: Alert = {
          id: genId('alert'),
          session_id: input.sessionId,
          alert_type: rule.alertType,
          severity: rule.severity,
          message,
          status: 'active',
          created_at: new Date().toISOString(),
          metadata: {
            ruleId: rule.id,
            agentId: input.agentId,
            eventType: input.eventType,
          },
        };

        try {
          store.createAlert(alert);
        } catch { /* session may not exist */ }
        alerts.push(alert);
        eventBus.emit('alert:created', { alert, ruleId: rule.id });
      }
    }

    // Track write frequency for excessive-writes rule
    if (input.eventType.includes('write') || input.eventType.includes('create')) {
      this.trackWrite(input);
    }

    return alerts;
  }

  private trackWrite(input: AlertEventInput) {
    const now = Date.now();
    const key = `${input.agentId}:${input.sessionId}`;
    let counter = this.writeCounters.get(key);

    if (!counter || (now - counter.windowStart) > this.WRITE_WINDOW_MS) {
      counter = { count: 0, windowStart: now };
      this.writeCounters.set(key, counter);
    }

    counter.count++;

    if (counter.count === this.WRITE_THRESHOLD) {
      const alert: Alert = {
        id: genId('alert'),
        session_id: input.sessionId,
        alert_type: 'excessive_writes',
        severity: 'warn',
        message: `${input.agentName} has written ${this.WRITE_THRESHOLD}+ files in the last 5 minutes`,
        status: 'active',
        created_at: new Date().toISOString(),
        metadata: { agentId: input.agentId, count: counter.count },
      };

      try {
        store.createAlert(alert);
      } catch { /* session may not exist */ }
      eventBus.emit('alert:created', { alert, ruleId: 'excessive-writes' });
    }
  }

  /**
   * Get all rules (for API/dashboard).
   */
  getRules(): AlertRule[] {
    return this.rules.map(r => ({
      ...r,
      check: undefined as any, // Don't serialize the function
    }));
  }

  /**
   * Enable/disable a rule.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }
}

export const alertEngine = new AlertEngine();
