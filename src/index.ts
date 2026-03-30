/**
 * @file index.ts — Activity by SecurAIty
 * @description See what your AI agents are doing — in plain English.
 * Standalone activity monitor. Intercepts AI API calls, translates them
 * to plain English, and streams everything to a real-time dashboard.
 *
 * Port: 3400
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { proxyRouter } from './routes/proxy';
import apiRouter from './routes/api';
import { eventBus } from './services/event-bus';
import { activityMonitor } from './services/activity-monitor';
import { store } from './services/database';
import { sessionManager } from './services/session-manager';

const app = express();
const PORT = parseInt(process.env.PORT || '3400');

// ─── Middleware ───────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Routes ──────────────────────────────────────────────────────

app.use('/api', apiRouter);
app.use('/proxy', proxyRouter);

// ─── Serve dashboard (static HTML) ──────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── HTTP + WebSocket Server ─────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected dashboard clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Dashboard connected (${clients.size} clients)`);

  // Send current state on connect
  ws.send(JSON.stringify({
    type: 'init',
    agents: activityMonitor.getAgents(),
    recentEvents: activityMonitor.getEvents({ limit: 50 }),
    stats: activityMonitor.getStats(),
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Dashboard disconnected (${clients.size} clients)`);
  });
});

// ─── Broadcast events to all dashboard clients ──────────────────

eventBus.on('activity', (event) => {
  const msg = JSON.stringify({ type: 'activity', event });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
});

eventBus.on('agent:new', (agent) => {
  const msg = JSON.stringify({ type: 'agent:new', agent });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
});

eventBus.on('agent:idle', (agent) => {
  const msg = JSON.stringify({ type: 'agent:idle', agent });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
});

// ─── Demo Seed (generates sample activity to see the UI working) ─

function seedDemoData() {
  const demoAgent = { agentId: 'demo-cursor-01', agentName: 'Cursor' };

  const demoEvents = [
    { type: 'llm:request' as const, summary: 'Asking Claude about React hooks', details: { model: 'claude-sonnet-4-20250514', provider: 'anthropic', messageCount: 3, lastUserMessage: 'How do I use useEffect with async functions?' } },
    { type: 'llm:response' as const, summary: 'Claude responded about React hooks', details: { model: 'claude-sonnet-4-20250514', latencyMs: 1200, completionTokens: 450, responsePreview: 'To use useEffect with async functions, create an async function inside the effect and call it...' } },
    { type: 'file:read' as const, summary: 'Reading App.tsx', details: { path: '/Users/dev/myapp/src/App.tsx', filename: 'App.tsx' } },
    { type: 'file:write' as const, summary: 'Editing App.tsx', details: { path: '/Users/dev/myapp/src/App.tsx', filename: 'App.tsx', size: 2048 } },
    { type: 'process:exec' as const, summary: 'Running npm install', details: { command: 'npm install react-query' } },
    { type: 'tool:call' as const, summary: 'Using web search', details: { tool: 'web_search', args: 'React Query v5 migration guide' } },
    { type: 'file:create' as const, summary: 'Created useData.ts', details: { path: '/Users/dev/myapp/src/hooks/useData.ts', filename: 'useData.ts' } },
    { type: 'thought:reasoning' as const, summary: 'Thinking about architecture', details: { content: 'The user wants a custom hook for data fetching. I should use React Query for caching and automatic refetching...' } },
    { type: 'network:outbound' as const, summary: 'Fetching npm package info', details: { domain: 'registry.npmjs.org', url: 'https://registry.npmjs.org/react-query' } },
    { type: 'process:exec' as const, summary: 'Running tests', details: { command: 'npx vitest run src/hooks/useData.test.ts' } },
    { type: 'file:write' as const, summary: 'Updating package.json', details: { path: '/Users/dev/myapp/package.json', filename: 'package.json', size: 512 } },
    { type: 'llm:request' as const, summary: 'Asking about error handling', details: { model: 'gpt-4o', provider: 'openai', messageCount: 5, lastUserMessage: 'Add proper error boundaries to the component' } },
    { type: 'llm:response' as const, summary: 'GPT-4o responded about error handling', details: { model: 'gpt-4o', latencyMs: 800, completionTokens: 320, responsePreview: 'You should wrap your component with an ErrorBoundary class component that catches render errors...' } },
  ];

  // Stagger events over time to look realistic
  demoEvents.forEach((evt, i) => {
    setTimeout(() => {
      activityMonitor.record({ ...demoAgent, ...evt });
    }, i * 600); // one every 600ms
  });

  // Also add a second agent
  setTimeout(() => {
    activityMonitor.record({
      agentId: 'demo-claude-02',
      agentName: 'Claude Desktop',
      type: 'llm:request',
      summary: 'Writing a blog post',
      details: { model: 'claude-sonnet-4-20250514', provider: 'anthropic', messageCount: 1, lastUserMessage: 'Write a blog post about TypeScript best practices' },
    });
  }, 3000);

  setTimeout(() => {
    activityMonitor.record({
      agentId: 'demo-claude-02',
      agentName: 'Claude Desktop',
      type: 'llm:response',
      summary: 'Blog post generated',
      details: { model: 'claude-sonnet-4-20250514', latencyMs: 3200, completionTokens: 1500, responsePreview: '# TypeScript Best Practices in 2026\n\nTypeScript has evolved significantly...' },
    });
  }, 5000);
}

// ─── Start Server ────────────────────────────────────────────────

// ─── Graceful Shutdown ───────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Close active sessions
  const activeSessions = sessionManager.getActiveSessions();
  for (const { sessionId } of activeSessions) {
    sessionManager.endSession(sessionId, 'completed');
  }

  // Close all WebSocket connections
  for (const ws of clients) {
    ws.close(1001, 'Server shutting down');
  }
  clients.clear();

  // Close server
  server.close(() => {
    // Close database
    store.close();
    console.log('[Shutdown] Clean exit.');
    process.exit(0);
  });

  // Force exit after 5s
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Startup Cleanup ────────────────────────────────────────────

// Auto-cleanup old data (30-day retention)
const cleaned = store.cleanup(30);
if (cleaned > 0) {
  console.log(`[Startup] Cleaned up ${cleaned} sessions older than 30 days`);
}

// ─── Start Server ────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          Activity by SecurAIty v0.1.0                ║
║  See what your AI agents are doing — in plain English║
╠══════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                  ║
║  API:        http://localhost:${PORT}/api               ║
║  Proxy:      http://localhost:${PORT}/proxy/v1          ║
║  WebSocket:  ws://localhost:${PORT}/ws                  ║
╠══════════════════════════════════════════════════════╣
║  To connect AI tools:                                ║
║  export OPENAI_BASE_URL=http://localhost:${PORT}/proxy/v1║
╚══════════════════════════════════════════════════════╝
  `);

  // Seed demo data so you can see the UI immediately
  if (process.env.DEMO !== 'false') {
    console.log('[Demo] Generating sample activity...');
    seedDemoData();
  }
});

export { app, server };
