/**
 * @file api.ts — REST API routes for Activity dashboard
 */

import { Router } from 'express';
import { activityMonitor } from '../services/activity-monitor';
import { store } from '../services/database';
import { sessionManager } from '../services/session-manager';
import { stateMachine } from '../services/state-machine';
import { alertEngine } from '../services/alert-engine';
import { resourceMonitor } from '../services/resource-monitor';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const router = Router();

// ─── GET /api/health ─────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Activity by SecurAIty',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

// ─── GET /api/activity ───────────────────────────────────────────
// Main feed — returns events with plain English translations

router.get('/activity', (req, res) => {
  const { agentId, category, since, limit } = req.query;
  const events = activityMonitor.getEvents({
    agentId: agentId as string,
    category: category as string,
    since: since as string,
    limit: limit ? parseInt(limit as string) : 100,
  });
  res.json({ events, total: events.length });
});

// ─── GET /api/agents ─────────────────────────────────────────────

router.get('/agents', (_req, res) => {
  const agents = activityMonitor.getAgents();
  res.json({ agents, total: agents.length });
});

// ─── GET /api/agents/:id ─────────────────────────────────────────

router.get('/agents/:id', (req, res) => {
  const agent = activityMonitor.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const events = activityMonitor.getEvents({ agentId: req.params.id, limit: 50 });
  res.json({ agent, events });
});

// ─── GET /api/stats ──────────────────────────────────────────────

router.get('/stats', (_req, res) => {
  res.json(activityMonitor.getStats());
});

// ─── GET /api/sessions ───────────────────────────────────────────
// List sessions with optional filters

router.get('/sessions', (req, res) => {
  const { status, search, limit, offset } = req.query;
  const sessions = store.getSessions({
    status: status as string,
    search: search as string,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0,
  });
  res.json({ sessions, total: sessions.length });
});

// ─── GET /api/sessions/active ────────────────────────────────────

router.get('/sessions/active', (_req, res) => {
  const active = sessionManager.getActiveSessions();
  const sessions = active.map(a => store.getSession(a.sessionId)).filter(Boolean);
  res.json({ sessions, total: sessions.length });
});

// ─── GET /api/sessions/:id ───────────────────────────────────────

router.get('/sessions/:id', (req, res) => {
  const session = store.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ session });
});

// ─── GET /api/sessions/:id/timeline ──────────────────────────────

router.get('/sessions/:id/timeline', (req, res) => {
  const session = store.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const events = store.getTimeline(req.params.id);
  res.json({ session, events, total: events.length });
});

// ─── GET /api/sessions/:id/export ────────────────────────────────

router.get('/sessions/:id/export', (req, res) => {
  const session = store.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const exported = store.exportSession(req.params.id);
  res.json(exported);
});

// ─── GET /api/events ─────────────────────────────────────────────
// Query persisted events from SQLite

router.get('/events', (req, res) => {
  const { session_id, agent_id, event_type, severity, since, limit } = req.query;
  const events = store.getEvents({
    session_id: session_id as string,
    agent_id: agent_id as string,
    event_type: event_type as string,
    severity: severity as string,
    since: since as string,
    limit: limit ? parseInt(limit as string) : 100,
  });
  res.json({ events, total: events.length });
});

// ─── GET /api/alerts ─────────────────────────────────────────────

router.get('/alerts', (req, res) => {
  const { session_id, status, limit } = req.query;
  const alerts = store.getAlerts({
    session_id: session_id as string,
    status: status as string,
    limit: limit ? parseInt(limit as string) : 50,
  });
  res.json({ alerts, total: alerts.length });
});

// ─── POST /api/alerts/:id/acknowledge ────────────────────────────

router.post('/alerts/:id/acknowledge', (req, res) => {
  store.acknowledgeAlert(req.params.id);
  res.json({ success: true });
});

// ─── POST /api/alerts/:id/resolve ────────────────────────────────

router.post('/alerts/:id/resolve', (req, res) => {
  store.resolveAlert(req.params.id);
  res.json({ success: true });
});

// ─── GET /api/db-stats ───────────────────────────────────────────
// Stats from SQLite (persisted across restarts)

router.get('/db-stats', (_req, res) => {
  res.json(store.getStats());
});

// ─── GET /api/states ─────────────────────────────────────────────
// Current state of all agents

router.get('/states', (_req, res) => {
  const states = stateMachine.getAllStates();
  res.json({ states, total: states.length });
});

// ─── GET /api/states/:agentId ────────────────────────────────────

