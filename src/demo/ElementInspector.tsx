// Click any element on the stage, see exactly why it ended up
// where it did. This answers "walk through why a specific element ended up
// at a specific position and size" by pointing, not by memory.

import type { AdElement, AdSpec } from '../spec';
import type { ResolvedLayout } from '../resolver';
import { InfoTooltip } from './InfoTooltip';

export interface ElementInspectorProps {
  readonly spec: AdSpec;
  readonly layout: ResolvedLayout;
  readonly selectedId: string | null;
}

const HEADING_TOOLTIP =
  'Click any element in the ad to see its priority, degradability, final size/position, and which degradation rungs were applied to it.';

export function ElementInspector({ spec, layout, selectedId }: ElementInspectorProps) {
  if (!selectedId) {
    return (
      <section className="panel panel-readout">
        <div className="panel-head">
          <h2>
            Element inspector
            <InfoTooltip text={HEADING_TOOLTIP} />
          </h2>
        </div>
        <div className="empty">
          <p className="empty-title">Nothing selected</p>
          <p className="empty-hint">Click any element on the stage to see why the resolver put it there.</p>
        </div>
      </section>
    );
  }

  const element: AdElement | undefined = spec.elements.find((el) => el.id === selectedId);
  const entry = layout.elements[selectedId];
  if (!element || !entry) return null;

  return (
    <section className="panel panel-readout">
      <div className="panel-head">
        <h2>
          Element inspector
          <InfoTooltip text={HEADING_TOOLTIP} />
        </h2>
      </div>
      <dl className="kv">
        <dt>id</dt>
        <dd className="mono">{element.id}</dd>
        <dt>type</dt>
        <dd className="mono">{element.type}</dd>
        <dt>role</dt>
        <dd className="mono">{element.role}</dd>
        <dt>priority</dt>
        <dd className="mono">{element.priority}</dd>
        <dt>degradability</dt>
        <dd className="mono">{element.degradability}</dd>
        <dt>placed</dt>
        <dd className="mono">{entry.placed ? 'yes' : 'no'}</dd>
        {entry.placed ? (
          <>
            <dt>zone</dt>
            <dd className="mono">{entry.zone}</dd>
            <dt>rect</dt>
            <dd className="mono">
              {entry.rect.w}×{entry.rect.h} @ ({entry.rect.x}, {entry.rect.y})
            </dd>
            {entry.typography && (
              <>
                <dt>font size</dt>
                <dd className="mono">{entry.typography.fontPx.toFixed(1)}<em>px</em></dd>
                <dt>lines</dt>
                <dd className="mono">
                  {entry.typography.lines}
                  {entry.typography.truncated ? ' (truncated)' : ''}
                </dd>
              </>
            )}
            {entry.contrast && (
              <>
                <dt>
                  contrast
                  <InfoTooltip text="Brand mark colour against the worst-case colour behind it. Below the surface's floor, the resolver first tries another preferred zone, then paints a plate behind the mark." />
                </dt>
                <dd className="mono">
                  {entry.contrast.ratio.toFixed(2)}:1 vs {entry.contrast.backdrop} (min {entry.contrast.required}:1)
                  {entry.contrast.plate ? ` — plated ${entry.contrast.plate}` : ''}
                </dd>
              </>
            )}
            <dt>rungs applied</dt>
            <dd className="mono">{entry.appliedRungs.length > 0 ? entry.appliedRungs.join(' -> ') : 'none'}</dd>
          </>
        ) : (
          <>
            <dt>reason</dt>
            <dd className="mono">{entry.reason}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
