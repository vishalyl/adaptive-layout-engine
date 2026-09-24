// Contrast-aware branding placement (src/engine/contrast.ts + the contrast
// passes in resolver.ts). Three behaviours matter:
//   1. a mark that clashes with its preferred zone's backdrop is PLACED in
//      the next preferred zone that clears the floor (no rung spent);
//   2. a mark that clears the floor stays where the template wants it;
//   3. a mark that clears the floor nowhere is PLATED, never dropped, and
//      the plate lives inside its own rect (so it can't cause an overlap).
// Plus the colour maths itself and the runtime validation of colour inputs.

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolver';
import { defineAd } from '../src/spec';
import { defineSurface, InvalidSurfaceError, type SurfaceProfile } from '../src/engine/surface';
import { contrastRatio, InvalidColorError, plateFor, relativeLuminance } from '../src/engine/contrast';
import { ads } from '../src/demo/creatives';
import { surfaces } from '../src/surfaces';

const kiosk = surfaces.find((s) => s.key === 'retailKiosk')!.profile;
// The same kiosk with its top strip under a bright, lit header — only the
// backdrop differs, so any change in placement is the contrast constraint.
const litKiosk = defineSurface({ ...kiosk, backdrop: [{ x: 0, y: 0, w: 1080, h: 86, color: '#F4F4F0' }] });
const adByKey = (key: string) => ads.find((a) => a.key === key)!.spec;
// A deliberately poor mark: charcoal on Provox's own charcoal background.
const provox = adByKey('provox');
const darkMarkProvox = {
  ...provox,
  elements: provox.elements.map((e) => (e.id === 'logo' && e.type === 'image' ? { ...e, markColor: '#2D2D3E' as const } : e)),
};
// A mid-tone mark: a purple logo on a near-black background. It clears
// 3:1 against both the lit strip (~4.5:1) and its own background (~3.5:1),
// but not 4.5:1 against the latter.
const keel = adByKey('keel');
const purpleMarkKeel = {
  ...keel,
  background: '#1A1A2E' as const,
  elements: keel.elements.map((e) => (e.id === 'logo' && e.type === 'image' ? { ...e, markColor: '#6C5CE7' as const } : e)),
};
const logoOf = (layout: ReturnType<typeof resolve>) => layout.elements['logo' as never];

describe('colour maths', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('picks the plate that separates most from the mark', () => {
    expect(plateFor('#2D2D3E')).toBe('#FFFFFF');
    expect(plateFor('#F4F4F0')).toBe('#111111');
  });
});

describe('contrast-aware placement', () => {
  it('moves a light mark off a light backdrop to its next preferred zone', () => {
    const onDark = resolve(adByKey('keel'), kiosk);
    const onLit = resolve(adByKey('keel'), litKiosk);
    const before = logoOf(onDark);
    const after = logoOf(onLit);
    expect(before?.placed && before.zone).toBe('top');
    expect(after?.placed && after.zone).toBe('legal');
    expect(after?.placed && after.contrast?.plate).toBeNull();
    expect(onLit.diagnostics.decisions.some((d) => d.phase === 'contrast' && d.note.includes('"legal"'))).toBe(true);
    // Placement is not degradation: no rung was spent to move it.
    expect(after?.placed && after.appliedRungs).not.toContain('REFLOW');
  });

  it('leaves a mark that already clears the floor where the template wants it', () => {
    const layout = resolve(purpleMarkKeel, litKiosk);
    const logo = logoOf(layout);
    expect(logo?.placed && logo.zone).toBe('top');
    expect(logo?.placed && logo.contrast!.ratio).toBeGreaterThanOrEqual(3);
  });

  it('plates a mark that clears the floor in no zone — and never drops it for colour', () => {
    // A charcoal mark on a charcoal ad background (~1.3:1).
    const layout = resolve(darkMarkProvox, kiosk);
    const logo = logoOf(layout);
    expect(logo?.placed).toBe(true);
    if (!logo?.placed) return;
    expect(logo.contrast?.plate).toBe('#FFFFFF');
    expect(contrastRatio(logo.contrast!.markColor, logo.contrast!.plate!)).toBeGreaterThanOrEqual(3);
    expect(layout.diagnostics.violations).toEqual([]);
  });

  it('a higher minContrastRatio on the surface is honoured', () => {
    // The purple mark is ~3.5:1 on its own background: fine at the
    // default 3:1, plated when a surface demands 4.5:1.
    const strict: SurfaceProfile = { ...kiosk, minContrastRatio: 4.5 };
    const relaxed = logoOf(resolve(purpleMarkKeel, kiosk));
    expect(relaxed?.placed && relaxed.contrast?.plate).toBeNull();
    const logo = logoOf(resolve(purpleMarkKeel, strict));
    expect(logo?.placed && logo.contrast?.plate).not.toBeNull();
  });

  it('produces zero contrast violations for every shipped ad on every shipped surface', () => {
    for (const ad of ads) {
      for (const s of surfaces) {
        const kinds = resolve(ad.spec, s.profile).diagnostics.violations.map((v) => v.kind);
        expect(kinds, `${ad.key} on ${s.key}`).not.toContain('contrast');
      }
    }
  });
});

describe('colour inputs are validated at runtime', () => {
  it('defineAd rejects a non-hex markColor arriving as untyped data', () => {
    expect(() =>
      defineAd({
        name: 'bad',
        elements: [
          { id: 'h', type: 'text', role: 'primary', priority: 1, degradability: 'shrinkable', content: 'x', idealFontPx: 20, minFontPx: 12, maxLines: 1, weight: 700 },
          { id: 'c', type: 'button', role: 'action', priority: 1, degradability: 'fixed', label: 'Go', idealFontPx: 16, minFontPx: 12, paddingRatio: 1 },
          { id: 'l', type: 'image', role: 'branding', priority: 3, degradability: 'droppable', src: '', intrinsicAspect: 1, fit: 'contain', minShortSidePx: 24, markColor: 'teal' as `#${string}` },
        ],
      }),
    ).toThrow(InvalidColorError);
  });

  it('defineSurface rejects backdrop regions outside the surface or with bad colours', () => {
    const base = { widthPx: 400, heightPx: 400, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, interaction: { mode: 'passive' as const }, viewing: { distance: 'near' as const } };
    expect(() => defineSurface({ ...base, backdrop: [{ x: 0, y: 0, w: 500, h: 10, color: '#FFF' }] })).toThrow(InvalidSurfaceError);
    expect(() => defineSurface({ ...base, backdrop: [{ x: 0, y: 0, w: 10, h: 10, color: 'white' as `#${string}` }] })).toThrow(InvalidSurfaceError);
    expect(() => defineSurface({ ...base, minContrastRatio: 0.5 })).toThrow(InvalidSurfaceError);
  });
});
