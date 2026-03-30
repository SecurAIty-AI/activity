/**
 * Integration tests for API routes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, server } from '../src/index';
import http from 'http';

// Use a different port for tests
const TEST_PORT = 3499;
let testServer: http.Server;

function request(path: string, options: RequestInit = {}): Promise<{ status: number; data: any }> {
  return fetch(`http://localhost:${TEST_PORT}${path}`, options)
    .then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
}

describe('API Routes', () => {
  beforeAll(async () => {
    // Close default server if running, start on test port
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // If not listening, resolve immediately
      setTimeout(resolve, 100);
    });

    testServer = app.listen(TEST_PORT);
    await new Promise<void>((resolve) => {
      testServer.on('listening', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
  });

  // ── Health ──────────────────────────────────────────────────

  it('GET /api/health returns ok', async () => {
    const { status, data } = await request('/api/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.app).toBe('Activity by SecurAIty');
    expect(data).toHaveProperty('uptime');
  });

  // ── Activity ────────────────────────────────────────────────

  it('GET /api/activity returns events', async () => {
    const { status, data } = await request('/api/activity');
    expect(status).toBe(200);
    expect(data).toHaveProperty('events');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.events)).toBe(true);
  });

  it('GET /api/activity?limit=5 limits results', async () => {
    const { status, data } = await request('/api/activity?limit=5');
    expect(status).toBe(200);
    expect(data.events.length).toBeLessThanOrEqual(5);
  });

  // ── Agents ──────────────────────────────────────────────────

  it('GET /api/agents returns agent list', async () => {
    const { status, data } = await request('/api/agents');
    expect(status).toBe(200);
    expect(data).toHaveProperty('agents');
    expect(data).toHaveProperty('total');
  });

  // ── Stats ───────────────────────────────────────────────────

  it('GET /api/stats returns stats', async () => {
    const { status, data } = await request('/api/stats');
    expect(status).toBe(200);
    expect(data).toHaveProperty('totalEvents');
    expect(data).toHaveProperty('totalAgents');
  });

  // ── Sessions ────────────────────────────────────────────────

  it('GET /api/sessions returns session list', async () => {
    const { status, data } = await request('/api/sessions');
    expect(status).toBe(200);
    expect(data).toHaveProperty('sessions');
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it('GET /api/sessions/active returns active sessions', async () => {
    const { status, data } = await request('/api/sessions/active');
    expect(status).toBe(200);
    expect(data).toHaveProperty('sessions');
  });

  it('GET /api/sessions/:id returns 404 for unknown', async () => {
    const { status } = await request('/api/sessions/nonexistent');
    expect(status).toBe(404);
  });

  // ── Events (persisted) ─────────────────────────────────────

  it('GET /api/events returns persisted events', async () => {
    const { status, data } = await request('/api/events');
    expect(status).toBe(200);
    expect(data).toHaveProperty('events');
    expect(data).toHaveProperty('total');
  });

  // ── Alerts ──────────────────────────────────────────────────

  it('GET /api/alerts returns alerts', async () => {
    const { status, data } = await request('/api/alerts');
    expect(status).toBe(200);
    expect(data).toHaveProperty('alerts');
  });

  // ── DB Stats ────────────────────────────────────────────────

  it('GET /api/db-stats returns database stats', async () => {
    const { status, data } = await request('/api/db-stats');
    expect(status).toBe(200);
    expect(data).toHaveProperty('totalSessions');
    expect(data).toHaveProperty('totalEvents');
  });

  // ── Setup ───────────────────────────────────────────────────

  it('GET /api/setup/status returns setup status', async () => {
    const { status, data } = await request('/api/setup/status');
    expect(status).toBe(200);
    expect(data).toHaveProperty('configured');
    expect(data).toHaveProperty('proxyUrl');
    expect(data).toHaveProperty('platform');
  });

  // ── Proxy Endpoints ─────────────────────────────────────────

  it('GET /proxy/agents returns proxy agents', async () => {
    const { status, data } = await request('/proxy/agents');
    expect(status).toBe(200);
    expect(data).toHaveProperty('agents');
  });

  it('GET /proxy/stats returns proxy stats', async () => {
    const { status, data } = await request('/proxy/stats');
    expect(status).toBe(200);
    expect(data).toHaveProperty('totalEvents');
  });
});
