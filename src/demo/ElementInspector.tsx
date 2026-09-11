// §14.6 — click any element on the stage, see exactly why it ended up
// where it did. This answers "walk through why a specific element ended up
// at a specific position and size" by pointing, not by memory.

import type { AdElement, AdSpec } from '../engine/spec';
import type { ResolvedLayout } from '../engine/resolver';

export interface ElementInspectorProps {
  readonly spec: AdSpec;
  readonly layout: ResolvedLayout;
  readonly selectedId: string | null;
}

export function ElementInspector({ spec, layout, selectedId }: ElementInspectorProps) {
  if (!selectedId) {
    return (
      <section className="demo-side-panel">
        <h2>Element inspector</h2>
        <p className="demo-text-muted">Click any element on the stage to inspect it.</p>
      </section>
    );
  }

  const element: AdElement | undefined = spec.elements.find((el) => el.id === selectedId);
  const entry = layout.elements[selectedId];
  if (!element || !entry) return null;

  return (
    <section className="demo-side-panel">
      <h2>Element inspector</h2>
      <dl className="demo-kv">
        <dt>id</dt>
        <dd>{element.id}</dd>
        <dt>type</dt>
        <dd>{element.type}</dd>
        <dt>role</dt>
        <dd>{element.role}</dd>
        <dt>priority</dt>
        <dd>{element.priority}</dd>
        <dt>degradability</dt>
        <dd>{element.degradability}</dd>
        <dt>placed</dt>
        <dd>{entry.placed ? 'yes' : 'no'}</dd>
        {entry.placed ? (
          <>
            <dt>zone</dt>
            <dd>{entry.zone}</dd>
            <dt>rect</dt>
            <dd>
              {entry.rect.w}×{entry.rect.h} @ ({entry.rect.x}, {entry.rect.y})
            </dd>
            {entry.typography && (
              <>
                <dt>font size</dt>
                <dd>{entry.typography.fontPx.toFixed(1)}px</dd>
                <dt>lines</dt>
                <dd>
                  {entry.typography.lines}
                  {entry.typography.truncated ? ' (truncated)' : ''}
                </dd>
              </>
            )}
            <dt>rungs applied</dt>
            <dd>{entry.appliedRungs.length > 0 ? entry.appliedRungs.join(' -> ') : 'none'}</dd>
          </>
        ) : (
          <>
            <dt>reason</dt>
            <dd>{entry.reason}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
