// §14.5 — the diagnostics panel. Renders `diagnostics.decisions` as a
// readable timeline, lists dropped elements with their reasons, and offers
// a "Copy trace" button so the full trace can be pasted somewhere else
// during a live interview. This is what turns "why did this element end up
// there?" from a memory test into a pointing exercise — and, quietly, it is
// hard evidence the resolver is real: a hardcoded lookup table has nothing
// to narrate.

import { useState } from 'react';
import type { ResolvedLayout } from '../engine/resolver';
import { InfoTooltip } from './InfoTooltip';

export interface DiagnosticsPanelProps {
  readonly layout: ResolvedLayout;
  // Timing benchmark (provided by App.tsx for actual measurement)
  readonly benchmarkStats: { avg: number; min: number; max: number; runs: number } | null;
  readonly onRunBenchmark: () => void;
  readonly benchmarking: boolean;
  // Stress test (runs resolve on N surfaces simultaneously)
  readonly stressResult: { totalMs: number; surfaces: number; errors: number } | null;
  readonly onStressTest: () => void;
  readonly stressRunning: boolean;
}

const DROP_REASON_LABEL: Record<string, string> = {
  'not-in-ambition': 'not attempted at this scale',
  'exhausted-ladder': 'degradation ladder exhausted',
  'surface-too-small': 'surface too small',
};

export function DiagnosticsPanel({ layout, benchmarkStats, onRunBenchmark, benchmarking, stressResult, onStressTest, stressRunning }: DiagnosticsPanelProps) {
  const [copied, setCopied] = useState(false);
  const { diagnostics, status } = layout;

  const dropped = Object.values(layout.elements).filter((e) => !e.placed);
  const decisionCount = diagnostics.decisions.length;

  async function copyTrace() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; the trace is still
      // visible on screen, so this is a soft failure, not an error state.
    }
  }

  // Scale for the current-time bar relative to benchmark max
  const scaleMax = benchmarkStats ? Math.max(diagnostics.resolveMs, benchmarkStats.max, 0.01) : Math.max(diagnostics.resolveMs, 0.01);

  return (
    <section className="panel panel-readout">
      <div className="panel-head">
        <h2>
          Diagnostics
          <span className="panel-head-meta mono">{decisionCount} decisions</span>
        </h2>
      </div>

      <div className="status-row">
        <span className={`status ${status}`}>{status}</span>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-label">Resolve</span>
          <span className="stat-value mono">{diagnostics.resolveMs.toFixed(2)}<em>ms</em></span>
        </div>
        <div className="stat">
          <span className="stat-label">Iterations</span>
          <span className="stat-value mono">{diagnostics.iterations}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Decisions</span>
          <span className="stat-value mono">{decisionCount}</span>
        </div>
      </div>

      {dropped.length > 0 && (
        <div className="drops">
          <h3>
            Dropped <span className="count-tag">{dropped.length}</span>
            <InfoTooltip text="Elements not shown, and why: either never attempted at this scale, or they lost every rung of the degradation ladder and were removed as a last resort." />
          </h3>
          <ul className="drops-list">
            {dropped.map((e) => (
              <li key={e.id} className="drops-item">
                <span className="drops-id mono">{e.id}</span>
                <span className="drops-reason">{DROP_REASON_LABEL[e.reason] ?? e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timing benchmark */}
      <div className="benchmark">
        <div className="benchmark-header">
          <h3>Resolve timing</h3>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onRunBenchmark}
            disabled={benchmarking}
            style={{ opacity: benchmarking ? 0.5 : 1 }}
          >
            {benchmarking ? '200 runs…' : 'Benchmark'}
          </button>
        </div>
        <div className="benchmark-row">
          <div className="benchmark-bar" style={{ width: `${Math.min(100, (diagnostics.resolveMs / scaleMax) * 100)}%` }} />
        </div>
        {benchmarkStats && (
          <div className="benchmark-stats">
            <span className="mono">avg {benchmarkStats.avg.toFixed(2)}ms</span>
            <span className="mono">min {benchmarkStats.min.toFixed(2)}ms</span>
            <span className="mono">max {benchmarkStats.max.toFixed(2)}ms</span>
            <span className="mono">{benchmarkStats.runs} runs</span>
          </div>
        )}
      </div>

      {/* Stress test */}
      <div className="benchmark" style={{ borderLeft: '2px solid var(--accent-surface)' }}>
        <div className="benchmark-header">
          <h3>Stress test</h3>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onStressTest}
            disabled={stressRunning}
            style={{ opacity: stressRunning ? 0.5 : 1 }}
          >
            {stressRunning ? '50 surfaces…' : 'Run stress test'}
          </button>
        </div>
        {stressResult && (
          <div className="benchmark-stats">
            <span className="mono">{stressResult.totalMs.toFixed(0)}ms total</span>
            <span className="mono">{stressResult.surfaces} surfaces</span>
            <span className="mono">{stressResult.errors} errors</span>
            <span className="mono" style={{ color: stressResult.errors > 0 ? 'var(--accent-danger)' : 'var(--text-hi)' }}>
              {stressResult.errors === 0 ? '✓ all resolved' : `⚠ ${stressResult.errors} failed`}
            </span>
          </div>
        )}
      </div>

      <div className="timeline">
        <ol className="timeline-list">
          {diagnostics.decisions.map((d, i) => (
            <li
              key={i}
              className="timeline-row"
              data-phase={d.phase}
              style={{ ['--i' as string]: i.toString() }}
            >
              <span className="timeline-node" aria-hidden="true" />
              <span className="timeline-phase mono">{d.phase}</span>
              <span className="timeline-note mono">{d.note}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="demo-info-tooltip" style={{ textAlign: 'right', marginTop: 'var(--sp-4)' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyTrace}>
          <span aria-hidden="true" />
          {copied ? 'Copied' : 'Copy trace'}
        </button>
        <InfoTooltip text="Copies the full diagnostics object as JSON." />
      </div>
    </section>
  );
}
