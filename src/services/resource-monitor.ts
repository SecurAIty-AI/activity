/**
 * @file resource-monitor.ts — Tracks resource consumption per agent session.
 * CPU, memory, tokens, cost — everything measurable.
 * Snapshots taken every 10s for active sessions.
 */

import { store } from './database';
import { sessionManager } from './session-manager';
import * as os from 'os';

// Model pricing per 1M tokens (input/output) — same as session-manager but centralized
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':           { input: 2.50, output: 10.00 },
  'gpt-4o-mini':      { input: 0.15, output: 0.60 },
  'gpt-4-turbo':      { input: 10.00, output: 30.00 },
  'gpt-4':            { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':    { input: 0.50, output: 1.50 },
  'o1':               { input: 15.00, output: 60.00 },
  'o1-mini':          { input: 3.00, output: 12.00 },
  'claude-sonnet-4-20250514':    { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514':      { input: 15.00, output: 75.00 },
  'claude-haiku-3-5-20241022':     { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229':  { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'llama3':           { input: 0, output: 0 },  // local
  'llama3.2':         { input: 0, output: 0 },  // local
  'mistral':          { input: 0, output: 0 },  // local
  'gemini-1.5-pro':   { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
};

export interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

class ResourceMonitor {
  private requestsPerSession: Map<string, { timestamps: number[] }> = new Map();

  /**
   * Estimate cost for a given model and token counts.
   */
  estimateCost(model: string, inputTokens: number, outputTokens: number): CostEstimate {
    // Try exact match first, then longest substring match
    const modelLower = model.toLowerCase();
    const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length); // longest first
    const key = sortedKeys.find(k => modelLower === k.toLowerCase())
      || sortedKeys.find(k => modelLower.includes(k.toLowerCase()))
      || sortedKeys.find(k => modelLower.startsWith(k.split('-')[0]));

    const pricing = key ? MODEL_PRICING[key] : { input: 0, output: 0 };
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return {
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }

  /**
   * Track a request for rate calculation.
   */
  trackRequest(sessionId: string) {
    let entry = this.requestsPerSession.get(sessionId);
    if (!entry) {
      entry = { timestamps: [] };
      this.requestsPerSession.set(sessionId, entry);
    }
    entry.timestamps.push(Date.now());

    // Keep last 5 minutes of timestamps
    const cutoff = Date.now() - 5 * 60_000;
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  }

  /**
   * Get requests-per-minute for a session.
   */
  getRequestsPerMin(sessionId: string): number {
    const entry = this.requestsPerSession.get(sessionId);
    if (!entry || entry.timestamps.length === 0) return 0;
    const cutoff = Date.now() - 60_000;
    const lastMinute = entry.timestamps.filter(t => t > cutoff).length;
    return lastMinute;
  }

  /**
   * Take a resource snapshot for all active sessions.
   */
  takeSnapshots() {
    const activeSessions = sessionManager.getActiveSessions();
    const cpuPercent = this.getCpuPercent();
    const memoryMb = this.getMemoryMb();

    for (const { sessionId } of activeSessions) {
      const session = store.getSession(sessionId);
      if (!session) continue;

      store.insertSnapshot({
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        cpu_percent: cpuPercent,
        memory_mb: memoryMb,
        tokens: session.total_tokens,
        requests_per_min: this.getRequestsPerMin(sessionId),
        cost: session.total_cost,
        active_tools: [],
        network_wait_ms: 0,
        file_reads: 0,
        file_writes: 0,
        retry_count: 0,
      });
    }
  }

  /**
   * Get current process CPU usage estimate.
   */
  private getCpuPercent(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    return Math.round(((totalTick - totalIdle) / totalTick) * 100);
  }

  /**
   * Get current process memory in MB.
   */
  private getMemoryMb(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10;
  }

  /**
   * Get all supported model pricing.
   */
  getPricing(): Record<string, { input: number; output: number }> {
    return { ...MODEL_PRICING };
  }

  /**
   * Get system resource summary.
   */
  getSystemResources() {
    const mem = process.memoryUsage();
    return {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
      rssMb: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
      cpuPercent: this.getCpuPercent(),
      uptimeSeconds: Math.round(process.uptime()),
      platform: os.platform(),
      totalMemoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
      freeMemoryGb: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
    };
  }
}

export const resourceMonitor = new ResourceMonitor();

// Take snapshots every 10 seconds for active sessions
setInterval(() => resourceMonitor.takeSnapshots(), 10_000);