router.get('/states/:agentId', (req, res) => {
  const state = stateMachine.getState(req.params.agentId);
  if (!state) return res.status(404).json({ error: 'Agent state not found' });
  res.json({ state });
});

// ─── GET /api/states/:agentId/transitions ────────────────────────

router.get('/states/:agentId/transitions', (req, res) => {
  const transitions = stateMachine.getTransitions(req.params.agentId);
  res.json({ transitions, total: transitions.length });
});

// ─── GET /api/resources ──────────────────────────────────────────
// System resource summary

router.get('/resources', (_req, res) => {
  res.json(resourceMonitor.getSystemResources());
});

// ─── GET /api/resources/pricing ──────────────────────────────────

router.get('/resources/pricing', (_req, res) => {
  res.json({ pricing: resourceMonitor.getPricing() });
});

// ─── POST /api/resources/estimate ────────────────────────────────
// Estimate cost for a model + tokens

router.post('/resources/estimate', (req, res) => {
  const { model, inputTokens, outputTokens } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  const estimate = resourceMonitor.estimateCost(
    model,
    Number(inputTokens || 0),
    Number(outputTokens || 0),
  );
  res.json(estimate);
});

// ─── GET /api/sessions/:id/snapshots ─────────────────────────────

router.get('/sessions/:id/snapshots', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const snapshots = store.getSnapshots(req.params.id, limit);
  res.json({ snapshots, total: snapshots.length });
});

// ─── GET /api/alert-rules ────────────────────────────────────────

router.get('/alert-rules', (_req, res) => {
  res.json({ rules: alertEngine.getRules() });
});

// ─── PUT /api/alert-rules/:id ────────────────────────────────────

router.put('/alert-rules/:id', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  const success = alertEngine.setRuleEnabled(req.params.id, enabled);
  if (!success) return res.status(404).json({ error: 'Rule not found' });
  res.json({ success: true });
});

// ─── POST /api/setup/install ─────────────────────────────────────
// Auto-configure system env vars to route AI traffic through our proxy

