// The demo shell — surface picker, true-pixel scale-to-fit stage (DOM or
// Canvas backend), the custom surface panel with live sliders and JSON
// paste, the diagnostics timeline, and the element inspector, all driven
// by one `resolve()` call.

import { useEffect, useMemo, useState } from 'react';
import { resolve } from '../engine/resolver';
import type { SurfaceProfile } from '../engine/surface';
import type { TextMeasurer } from '../engine/measure';
import { keelAd } from './creative';
import { surfaces } from './surfaces';
import { RenderDom } from '../render/render-dom';
import { RenderCanvas } from './RenderCanvas';
import { createCanvasMeasurer } from '../render/measure-canvas';
import { StageFrame } from './StageFrame';
import { SurfacePicker } from './SurfacePicker';
import { CustomSurfacePanel, DEFAULT_CUSTOM_PROFILE } from './CustomSurfacePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ElementInspector } from './ElementInspector';
import './demo.css';

type Selection = { readonly kind: 'shipped'; readonly key: string } | { readonly kind: 'custom' };
type Backend = 'dom' | 'canvas';

export default function App() {
  const [selection, setSelection] = useState<Selection>({ kind: 'shipped', key: surfaces[0]!.key });
  const [customProfile, setCustomProfile] = useState<SurfaceProfile>(DEFAULT_CUSTOM_PROFILE);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [backend, setBackend] = useState<Backend>('dom');

  // §15.3: `measureText` reports wrong widths before the webfont has
  // actually loaded, silently under- or over-wrapping text until the swap
  // happens. `document.fonts.ready` is exactly the browser's own signal for
  // "the fonts this page asked for are now actually available" — waiting
  // for it once, then re-resolving, is cheap and avoids a visible reflow
  // the user would otherwise see mid-session instead.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A fresh measurer (fresh cache) exactly once, when fonts actually become
  // ready — reusing the same instance across that transition would keep
  // serving pre-font-load measurements forever for any text/size/width
  // combination already cached under the fallback font's metrics.
  const measurer: TextMeasurer = useMemo(() => createCanvasMeasurer(), [fontsReady]);

  const activeProfile =
    selection.kind === 'custom'
      ? customProfile
      : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).profile;
  const activeLabel =
    selection.kind === 'custom' ? 'Custom surface' : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).label;

  const layout = useMemo(() => resolve(keelAd, activeProfile, { measurer }), [activeProfile, measurer]);

  return (
    <div className="demo-app">
      <header className="demo-header">
        <h1>Adaptive Layout Engine</h1>
        <p>One ad spec, one resolver, any surface — KEEL Tidal 700</p>
      </header>

      <SurfacePicker
        surfaces={surfaces}
        selectedKey={selection.kind === 'shipped' ? selection.key : ''}
        onSelect={(key) => setSelection({ kind: 'shipped', key })}
      />

      <div className="demo-layout">
        <div className="demo-column">
          <div className="demo-stage-panel">
            <StageFrame widthPx={activeProfile.widthPx} heightPx={activeProfile.heightPx}>
              {backend === 'dom' ? (
                <RenderDom
                  spec={keelAd}
                  layout={layout}
                  showDebugOverlay={showDebugOverlay}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                />
              ) : (
                <RenderCanvas spec={keelAd} layout={layout} measurer={measurer} />
              )}
            </StageFrame>
            <div className="demo-stage-caption">
              {activeLabel} — {Math.round(activeProfile.widthPx)} × {Math.round(activeProfile.heightPx)}px (true
              pixel size, scaled to fit)
            </div>

            <div className="demo-stage-controls">
              <div className="demo-radio-row">
                {(['dom', 'canvas'] as const).map((b) => (
                  <label key={b} className="demo-radio">
                    <input type="radio" name="backend" checked={backend === b} onChange={() => setBackend(b)} />
                    {b === 'dom' ? 'DOM renderer' : 'Canvas renderer'}
                  </label>
                ))}
              </div>
              {backend === 'dom' && (
                <label className="demo-toggle-row">
                  <input
                    type="checkbox"
                    checked={showDebugOverlay}
                    onChange={(e) => setShowDebugOverlay(e.target.checked)}
                  />
                  Debug overlay
                </label>
              )}
            </div>
          </div>

          <CustomSurfacePanel
            onResolve={(profile) => {
              setCustomProfile(profile);
              setSelection({ kind: 'custom' });
            }}
          />
        </div>

        <div className="demo-column">
          <section className="demo-side-panel">
            <h2>Resolution summary</h2>
            <div className="demo-status-row">
              <span className={`demo-status-pill ${layout.status}`}>{layout.status}</span>
              <span>{layout.templateId}</span>
            </div>
            <dl className="demo-kv">
              <dt>Aspect</dt>
              <dd>{layout.diagnostics.surfaceSummary.aspect.toFixed(2)}</dd>
              <dt>Aspect class</dt>
              <dd>{layout.aspectClass}</dd>
              <dt>Scale class</dt>
              <dd>{layout.scaleClass}</dd>
            </dl>
          </section>

          {backend === 'dom' ? (
            <ElementInspector spec={keelAd} layout={layout} selectedId={selectedElementId} />
          ) : (
            <section className="demo-side-panel">
              <h2>Element inspector</h2>
              <p className="demo-text-muted">Click-to-inspect is DOM-renderer only — switch backends to use it.</p>
            </section>
          )}

          <DiagnosticsPanel layout={layout} />
        </div>
      </div>
    </div>
  );
}
