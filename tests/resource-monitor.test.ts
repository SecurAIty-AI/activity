/**
 * Tests for the resource monitor — cost estimation and system metrics.
 */

import { describe, it, expect } from 'vitest';
import { resourceMonitor } from '../src/services/resource-monitor';

describe('Resource Monitor', () => {
  // ── Cost Estimation ─────────────────────────────────────────

  it('estimates GPT-4o cost correctly', () => {
    const est = resourceMonitor.estimateCost('gpt-4o', 1000, 500);
    expect(est.model).toBe('gpt-4o');
    expect(est.inputTokens).toBe(1000);
    expect(est.outputTokens).toBe(500);
    // GPT-4o: $2.50/1M input, $10/1M output
    expect(est.inputCost).toBeCloseTo(0.0025, 4);
    expect(est.outputCost).toBeCloseTo(0.005, 4);
    expect(est.totalCost).toBeCloseTo(0.0075, 4);
  });

  it('estimates Claude Sonnet cost correctly', () => {
    const est = resourceMonitor.estimateCost('claude-sonnet-4-20250514', 2000, 1000);
    // Claude Sonnet: $3/1M input, $15/1M output
    expect(est.inputCost).toBeCloseTo(0.006, 4);
    expect(est.outputCost).toBeCloseTo(0.015, 4);
  });

  it('estimates Claude Opus cost correctly', () => {
    const est = resourceMonitor.estimateCost('claude-opus-4-20250514', 5000, 2000);
    // Claude Opus: $15/1M input, $75/1M output
    expect(est.inputCost).toBeCloseTo(0.075, 4);
    expect(est.outputCost).toBeCloseTo(0.15, 4);
  });

  it('estimates GPT-4o-mini cost correctly', () => {
    const est = resourceMonitor.estimateCost('gpt-4o-mini', 10000, 5000);
    // GPT-4o-mini: $0.15/1M input, $0.60/1M output
    expect(est.inputCost).toBeCloseTo(0.0015, 4);
    expect(est.outputCost).toBeCloseTo(0.003, 4);
  });

  it('returns zero cost for local models', () => {
    const est = resourceMonitor.estimateCost('llama3', 10000, 5000);
    expect(est.totalCost).toBe(0);
  });

  it('returns zero cost for unknown models', () => {
    const est = resourceMonitor.estimateCost('unknown-model-xyz', 10000, 5000);
    expect(est.totalCost).toBe(0);
  });

  it('handles zero tokens', () => {
    const est = resourceMonitor.estimateCost('gpt-4o', 0, 0);
    expect(est.totalCost).toBe(0);
  });

  it('handles large token counts', () => {
    const est = resourceMonitor.estimateCost('gpt-4o', 1_000_000, 500_000);
    // 1M input = $2.50, 500K output = $5.00
    expect(est.inputCost).toBeCloseTo(2.50, 2);
    expect(est.outputCost).toBeCloseTo(5.00, 2);
    expect(est.totalCost).toBeCloseTo(7.50, 2);
  });

  // ── Request Tracking ────────────────────────────────────────

  it('tracks requests per minute', () => {
    resourceMonitor.trackRequest('test-sess-rpm');
    resourceMonitor.trackRequest('test-sess-rpm');
    resourceMonitor.trackRequest('test-sess-rpm');
    const rpm = resourceMonitor.getRequestsPerMin('test-sess-rpm');
    expect(rpm).toBe(3);
  });

  it('returns 0 RPM for unknown session', () => {
    const rpm = resourceMonitor.getRequestsPerMin('nonexistent');
    expect(rpm).toBe(0);
  });

  // ── Pricing ─────────────────────────────────────────────────

  it('returns model pricing list', () => {
    const pricing = resourceMonitor.getPricing();
    expect(pricing).toHaveProperty('gpt-4o');
    expect(pricing).toHaveProperty('claude-sonnet-4-20250514');
    expect(pricing['gpt-4o'].input).toBe(2.50);
    expect(pricing['gpt-4o'].output).toBe(10.00);
  });

  // ── System Resources ────────────────────────────────────────

  it('returns system resource summary', () => {
    const resources = resourceMonitor.getSystemResources();
    expect(resources).toHaveProperty('heapUsedMb');
    expect(resources).toHaveProperty('heapTotalMb');
    expect(resources).toHaveProperty('rssMb');
    expect(resources).toHaveProperty('cpuPercent');
    expect(resources).toHaveProperty('uptimeSeconds');
    expect(resources).toHaveProperty('platform');
    expect(resources).toHaveProperty('totalMemoryGb');
    expect(resources).toHaveProperty('freeMemoryGb');
    expect(typeof resources.heapUsedMb).toBe('number');
    expect(resources.heapUsedMb).toBeGreaterThan(0);
  });
});