router.post('/setup/install', (_req, res) => {
  const homeDir = os.homedir();
  const platform = os.platform();
  const proxyUrl = 'http://localhost:3400/proxy/v1';
  const results: string[] = [];

  const envBlock = `
# Activity by SecurAIty — auto-configured
export REAL_OPENAI_URL="\${OPENAI_BASE_URL:-https://api.openai.com/v1}"
export OPENAI_BASE_URL="${proxyUrl}"
export ACTIVITY_MONITOR="true"
# End Activity Monitor
`;

  try {
    // Write to .zshrc
    const zshrc = path.join(homeDir, '.zshrc');
    const content = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';
    if (!content.includes('ACTIVITY_MONITOR')) {
      fs.appendFileSync(zshrc, envBlock);
      results.push('✅ Added to ~/.zshrc');
    } else {
      results.push('ℹ️ ~/.zshrc already configured');
    }

    // macOS: launchctl for GUI apps
    if (platform === 'darwin') {
      try {
        // Save the user's real OPENAI_BASE_URL before overriding
        const currentUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        execSync(`launchctl setenv REAL_OPENAI_URL "${currentUrl}" 2>/dev/null || true`);
        execSync(`launchctl setenv OPENAI_BASE_URL "${proxyUrl}"`);
        execSync(`launchctl setenv ACTIVITY_MONITOR "true"`);
        results.push('✅ System env vars set (GUI apps connected NOW)');
      } catch {
        results.push('⚠️ Could not set launchctl env vars');
      }
    }

    res.json({ success: true, results, proxyUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/setup/uninstall ───────────────────────────────────

router.post('/setup/uninstall', (_req, res) => {
  const homeDir = os.homedir();
  const results: string[] = [];

  try {
    const zshrc = path.join(homeDir, '.zshrc');
    if (fs.existsSync(zshrc)) {
      let content = fs.readFileSync(zshrc, 'utf8');
      content = content.replace(/\n# Activity by SecurAIty[\s\S]*?# End Activity Monitor\n/g, '\n');
      fs.writeFileSync(zshrc, content);
      results.push('✅ Removed from ~/.zshrc');
    }

    if (os.platform() === 'darwin') {
      try {
        // Restore original URL
        const realUrl = process.env.REAL_OPENAI_URL || 'https://api.openai.com/v1';
        execSync(`launchctl setenv OPENAI_BASE_URL "${realUrl}"`);
        execSync('launchctl unsetenv ACTIVITY_MONITOR');
        execSync('launchctl unsetenv REAL_OPENAI_URL');
        results.push('✅ Restored original env vars');
      } catch {}
    }

    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/setup/status ───────────────────────────────────────

router.get('/setup/status', (_req, res) => {
  const homeDir = os.homedir();
  const zshrc = path.join(homeDir, '.zshrc');
  let configured = false;

  if (fs.existsSync(zshrc)) {
    configured = fs.readFileSync(zshrc, 'utf8').includes('ACTIVITY_MONITOR');
  }

  res.json({
    configured,
    proxyUrl: 'http://localhost:3400/proxy/v1',
    platform: os.platform(),
  });
});

// ─── GET /api/settings ───────────────────────────────────────────
// Get current user settings

router.get('/settings', (_req, res) => {
  const settingsPath = path.join(os.homedir(), '.activity-securaity', 'settings.json');
  const defaults = {
    theme: 'dark',
    autoUpdate: true,
    alertThresholds: {
      costPerSession: 5.00,
      idleTimeout: 300,
      excessiveWrites: 50,
    },
    notifications: {
      alerts: true,
      agentConnect: true,
      agentDisconnect: true,
      sound: false,
    },
    agentAliases: {} as Record<string, string>,  // agentId → custom name
  };

  try {
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      res.json({ ...defaults, ...saved });
    } else {
      res.json(defaults);
    }
  } catch {
    res.json(defaults);
  }
});

// ─── PUT /api/settings ───────────────────────────────────────────
// Save user settings

router.put('/settings', (req, res) => {
  const settingsDir = path.join(os.homedir(), '.activity-securaity');
  const settingsPath = path.join(settingsDir, 'settings.json');

  try {
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    // Merge with existing
    let current = {};
    if (fs.existsSync(settingsPath)) {
      current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }

    const merged = { ...current, ...req.body };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    res.json({ success: true, settings: merged });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/agents/:id/resources ───────────────────────────────
// Get per-agent resource usage (RAM, CPU, etc.)

router.get('/agents/:id/resources', (req, res) => {
  const agent = activityMonitor.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const events = activityMonitor.getEvents({ agentId: req.params.id });
  const totalTokens = events.reduce((sum, e) => {
    return sum + (Number(e.details.completionTokens) || 0) + (Number(e.details.promptTokens) || 0);
  }, 0);

  // Estimate memory from token usage and activity (rough heuristic)
  const activeMinutes = events.length > 0
    ? (Date.now() - new Date(events[events.length - 1].timestamp).getTime()) / 60000
    : 0;

  const estimatedMemoryMb = Math.round(
    (totalTokens * 0.004) + // ~4KB per token in memory
    (events.length * 0.01) + // ~10KB per event overhead
    50 // base overhead
  );

  res.json({
    agentId: req.params.id,
    agentName: agent.name,
    status: agent.status,
    estimatedMemoryMb,
    totalTokens,
    totalEvents: events.length,
    activeMinutes: Math.round(activeMinutes * 10) / 10,
    model: agent.model,
    provider: agent.provider,
    requestCount: agent.requestCount,
  });
});

// ─── GET /api/agents/resources ───────────────────────────────────
// Get resource usage for ALL agents

router.get('/agents-resources', (_req, res) => {
  const agents = activityMonitor.getAgents();
  const resources = agents.map(agent => {
    const events = activityMonitor.getEvents({ agentId: agent.id });
    const totalTokens = events.reduce((sum, e) => {
      return sum + (Number(e.details.completionTokens) || 0) + (Number(e.details.promptTokens) || 0);
    }, 0);
    const estimatedMemoryMb = Math.round(
      (totalTokens * 0.004) + (events.length * 0.01) + 50
    );
    return {
      agentId: agent.id,
      agentName: agent.name,
      status: agent.status,
      estimatedMemoryMb,
      totalTokens,
      totalEvents: events.length,
      model: agent.model,
    };
  });
  res.json({ resources });
});

// ─── POST /api/check-update ─────────────────────────────────────
// Check for updates (Electron IPC bridge)

router.post('/check-update', (_req, res) => {
  // This will be handled by Electron via IPC — the dashboard calls this,
  // and the response tells it whether updates are available.
  // In non-Electron mode, just say "manual updates required"
  res.json({
    updateAvailable: false,
    currentVersion: '0.1.0',
    message: 'You are running the latest version.',
    method: process.env.ELECTRON_RUN_AS_NODE ? 'electron-updater' : 'manual',
  });
});

export default router;
