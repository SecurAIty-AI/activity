/**
 * @file api.ts — REST API routes for Activity dashboard
 */

import { Router } from 'express';
import { activityMonitor } from '../services/activity-monitor';
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

export default router;
