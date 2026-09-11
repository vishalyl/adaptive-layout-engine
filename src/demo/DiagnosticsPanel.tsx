// §14.5 — the diagnostics panel. Renders `diagnostics.decisions` as a
// readable timeline, lists dropped elements with their reasons, and offers
// a "Copy trace" button so the full trace can be pasted somewhere else
// during a live interview. This is what turns "why did this element end up
// there?" from a memory test into a pointing exercise — and, quietly, it is
// hard evidence the resolver is real: a hardcoded lookup table has nothing
// to narrate.

import { useState } from 'react';
import type { ResolvedLayout } from '../engine/resolver';

export interface DiagnosticsPanelProps {
  readonly layout: ResolvedLayout;
}

const DROP_REASON_LABEL: Record<string, string> = {
  'not-in-ambition': 'not attempted at this scale',
  'exhausted-ladder': 'degradation ladder exhausted',
  'surface-too-small': 'surface too small',
};

export function DiagnosticsPanel({ layout }: DiagnosticsPanelProps) {
  const [copied, setCopied] = useState(false);
  const { diagnostics, status } = layout;

  const dropped = Object.values(layout.elements).filter((e) => !e.placed);

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

  return (
    <section className="demo-side-panel">
      <h2>Diagnostics</h2>

      <div className="demo-status-row">
        <span className={`demo-status-pill ${status}`}>{status}</span>
        <span>{diagnostics.resolveMs.toFixed(2)}ms</span>
        <span className="demo-text-muted">· {diagnostics.iterations} iteration(s)</span>
      </div>

      {dropped.length > 0 && (
        <div className="demo-drops">
          <h3>Dropped ({dropped.length})</h3>
          <ul>
            {dropped.map((e) => (
              <li key={e.id}>
                <b>{e.id}</b> — {DROP_REASON_LABEL[e.reason] ?? e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="demo-timeline">
        <h3>Decisions ({diagnostics.decisions.length})</h3>
        <ol>
          {diagnostics.decisions.map((d, i) => (
            <li key={i}>
              <span className="demo-phase-tag">{d.phase}</span> {d.note}
            </li>
          ))}
        </ol>
      </div>

      <button type="button" className="demo-button" onClick={copyTrace}>
        {copied ? 'Copied!' : 'Copy trace (JSON)'}
      </button>
    </section>
  );
}
