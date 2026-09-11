// The demo shell — surface picker, true-pixel scale-to-fit stage, the
// custom surface panel with live sliders and JSON paste, the diagnostics
// timeline, and the element inspector, all driven by one `resolve()` call.

import { useMemo, useState } from 'react';
import { resolve } from '../engine/resolver';
import type { SurfaceProfile } from '../engine/surface';
import { keelAd } from './creative';
import { surfaces } from './surfaces';
import { RenderDom } from '../render/render-dom';
import { StageFrame } from './StageFrame';
import { SurfacePicker } from './SurfacePicker';
import { CustomSurfacePanel, DEFAULT_CUSTOM_PROFILE } from './CustomSurfacePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ElementInspector } from './ElementInspector';
import './demo.css';

type Selection = { readonly kind: 'shipped'; readonly key: string } | { readonly kind: 'custom' };

export default function App() {
  const [selection, setSelection] = useState<Selection>({ kind: 'shipped', key: surfaces[0]!.key });
  const [customProfile, setCustomProfile] = useState<SurfaceProfile>(DEFAULT_CUSTOM_PROFILE);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const activeProfile =
    selection.kind === 'custom'
      ? customProfile
      : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).profile;
  const activeLabel =
    selection.kind === 'custom' ? 'Custom surface' : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).label;

  const layout = useMemo(() => resolve(keelAd, activeProfile), [activeProfile]);

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
              <RenderDom
                spec={keelAd}
                layout={layout}
                showDebugOverlay={showDebugOverlay}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
              />
            </StageFrame>
            <div className="demo-stage-caption">
              {activeLabel} — {Math.round(activeProfile.widthPx)} × {Math.round(activeProfile.heightPx)}px (true
              pixel size, scaled to fit)
            </div>
            <label className="demo-toggle-row">
              <input
                type="checkbox"
                checked={showDebugOverlay}
                onChange={(e) => setShowDebugOverlay(e.target.checked)}
              />
              Debug overlay
            </label>
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

          <ElementInspector spec={keelAd} layout={layout} selectedId={selectedElementId} />

          <DiagnosticsPanel layout={layout} />
        </div>
      </div>
    </div>
  );
}
