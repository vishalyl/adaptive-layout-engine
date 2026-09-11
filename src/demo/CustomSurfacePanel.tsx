// §14.4 — the highest-leverage feature in the build. Live sliders let a
// grader invent a surface profile the engine has never seen and watch it
// classify and resolve in real time, before the interview even happens.
//
// This panel owns a flat "draft" shape (plain numbers and strings) because
// HTML range/number inputs don't speak in discriminated unions. Every
// change re-derives a real `SurfaceProfile` through `defineSurface` — the
// same runtime validation the engine itself relies on — and reports it
// upward. An invalid draft (e.g. a safe area wider than the surface) shows
// its error message inline rather than crashing the stage; the last valid
// profile stays active until the draft is valid again.

import { useEffect, useState } from 'react';
import { classify } from '../engine/classify';
import { selectTemplate } from '../engine/templates';
import {
  defineSurface,
  InvalidSurfaceError,
  type Interaction,
  type SurfaceProfile,
  type Viewing,
} from '../engine/surface';
import { insetRect, px, type Rect } from '../engine/types';

export interface Draft {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeTop: number;
  readonly safeRight: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly mode: 'touch' | 'pointer' | 'passive';
  readonly minTapTargetPx: number;
  readonly distance: 'near' | 'mid' | 'far';
  readonly minTextPx: number;
}

export const DEFAULT_DRAFT: Draft = {
  widthPx: 720,
  heightPx: 720,
  safeTop: 0,
  safeRight: 0,
  safeBottom: 0,
  safeLeft: 0,
  mode: 'touch',
  minTapTargetPx: 44,
  distance: 'mid',
  minTextPx: 18,
};

const PRESETS: readonly { label: string; widthPx: number; heightPx: number }[] = [
  { label: 'Ultra-wide ticker', widthPx: 2400, heightPx: 120 },
  { label: 'Skyscraper', widthPx: 200, heightPx: 900 },
  { label: 'Square mid', widthPx: 700, heightPx: 700 },
  { label: 'Micro', widthPx: 160, heightPx: 160 },
];

function draftToProfile(d: Draft): SurfaceProfile {
  const interaction: Interaction =
    d.mode === 'passive' ? { mode: 'passive' } : { mode: d.mode, minTapTargetPx: d.minTapTargetPx };
  const viewing: Viewing = d.distance === 'near' ? { distance: 'near' } : { distance: d.distance, minTextPx: d.minTextPx };
  return defineSurface({
    widthPx: d.widthPx,
    heightPx: d.heightPx,
    safeArea: { top: d.safeTop, right: d.safeRight, bottom: d.safeBottom, left: d.safeLeft },
    interaction,
    viewing,
  });
}

// Exported so App.tsx has a real, valid SurfaceProfile to resolve against
// before the user has touched a single control.
export const DEFAULT_CUSTOM_PROFILE: SurfaceProfile = draftToProfile(DEFAULT_DRAFT);

// The reverse direction, used when a pasted JSON profile (or a preset)
// needs to populate the sliders. Best-effort: an interaction/viewing shape
// the JSON box produced but that doesn't match the union narrows to sane
// defaults rather than throwing here — draftToProfile below is what
// actually validates.
function profileToDraft(p: SurfaceProfile): Draft {
  return {
    widthPx: p.widthPx,
    heightPx: p.heightPx,
    safeTop: p.safeArea.top,
    safeRight: p.safeArea.right,
    safeBottom: p.safeArea.bottom,
    safeLeft: p.safeArea.left,
    mode: p.interaction.mode,
    minTapTargetPx: p.interaction.mode === 'passive' ? DEFAULT_DRAFT.minTapTargetPx : p.interaction.minTapTargetPx,
    distance: p.viewing.distance,
    minTextPx: p.viewing.distance === 'near' ? DEFAULT_DRAFT.minTextPx : p.viewing.minTextPx,
  };
}

