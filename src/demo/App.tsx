// The demo shell — surface picker, true-pixel scale-to-fit stage (DOM or
// Canvas backend), the custom surface panel with live sliders and JSON
// paste, the diagnostics timeline, and the element inspector, all driven
// by one `resolve()` call.
//
// Premium UI: Obsidian & Signal — sections 2–20 of PREMIUM_UI_PLAN.md.
// Presentation-only changes. Zero engine modifications.
// URL persistence: all key state is synced to query params for shareable URLs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolve, type ResolvedLayout } from '../engine/resolver';
import type { SurfaceProfile } from '../engine/surface';
import type { TextMeasurer } from '../engine/measure';
import { ads } from './creatives';
import { surfaces } from './surfaces';
import { RenderDom } from '../render/render-dom';
import { RenderCanvas } from './RenderCanvas';
import { createCanvasMeasurer } from '../render/measure-canvas';
import { StageFrame } from './StageFrame';
import { SurfacePicker } from './SurfacePicker';
import { AdPicker } from './AdPicker';
import { CustomSurfacePanel, DEFAULT_CUSTOM_PROFILE } from './CustomSurfacePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ElementInspector } from './ElementInspector';
import { InfoTooltip } from './InfoTooltip';
import { GuideTab } from './GuideTab';
import { BrandHeader } from './BrandHeader';
import { DemoErrorBoundary } from './DemoErrorBoundary';
import './demo.css';

type Selection = { readonly kind: 'shipped'; readonly key: string } | { readonly kind: 'custom' };
type Backend = 'dom' | 'canvas';
type Tab = 'demo' | 'guide';

// The "before" baseline: the original fixed-ratio surface that every ad
// was designed for. When comparison mode is on, the left stage shows this
// baseline and the right stage shows the adaptive layout.
const BEFORE_PROFILE: SurfaceProfile = surfaces[0]!.profile;

// ── URL helpers ──────────────────────────────────────────────────────────
// Persist/adapt state to the query string so links are shareable and
// bookmarkable.  We keep the encoding simple (single params, no nesting).

interface UrlState {
  ad: string | null;
  surface: string | null;
  renderer: Backend | null;
  compare: boolean;
  debug: boolean;
  inspect: string | null;
}

function readUrlParams(): UrlState {
  const qp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  return {
    ad: qp.has('ad') ? qp.get('ad') : null,
    surface: qp.has('surface') ? qp.get('surface') : null,
    renderer: (qp.get('renderer') as Backend | null) && (qp.get('renderer') === 'dom' || qp.get('renderer') === 'canvas')
      ? (qp.get('renderer') as Backend)
      : null,
    compare: qp.get('compare') === '1',
    debug: qp.get('debug') === '1',
    inspect: qp.has('inspect') ? qp.get('inspect') : null,
  };
}

function writeUrl(updater: (params: Record<string, string | null>) => void): void {
  if (typeof window === 'undefined') return;
  const qp = new URLSearchParams(window.location.search);
  const params: Record<string, string | null> = Object.fromEntries(qp);
  updater(params);
  // Rebuild query string — remove empty values
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  const qs = parts.join('&');
  // Use history.replaceState to avoid page reload
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, '', url);
}

// ── Initial state from URL ──────────────────────────────────────────────
const urlState = readUrlParams();

function getInitialState(): {
  selection: Selection;
  customProfile: SurfaceProfile;
  showDebugOverlay: boolean;
  selectedElementId: string | null;
  backend: Backend;
  adKey: string;
  showComparison: boolean;
} {
  return {
    selection: urlState.surface && surfaces.some((s) => s.key === urlState.surface)
      ? { kind: 'shipped' as const, key: urlState.surface! }
      : { kind: 'shipped' as const, key: surfaces[1]!.key },
    customProfile: DEFAULT_CUSTOM_PROFILE,
    showDebugOverlay: urlState.debug,
    selectedElementId: urlState.inspect,
    backend: urlState.renderer ?? 'dom',
    adKey: (urlState.ad && ads.some((a) => a.key === urlState.ad)) ? urlState.ad! : ads[0]!.key,
    showComparison: urlState.compare,
  };
}

const initial = getInitialState();

