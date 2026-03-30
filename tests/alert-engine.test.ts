/**
 * Tests for the alert engine — configurable rules for suspicious activity.
 */

import { describe, it, expect } from 'vitest';
import { alertEngine, type AlertEventInput } from '../src/services/alert-engine';

function makeInput(overrides: Partial<AlertEventInput> = {}): AlertEventInput {
  return {
    eventType: 'fs.read',
    summary: 'Reading a file',
    metadata: {},
    agentId: 'test-agent',
    agentName: 'Test Agent',
    sessionId: 'test-session',
    ...overrides,
  };
}

describe('Alert Engine', () => {
  // ── Sensitive File Detection ────────────────────────────────

  it('detects access to SSH keys', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/Users/dev/.ssh/id_rsa' },
    }));
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].alert_type).toBe('sensitive_file_access');
    expect(alerts[0].message).toContain('.ssh');
  });

  it('detects access to .env files', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/app/.env' },
    }));
    expect(alerts.some(a => a.alert_type === 'sensitive_file_access')).toBe(true);
  });

  it('detects access to AWS credentials', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/Users/dev/.aws/credentials' },
    }));
    expect(alerts.some(a => a.alert_type === 'sensitive_file_access')).toBe(true);
  });

  it('does not alert on normal file access', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/Users/dev/project/src/App.tsx' },
    }));
    expect(alerts.filter(a => a.alert_type === 'sensitive_file_access').length).toBe(0);
  });

  // ── Suspicious Domains ──────────────────────────────────────

  it('detects connection to pastebin', () => {
    const alerts = alertEngine.evaluate(makeInput({
      eventType: 'network.request',
      metadata: { domain: 'pastebin.com' },
    }));
    expect(alerts.some(a => a.alert_type === 'unexpected_domain')).toBe(true);
  });

  it('detects connection to ngrok', () => {
    const alerts = alertEngine.evaluate(makeInput({
      eventType: 'network.request',
      metadata: { domain: 'abc123.ngrok.io' },
    }));
    expect(alerts.some(a => a.alert_type === 'unexpected_domain')).toBe(true);
  });

  it('does not alert on normal domains', () => {
    const alerts = alertEngine.evaluate(makeInput({
      eventType: 'network.request',
      metadata: { domain: 'api.openai.com' },
    }));
    expect(alerts.filter(a => a.alert_type === 'unexpected_domain').length).toBe(0);
  });

  // ── System Path Access ──────────────────────────────────────

  it('detects access to /etc/', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/etc/passwd' },
    }));
    expect(alerts.some(a => a.alert_type === 'outside_allowed_folder')).toBe(true);
  });

  it('detects access to /System/', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/System/Library/something' },
    }));
    expect(alerts.some(a => a.alert_type === 'outside_allowed_folder')).toBe(true);
  });

  // ── Browser Automation ──────────────────────────────────────

  it('detects browser automation', () => {
    const alerts = alertEngine.evaluate(makeInput({
      eventType: 'browser.clicked',
      summary: 'Clicked login button',
    }));
    expect(alerts.some(a => a.alert_type === 'browser_automation')).toBe(true);
  });

  // ── High Cost ───────────────────────────────────────────────

  it('detects high cost sessions', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { totalCost: 2.50 },
    }));
    expect(alerts.some(a => a.alert_type === 'high_cost')).toBe(true);
  });

  it('does not alert on low cost', () => {
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { totalCost: 0.05 },
    }));
    expect(alerts.filter(a => a.alert_type === 'high_cost').length).toBe(0);
  });

  // ── Rule Management ─────────────────────────────────────────

  it('returns all rules', () => {
    const rules = alertEngine.getRules();
    expect(rules.length).toBeGreaterThanOrEqual(7);
    expect(rules[0]).toHaveProperty('id');
    expect(rules[0]).toHaveProperty('name');
    expect(rules[0]).toHaveProperty('enabled');
  });

  it('disables a rule', () => {
    const success = alertEngine.setRuleEnabled('sensitive-file', false);
    expect(success).toBe(true);

    // Should not trigger now
    const alerts = alertEngine.evaluate(makeInput({
      metadata: { path: '/Users/dev/.ssh/id_rsa' },
    }));
    expect(alerts.filter(a => a.alert_type === 'sensitive_file_access').length).toBe(0);

    // Re-enable
    alertEngine.setRuleEnabled('sensitive-file', true);
  });

  it('returns false for unknown rule', () => {
    const success = alertEngine.setRuleEnabled('nonexistent', true);
    expect(success).toBe(false);
  });
});