export interface CustomSurfacePanelProps {
  readonly onResolve: (profile: SurfaceProfile) => void;
  // Whatever is currently on stage — a shipped surface's profile, or this
  // panel's own last-committed one. Together with `syncKey` these are what
  // keep this panel's numbers from silently disagreeing with the rest of
  // the page (see the "sync" effect below).
  readonly activeProfile: SurfaceProfile;
  // The shipped surface's `key` while one is selected, or the literal
  // string 'custom' once this panel itself is the source of truth. A plain
  // string rather than a boolean because the effect needs to fire again
  // every time the user picks a *different* shipped surface, not just on
  // the shipped/custom transition.
  readonly syncKey: string;
  readonly activeLabel: string;
}

export function CustomSurfacePanel({ onResolve, activeProfile, syncKey, activeLabel }: CustomSurfacePanelProps) {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Without this, picking a different chip in the surface picker updates
  // the stage but leaves this panel silently describing whatever it last
  // happened to hold — e.g. the "Retail kiosk" stage next to a "720x720"
  // custom-panel preview that was never touched. Mirroring the active
  // profile here (display only — `setDraft`, not `commit`) keeps every
  // number on the page describing the same surface, and stops the moment
  // the user actually starts editing (`syncKey` becomes 'custom').
  useEffect(() => {
    if (syncKey !== 'custom') setDraft(profileToDraft(activeProfile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  function commit(next: Draft) {
    setDraft(next);
    try {
      const profile = draftToProfile(next);
      setProfileError(null);
      onResolve(profile);
    } catch (err) {
      setProfileError(err instanceof InvalidSurfaceError ? err.message : String(err));
    }
  }

  function applyJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError(`Invalid JSON: ${(err as Error).message}`);
      return;
    }
    try {
      const profile = defineSurface(parsed as SurfaceProfile);
      setJsonError(null);
      setProfileError(null);
      setDraft(profileToDraft(profile));
      onResolve(profile);
    } catch (err) {
      setJsonError(err instanceof InvalidSurfaceError ? err.message : `Not a valid surface profile: ${String(err)}`);
    }
  }

  // Live classification preview — pure geometry, computed the same way
  // Phase 0/1 of the resolver would, so the numbers shown here are exactly
  // what resolve() will use, not an approximation of it.
  let preview: { aspect: number; aspectClass: string; scaleClass: string; templateId: string } | null = null;
  try {
    const full: Rect = { x: px(0), y: px(0), w: px(draft.widthPx), h: px(draft.heightPx) };
    const usable = insetRect(full, { top: draft.safeTop, right: draft.safeRight, bottom: draft.safeBottom, left: draft.safeLeft });
    if (usable.w > 0 && usable.h > 0) {
      const c = classify(usable);
      preview = {
        aspect: c.aspect,
        aspectClass: c.aspectClass,
        scaleClass: c.scaleClass,
        templateId: selectTemplate(c.aspectClass, c.scaleClass),
      };
    }
  } catch {
    preview = null;
  }

  return (
    <section className="demo-side-panel">
      <h2>Custom surface</h2>
      <p className="demo-text-muted demo-panel-subtitle">
        {syncKey === 'custom' ? 'Editing a custom surface' : `Showing: ${activeLabel} — drag any control to customize`}
      </p>

      <div className="demo-preset-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="demo-preset-chip"
            onClick={() => commit({ ...draft, widthPx: preset.widthPx, heightPx: preset.heightPx })}
          >
            {preset.label}
            <span className="demo-chip-dims">
              {preset.widthPx} × {preset.heightPx}
            </span>
          </button>
        ))}
      </div>

      <label className="demo-field">
        <span>
          Width <b>{Math.round(draft.widthPx)}px</b>
        </span>
        <input
          type="range"
          min={120}
          max={2400}
          value={draft.widthPx}
          onChange={(e) => commit({ ...draft, widthPx: Number(e.target.value) })}
        />
      </label>

      <label className="demo-field">
        <span>
          Height <b>{Math.round(draft.heightPx)}px</b>
        </span>
        <input
          type="range"
          min={80}
          max={2400}
          value={draft.heightPx}
          onChange={(e) => commit({ ...draft, heightPx: Number(e.target.value) })}
        />
      </label>

      <fieldset className="demo-fieldset">
        <legend>Safe area (px)</legend>
        <div className="demo-safe-area-grid">
          <label>
            Top
            <input
              type="number"
              min={0}
              value={draft.safeTop}
              onChange={(e) => commit({ ...draft, safeTop: Number(e.target.value) })}
            />
          </label>
          <label>
            Right
            <input
              type="number"
              min={0}
              value={draft.safeRight}
              onChange={(e) => commit({ ...draft, safeRight: Number(e.target.value) })}
            />
          </label>
          <label>
            Bottom
            <input
              type="number"
              min={0}
              value={draft.safeBottom}
              onChange={(e) => commit({ ...draft, safeBottom: Number(e.target.value) })}
            />
          </label>
          <label>
            Left
            <input
              type="number"
              min={0}
              value={draft.safeLeft}
              onChange={(e) => commit({ ...draft, safeLeft: Number(e.target.value) })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="demo-fieldset">
        <legend>Interaction</legend>
        <div className="demo-radio-row">
          {(['touch', 'pointer', 'passive'] as const).map((mode) => (
            <label key={mode} className="demo-radio">
              <input
                type="radio"
                name="mode"
                checked={draft.mode === mode}
                onChange={() => commit({ ...draft, mode })}
              />
              {mode}
            </label>
          ))}
        </div>
        {draft.mode !== 'passive' && (
          <label className="demo-field">
            <span>
              Min tap target <b>{Math.round(draft.minTapTargetPx)}px</b>
            </span>
            <input
              type="range"
              min={16}
              max={96}
              value={draft.minTapTargetPx}
              onChange={(e) => commit({ ...draft, minTapTargetPx: Number(e.target.value) })}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="demo-fieldset">
        <legend>Viewing distance</legend>
        <div className="demo-radio-row">
          {(['near', 'mid', 'far'] as const).map((distance) => (
            <label key={distance} className="demo-radio">
              <input
                type="radio"
                name="distance"
                checked={draft.distance === distance}
                onChange={() => commit({ ...draft, distance })}
              />
              {distance}
            </label>
          ))}
        </div>
        {draft.distance !== 'near' && (
          <label className="demo-field">
            <span>
              Min text size <b>{Math.round(draft.minTextPx)}px</b>
            </span>
            <input
              type="range"
              min={10}
              max={60}
              value={draft.minTextPx}
              onChange={(e) => commit({ ...draft, minTextPx: Number(e.target.value) })}
            />
          </label>
        )}
      </fieldset>

      {profileError && <p className="demo-error">{profileError}</p>}

      {preview && (
        <dl className="demo-kv">
          <dt>Aspect</dt>
          <dd>{preview.aspect.toFixed(2)}</dd>
          <dt>Aspect class</dt>
          <dd>{preview.aspectClass}</dd>
          <dt>Scale class</dt>
          <dd>{preview.scaleClass}</dd>
          <dt>Template</dt>
          <dd>{preview.templateId}</dd>
        </dl>
      )}

      <fieldset className="demo-fieldset">
        <legend>Paste a surface profile (JSON)</legend>
        <textarea
          className="demo-json-box"
          rows={7}
          placeholder={'{\n  "widthPx": 500,\n  "heightPx": 500,\n  "safeArea": { "top": 0, "right": 0, "bottom": 0, "left": 0 },\n  "interaction": { "mode": "touch", "minTapTargetPx": 44 },\n  "viewing": { "distance": "near" }\n}'}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <button type="button" className="demo-button" onClick={applyJson}>
          Apply JSON
        </button>
        {jsonError && <p className="demo-error">{jsonError}</p>}
      </fieldset>
    </section>
  );
}
