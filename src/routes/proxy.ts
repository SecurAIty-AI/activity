/**
 * @file proxy.ts — Transparent LLM API Proxy
 * @description Drop-in replacement for OpenAI/Anthropic APIs.
 * Agents point OPENAI_BASE_URL here — we log everything, translate to plain English,
 * and forward transparently. The agent never knows we're watching.
 *
 * Routes:
 *   POST /proxy/v1/chat/completions  (OpenAI)
 *   POST /proxy/v1/completions       (OpenAI legacy)
 *   POST /proxy/v1/messages          (Anthropic)
 *   GET  /proxy/v1/models            (OpenAI model list)
 *   GET  /proxy/agents               (connected agents)
 *   GET  /proxy/stats                (proxy stats)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { activityMonitor } from '../services/activity-monitor';
import { sessionManager } from '../services/session-manager';
import { stateMachine } from '../services/state-machine';

export const proxyRouter = Router();

// ─── Agent Identification ────────────────────────────────────────

function identifyAgent(req: Request): { id: string; name: string } {
  // 1. Explicit header
  const header = req.headers['x-activity-agent'] as string || req.headers['x-securaity-agent'] as string;
  if (header) {
    return { id: `agent-${crypto.createHash('md5').update(header).digest('hex').slice(0, 8)}`, name: header };
  }

  // 2. Derive from API key + user-agent
  const auth = (req.headers['authorization'] || '').toString().replace('Bearer ', '');
  const ua = (req.headers['user-agent'] || 'unknown').toString().slice(0, 100);
  const fingerprint = `${auth.slice(-8)}:${ua}`;
  const id = `agent-${crypto.createHash('md5').update(fingerprint).digest('hex').slice(0, 8)}`;

  // Name from user-agent
  let name = 'Unknown Agent';
  const lower = ua.toLowerCase();
  if (lower.includes('cursor')) name = 'Cursor';
  else if (lower.includes('vscode') || lower.includes('visual studio')) name = 'VS Code';
  else if (lower.includes('claude-desktop') || lower.includes('claude')) name = 'Claude Desktop';
  else if (lower.includes('copilot')) name = 'GitHub Copilot';
  else if (lower.includes('python')) name = 'Python Script';
  else if (lower.includes('node') || lower.includes('axios') || lower.includes('fetch')) name = 'Node.js App';
  else if (lower.includes('langchain')) name = 'LangChain';
  else if (lower.includes('openai-python')) name = 'OpenAI Python SDK';
  else if (lower.includes('anthropic-python')) name = 'Anthropic Python SDK';
  else if (lower.includes('openclaw')) name = 'OpenClaw';

  return { id, name };
}

// ─── Forward to real AI API ──────────────────────────────────────

const REAL_OPENAI = process.env.REAL_OPENAI_URL || process.env.OPENAI_UPSTREAM_URL || 'https://api.openai.com/v1';
const REAL_ANTHROPIC = process.env.REAL_ANTHROPIC_URL || 'https://api.anthropic.com';

async function forwardRequest(
  req: Request,
  targetUrl: string,
  provider: 'openai' | 'anthropic',
): Promise<{ status: number; data: any; latencyMs: number }> {
  const start = Date.now();

  const headers: Record<string, string> = {};
  // Forward auth headers
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'] as string;
  if (req.headers['x-api-key']) headers['x-api-key'] = req.headers['x-api-key'] as string;
  if (req.headers['anthropic-version']) headers['anthropic-version'] = req.headers['anthropic-version'] as string;
  headers['content-type'] = 'application/json';

  try {
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 502, data: { error: { message: `Upstream error: ${err.message}` } }, latencyMs: Date.now() - start };
  }
}

// ─── OpenAI: POST /proxy/v1/chat/completions ─────────────────────

proxyRouter.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const agent = identifyAgent(req);
  const model = req.body.model || 'unknown';
  const messages: Array<{ role: string; content: string }> = req.body.messages || [];
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

  // Log the request (in-memory)
  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:request',
    summary: `Chat completion request to ${model}`,
    details: {
      model,
      provider: 'openai',
      messageCount: messages.length,
      lastUserMessage: lastUserMsg?.content?.slice(0, 200) || '',
      promptTokens: estimateTokens(messages),
      userAgent: req.headers['user-agent'],
    },
  });

  // Persist to SQLite session
  sessionManager.recordProxyEvent({
    agentId: agent.id,
    agentName: agent.name,
    model,
    eventType: 'llm.request.started',
    summary: `Chat completion request to ${model}`,
    metadata: {
      model,
      provider: 'openai',
      messageCount: messages.length,
      lastUserMessage: lastUserMsg?.content?.slice(0, 200) || '',
      promptTokens: estimateTokens(messages),
    },
  });

  // Register/update agent
  activityMonitor.registerAgent(agent.id, agent.name, {
    model,
    provider: 'openai',
    userAgent: String(req.headers['user-agent'] || ''),
  });

  // Update agent state: thinking (waiting for LLM response)
  const sessionId = sessionManager.getOrCreateSession(agent.id, agent.name, model);
  stateMachine.onProxyActivity(agent.id, agent.name, sessionId, 'request');

  // Forward to real API
  const { status, data, latencyMs } = await forwardRequest(req, `${REAL_OPENAI}/chat/completions`, 'openai');

  // Log the response (in-memory)
  const responseText = data?.choices?.[0]?.message?.content || '';
  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:response',
    summary: `Response from ${model} (${latencyMs}ms)`,
    details: {
      model,
      provider: 'openai',
      completionTokens: data?.usage?.completion_tokens || 0,
      promptTokens: data?.usage?.prompt_tokens || 0,
      totalTokens: data?.usage?.total_tokens || 0,
      latencyMs,
      responsePreview: responseText.slice(0, 200),
      finishReason: data?.choices?.[0]?.finish_reason,
    },
  });

  // Persist response to SQLite session
  sessionManager.recordProxyEvent({
    agentId: agent.id,
    agentName: agent.name,
    model,
    eventType: 'llm.request.completed',
    summary: `Response from ${model} (${latencyMs}ms)`,
    metadata: {
      model,
      provider: 'openai',
      completionTokens: data?.usage?.completion_tokens || 0,
      promptTokens: data?.usage?.prompt_tokens || 0,
      inputTokens: data?.usage?.prompt_tokens || 0,
      outputTokens: data?.usage?.completion_tokens || 0,
      totalTokens: data?.usage?.total_tokens || 0,
      latencyMs,
      responsePreview: responseText.slice(0, 200),
      finishReason: data?.choices?.[0]?.finish_reason,
    },
  });

  // Update agent state: executing (got response, now acting on it)
  stateMachine.onProxyActivity(agent.id, agent.name, sessionId, 'response');

  res.status(status).json(data);
});

// ─── OpenAI: POST /proxy/v1/completions (legacy) ────────────────

proxyRouter.post('/v1/completions', async (req: Request, res: Response) => {
  const agent = identifyAgent(req);
  const model = req.body.model || 'unknown';

  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:request',
    summary: `Legacy completion request to ${model}`,
    details: { model, provider: 'openai', prompt: String(req.body.prompt || '').slice(0, 200) },
  });

  const { status, data, latencyMs } = await forwardRequest(req, `${REAL_OPENAI}/completions`, 'openai');

  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:response',
    summary: `Response from ${model} (${latencyMs}ms)`,
    details: { model, latencyMs, responsePreview: data?.choices?.[0]?.text?.slice(0, 200) },
  });

  res.status(status).json(data);
});

// ─── Anthropic: POST /proxy/v1/messages ──────────────────────────

proxyRouter.post('/v1/messages', async (req: Request, res: Response) => {
  const agent = identifyAgent(req);
  const model = req.body.model || 'unknown';
  const messages = req.body.messages || [];
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');

  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:request',
    summary: `Anthropic message request to ${model}`,
    details: {
      model,
      provider: 'anthropic',
      messageCount: messages.length,
      lastUserMessage: typeof lastUserMsg?.content === 'string' ? lastUserMsg.content.slice(0, 200) : '',
      userAgent: req.headers['user-agent'],
    },
  });

  // Persist to SQLite session
  sessionManager.recordProxyEvent({
    agentId: agent.id,
    agentName: agent.name,
    model,
    eventType: 'llm.request.started',
    summary: `Anthropic message request to ${model}`,
    metadata: {
      model,
      provider: 'anthropic',
      messageCount: messages.length,
      lastUserMessage: typeof lastUserMsg?.content === 'string' ? lastUserMsg.content.slice(0, 200) : '',
    },
  });

  activityMonitor.registerAgent(agent.id, agent.name, {
    model,
    provider: 'anthropic',
    userAgent: String(req.headers['user-agent'] || ''),
  });

  // Update agent state: thinking
  const anthSessionId = sessionManager.getOrCreateSession(agent.id, agent.name, model);
  stateMachine.onProxyActivity(agent.id, agent.name, anthSessionId, 'request');

  const { status, data, latencyMs } = await forwardRequest(req, `${REAL_ANTHROPIC}/v1/messages`, 'anthropic');

  const respContent = data?.content?.[0]?.text || '';
  activityMonitor.record({
    agentId: agent.id,
    agentName: agent.name,
    type: 'llm:response',
    summary: `Response from ${model} (${latencyMs}ms)`,
    details: {
      model,
      provider: 'anthropic',
      latencyMs,
      responsePreview: respContent.slice(0, 200),
      inputTokens: data?.usage?.input_tokens,
      outputTokens: data?.usage?.output_tokens,
    },
  });

  // Persist response to SQLite session
  sessionManager.recordProxyEvent({
    agentId: agent.id,
    agentName: agent.name,
    model,
    eventType: 'llm.request.completed',
    summary: `Response from ${model} (${latencyMs}ms)`,
    metadata: {
      model,
      provider: 'anthropic',
      latencyMs,
      responsePreview: respContent.slice(0, 200),
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0,
    },
  });

  // Update agent state: executing
  stateMachine.onProxyActivity(agent.id, agent.name, anthSessionId, 'response');

  res.status(status).json(data);
});

// ─── OpenAI: GET /proxy/v1/models ────────────────────────────────

proxyRouter.get('/v1/models', async (req: Request, res: Response) => {
  try {
    const headers: Record<string, string> = {};
    if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'] as string;

    const resp = await fetch(`${REAL_OPENAI}/models`, { headers });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: { message: `Upstream error: ${err.message}` } });
  }
});

// ─── Status Endpoints ────────────────────────────────────────────

proxyRouter.get('/agents', (_req, res) => {
  const agents = activityMonitor.getAgents();
  res.json({ agents, total: agents.length });
});

proxyRouter.get('/stats', (_req, res) => {
  res.json(activityMonitor.getStats());
});

// ─── Helpers ─────────────────────────────────────────────────────

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  return Math.ceil(messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4);
}
