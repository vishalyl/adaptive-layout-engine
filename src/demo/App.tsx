// The demo shell. At this gate it wires the surface picker, the true-pixel
// scale-to-fit stage, and a resolution summary together — enough to see all
// six surfaces resolve to genuinely different arrangements. The custom
// surface panel, full diagnostics timeline, and element inspector are
// Gate 6.

import { useMemo, useState } from 'react';
import { resolve } from '../engine/resolver';
import { keelAd } from './creative';
import { surfaces } from './surfaces';
import { RenderDom } from '../render/render-dom';
import { StageFrame } from './StageFrame';
import { SurfacePicker } from './SurfacePicker';
import './demo.css';

export default function App() {
  const [selectedKey, setSelectedKey] = useState(surfaces[0]!.key);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  const selected = surfaces.find((s) => s.key === selectedKey) ?? surfaces[0]!;
  const layout = useMemo(() => resolve(keelAd, selected.profile), [selected.profile]);

  return (
    <div className="demo-app">
      <header className="demo-header">
        <h1>Adaptive Layout Engine</h1>
        <p>One ad spec, one resolver, six surfaces — KEEL Tidal 700</p>
      </header>

      <SurfacePicker surfaces={surfaces} selectedKey={selectedKey} onSelect={setSelectedKey} />

      <div className="demo-layout">
        <div className="demo-stage-panel">
          <StageFrame widthPx={selected.profile.widthPx} heightPx={selected.profile.heightPx}>
            <RenderDom spec={keelAd} layout={layout} showDebugOverlay={showDebugOverlay} />
          </StageFrame>
          <div className="demo-stage-caption">
            {selected.label} — {selected.profile.widthPx} × {selected.profile.heightPx}px (true pixel size, scaled to fit)
          </div>
        </div>

        <aside className="demo-side-panel">
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
            <dt>Resolve time</dt>
            <dd>{layout.diagnostics.resolveMs.toFixed(2)}ms</dd>
            <dt>Iterations</dt>
            <dd>{layout.diagnostics.iterations}</dd>
          </dl>
          <label className="demo-toggle-row">
            <input
              type="checkbox"
              checked={showDebugOverlay}
              onChange={(e) => setShowDebugOverlay(e.target.checked)}
            />
            Debug overlay
          </label>
        </aside>
      </div>
    </div>
  );
}