export default function App() {
  const [tab, setTab] = useState<Tab>('demo');
  const [selection, setSelection] = useState<Selection>(initial.selection);
  const [customProfile, setCustomProfile] = useState<SurfaceProfile>(initial.customProfile);
  const [showDebugOverlay, setShowDebugOverlay] = useState(initial.showDebugOverlay);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(initial.selectedElementId);
  const [backend, setBackend] = useState<Backend>(initial.backend);
  const [adKey, setAdKey] = useState<string>(initial.adKey);
  const [showComparison, setShowComparison] = useState(initial.showComparison);

  // ── URL sync: write state to URL on every change ──────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const adKeyRef = useRef<string>(adKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const backendRef = useRef<Backend>(backend);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const compareRef = useRef<boolean>(showComparison);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debugRef = useRef<boolean>(showDebugOverlay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inspectRef = useRef<string | null>(selectedElementId);
  adKeyRef.current = adKey;
  backendRef.current = backend;
  compareRef.current = showComparison;
  debugRef.current = showDebugOverlay;
  inspectRef.current = selectedElementId;

  // Track which fields changed so we don't batch-write multiple times
  const dirtyRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleUrlSync = useCallback((...keys: string[]) => {
    keys.forEach((k) => dirtyRef.current.add(k));
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      const keys = dirtyRef.current;
      if (keys.size === 0) return;
      writeUrl((params) => {
        if (keys.has('ad')) params['ad'] = adKeyRef.current;
        if (keys.has('renderer')) params['renderer'] = backendRef.current;
        if (keys.has('compare')) params['compare'] = compareRef.current ? '1' : null;
        if (keys.has('debug')) params['debug'] = debugRef.current ? '1' : null;
        if (keys.has('inspect')) params['inspect'] = inspectRef.current;
      });
      dirtyRef.current.clear();
    }, 80);
  }, []);

  // Sync selection.surface key when shipped surface changes
  useEffect(() => {
    if (selection.kind === 'shipped' && selection.key) {
      writeUrl((params) => { params['surface'] = selection.key; });
    }
  }, [selection]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      // Ignore if user is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key;

      // 1-4 → switch creative
      const digit = parseInt(key, 10);
      if (digit >= 1 && digit <= ads.length) {
        e.preventDefault();
        setAdKey(ads[digit - 1]!.key);
        setSelectedElementId(null);
        scheduleUrlSync('ad');
        return;
      }

      // R → toggle renderer
      if (key.toLowerCase() === 'r') {
        e.preventDefault();
        setBackend((b) => (b === 'dom' ? 'canvas' : 'dom'));
        scheduleUrlSync('renderer');
        return;
      }

      // C → toggle compare
      if (key.toLowerCase() === 'c') {
        e.preventDefault();
        setShowComparison((v) => !v);
        scheduleUrlSync('compare');
        return;
      }

      // D → toggle debug overlay
      if (key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDebugOverlay((v) => !v);
        scheduleUrlSync('debug');
        return;
      }
    }

    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [scheduleUrlSync]);

  // ── Font readiness ────────────────────────────────────────────────────
  // §15.3: `measureText` reports wrong widths before the webfont has
  // actually loaded. `document.fonts.ready` is the browser's own signal.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const measurer: TextMeasurer = useMemo(() => createCanvasMeasurer(), [fontsReady]);

  const activeProfile =
    selection.kind === 'custom'
      ? customProfile
      : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).profile;
  const activeLabel =
    selection.kind === 'custom' ? 'Custom surface' : (surfaces.find((s) => s.key === selection.key) ?? surfaces[0]!).label;

  const activeAd = ads.find((a) => a.key === adKey) ?? ads[0]!;

  const layout = useMemo(() => resolve(activeAd.spec, activeProfile, { measurer }), [activeAd, activeProfile, measurer]);
  const beforeLayout = useMemo(() => resolve(activeAd.spec, BEFORE_PROFILE, { measurer }), [activeAd, measurer]);

  // ── Timing benchmark ──────────────────────────────────────────────────
  const [benchmarkStats, setBenchmarkStats] = useState<{ avg: number; min: number; max: number; runs: number } | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);

  const runBenchmark = useCallback(() => {
    setBenchmarking(true);
    requestAnimationFrame(() => {
      const N = 200;
      const times: number[] = [];
      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        resolve(activeAd.spec, activeProfile, { measurer });
        times.push(performance.now() - t0);
      }
      const avg = times.reduce((a, b) => a + b, 0) / N;
      const min = Math.min(...times);
      const max = Math.max(...times);
      setBenchmarkStats({ avg, min, max, runs: N });
      setBenchmarking(false);
    });
  }, [activeAd, activeProfile, measurer]);

  // ── Stress test: resolve ad on every surface ──────────────────────────
  const [stressResult, setStressResult] = useState<{ totalMs: number; surfaces: number; errors: number } | null>(null);
  const [stressRunning, setStressRunning] = useState(false);

  const runStressTest = useCallback(() => {
    setStressRunning(true);
    requestAnimationFrame(() => {
      const t0 = performance.now();
      let errors = 0;
      const N = surfaces.length;
      for (let i = 0; i < N; i++) {
        try {
          resolve(activeAd.spec, surfaces[i]!.profile, { measurer });
        } catch {
          errors++;
        }
      }
      setStressResult({
        totalMs: performance.now() - t0,
        surfaces: N,
        errors,
      });
      setStressRunning(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAd, measurer, surfaces]);

  // Render a single stage. Extracted to avoid duplication in comparison mode.
  const renderStage = (
    widthPx: number,
    heightPx: number,
    layout: ResolvedLayout,
    label: string,
  ) => {
    // Compute the on-screen scale: how much the preview container
    // shrinks the layout surface.  The container's max size is set by
    // the .stage-viewport defaults (770 px wide, 420 px tall).
    const containerW = 770;
    const containerH = 420;
    const surfaceScale = Math.min(containerW / widthPx, containerH / heightPx, 1);
    return (
      <div className="panel panel-stage">
        <StageFrame widthPx={widthPx} heightPx={heightPx}>
          <div className="stage-content">
            {backend === 'dom' ? (
              <RenderDom
                spec={activeAd.spec}
                layout={layout}
                showDebugOverlay={showDebugOverlay}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                palette={activeAd.palette}
                surfaceScale={surfaceScale}
              />
            ) : (
              <RenderCanvas
                spec={activeAd.spec}
                layout={layout}
                measurer={measurer}
                palette={activeAd.palette}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
              />
            )}
          </div>
        </StageFrame>
        <div className="stage-dims">
          <span className="stage-dims-label mono">{Math.round(widthPx)} × {Math.round(heightPx)}</span>
          <span className="stage-dims-unit">px</span>
        </div>
        <span className="stage-label">{label}</span>
      </div>
    );
  };

  return (
    <div className="demo-app">
      <BrandHeader activeAdLabel={activeAd.label} />

      <div className="tabs" role="tablist" aria-label="Demo tabs">
        <div className="tabs-indicator" aria-hidden="true" />
        {(['demo', 'guide'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            id={`tab-${t}`}
            className={`tabs-item${tab === t ? ' is-active' : ''}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {t === 'demo' ? 'Live demo' : 'Guide'}
          </button>
        ))}
      </div>

      {tab === 'guide' ? (
        <div role="tabpanel" id="panel-guide" aria-labelledby="tab-guide">
          <GuideTab onBack={() => setTab('demo')} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-demo" aria-labelledby="tab-demo">
          <DemoErrorBoundary>
          <span className="demo-section-label">Creative</span>
          <AdPicker
            ads={ads}
            selectedKey={adKey}
            onSelect={(key) => {
              setAdKey(key);
              setSelectedElementId(null);
              scheduleUrlSync('ad');
            }}
          />

          <span className="demo-section-label">Surface</span>
          <SurfacePicker
            surfaces={surfaces}
            selectedKey={selection.kind === 'shipped' ? selection.key : ''}
            onSelect={(key) => {
              setSelection({ kind: 'shipped', key });
              scheduleUrlSync('surface');
            }}
          />

          <div className="demo-layout">
            <div className="demo-column">
              {showComparison ? (
                <>
                  {renderStage(BEFORE_PROFILE.widthPx, BEFORE_PROFILE.heightPx, beforeLayout, 'Before — fixed (320×480)')}
                  {renderStage(activeProfile.widthPx, activeProfile.heightPx, layout, 'After — adaptive')}
                </>
              ) : (
                renderStage(activeProfile.widthPx, activeProfile.heightPx, layout, '')
              )}

              <CustomSurfacePanel
                activeProfile={activeProfile}
                syncKey={selection.kind === 'shipped' ? selection.key : 'custom'}
                activeLabel={activeLabel}
                onResolve={(profile) => {
                  setCustomProfile(profile);
                  setSelection({ kind: 'custom' });
                  scheduleUrlSync('surface');
                }}
              />
            </div>

            <div className="demo-column demo-column-sticky">
              <section className="panel panel-readout">
                <div className="panel-head">
                  <h2>Resolution summary</h2>
                </div>
                <div className="status-row">
                  <span className={`status ${layout.status}`}>{layout.status}</span>
                  <span className="mono">{layout.templateId}</span>
                  <InfoTooltip text="ok = nothing degraded. degraded = some elements shrank or moved but every hard constraint was met. constrained = the surface was too small to satisfy every hard constraint even after every fallback." />
                </div>
                <dl className="kv">
                  <dt>
                    Aspect
                    <InfoTooltip text="The usable area's width÷height, and which of five bands it falls into. This alone decides which composition template gets used — never the surface's name." />
                  </dt>
                  <dd className="mono">{layout.diagnostics.surfaceSummary.aspect.toFixed(2)}</dd>
                  <dt>
                    Aspect class
                    <InfoTooltip text="The usable area's width÷height, and which of five bands it falls into. This alone decides which composition template gets used — never the surface's name." />
                  </dt>
                  <dd className="mono">{layout.aspectClass}</dd>
                  <dt>
                    Scale class
                    <InfoTooltip text="How much room there actually is, based on the shorter side. This decides how many elements the template even attempts — not how they're arranged." />
                  </dt>
                  <dd className="mono">{layout.scaleClass}</dd>
                </dl>
              </section>

              {backend === 'dom' ? (
                <ElementInspector spec={activeAd.spec} layout={layout} selectedId={selectedElementId} />
              ) : (
                <section className="panel panel-readout">
                  <div className="panel-head">
                    <h2>Element inspector</h2>
                  </div>
                  <div className="empty">
                    <p className="empty-title">Inspector shows DOM-only data</p>
                    <p className="empty-hint">Click an element on the canvas to select it — the full element inspector works with the DOM renderer.</p>
                  </div>
                </section>
              )}

              <DiagnosticsPanel layout={layout} benchmarkStats={benchmarkStats} onRunBenchmark={runBenchmark} benchmarking={benchmarking} stressResult={stressResult} onStressTest={runStressTest} stressRunning={stressRunning} />
            </div>
          </div>

          <div className="stage-bar">
            <div className="segmented" role="radiogroup" aria-label="Renderer">
              {(['dom', 'canvas'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={backend === b}
                  className={`segmented-item${backend === b ? ' is-active' : ''}`}
                  onClick={() => { setBackend(b); scheduleUrlSync('renderer'); }}
                >
                  {b === 'dom' ? 'DOM' : 'Canvas'}
                </button>
              ))}
              <InfoTooltip text="Two independent rendering backends consuming the exact same resolved layout — proof a new renderer doesn't require touching the algorithm." />
            </div>
            {backend === 'dom' && (
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showDebugOverlay}
                  onChange={(e) => { setShowDebugOverlay(e.target.checked); scheduleUrlSync('debug'); }}
                />
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-label">Debug overlay</span>
                <InfoTooltip text="Draws the template's zone boundaries (dashed) and each element's bounding box (solid), so you can see the structure the resolver computed." />
              </label>
            )}
            <label className="switch">
              <input
                type="checkbox"
                checked={showComparison}
                onChange={(e) => { setShowComparison(e.target.checked); scheduleUrlSync('compare'); }}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">Compare</span>
              <InfoTooltip text="Shows the fixed baseline layout (mobilePortrait) side by side with the current adaptive layout, so you can see the difference adaptive rendering makes." />
            </label>
          </div>
          </DemoErrorBoundary>
        </div>
      )}

    </div>
  );
}
