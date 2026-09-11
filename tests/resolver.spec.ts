// §16.1. Does the resolver actually run, on every shipped surface, without
// throwing, place every 'fixed' element, produce zero validator violations,
// select the expected template, and resolve deterministically?

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/engine/resolver';
import { defineSurface } from '../src/engine/surface';
import { keelAd } from '../src/demo/creative';
import { surfaces } from '../src/demo/surfaces';

describe('resolve — every shipped surface', () => {
  for (const { key, profile } of surfaces) {
    it(`resolves "${key}" without throwing`, () => {
      expect(() => resolve(keelAd, profile)).not.toThrow();
    });

    it(`places every 'fixed' element on "${key}"`, () => {
      const layout = resolve(keelAd, profile);
      const fixedIds = keelAd.elements.filter((el) => el.degradability === 'fixed').map((el) => el.id);
      for (const id of fixedIds) {
        const entry = layout.elements[id];
        expect(entry?.placed, `expected fixed element "${id}" to be placed on "${key}"`).toBe(true);
      }
    });

    it(`produces a non-empty rect for every placed element on "${key}"`, () => {
      const layout = resolve(keelAd, profile);
      for (const entry of Object.values(layout.elements)) {
        if (entry!.placed) {
          expect(entry!.rect.w).toBeGreaterThan(0);
          expect(entry!.rect.h).toBeGreaterThan(0);
        }
      }
    });

    it(`resolves "${key}" with zero validator violations`, () => {
      const layout = resolve(keelAd, profile);
      expect(layout.diagnostics.violations, `violations on "${key}"`).toEqual([]);
    });
  }
});

describe('resolve — determinism', () => {
  it('resolving the same input twice yields deep-equal output', () => {
    const cramped = surfaces.find((s) => s.key === 'cramped')!;
    const a = resolve(keelAd, cramped.profile);
    const b = resolve(keelAd, cramped.profile);
    // Timing fields are expected to differ between runs; compare everything else.
    const strip = (layout: typeof a) => ({ ...layout, diagnostics: { ...layout.diagnostics, resolveMs: 0 } });
    expect(strip(a)).toEqual(strip(b));
  });
});

describe('resolve — template selection', () => {
  it('selects the expected template for each shipped surface', () => {
    const expected: Record<string, string> = {
      mobilePortrait: 'stack-vertical',
      mobileLandscape: 'split-horizontal',
      broadcastLowerThird: 'band-horizontal',
      retailKiosk: 'grid-square',
      printPanel: 'column-narrow',
      // 300x100 has aspect 3.0 — inside [1.35, 3.5), so 'wide', not
      // 'ultra-wide'; it's a stress case for *scale* (min side 100px is
      // 'small'), not for aspect classification.
      cramped: 'split-horizontal',
    };
    for (const { key, profile } of surfaces) {
      const layout = resolve(keelAd, profile);
      expect(layout.templateId, `surface "${key}"`).toBe(expected[key]);
    }
  });
});

// §16.6 — the direct refutation of "uniform scaling passed off as
// adaptation." Two surfaces with the SAME area but very different aspect
// must produce a genuinely different composition, not a scaled copy of the
// same one — different template, and a different top-to-bottom order of
// where elements actually sit.
describe('resolve — recomposition, not scaling', () => {
  const wide = defineSurface({
    widthPx: 1600,
    heightPx: 200,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    interaction: { mode: 'passive' },
    viewing: { distance: 'far', minTextPx: 24 },
  });
  const tall = defineSurface({
    widthPx: 400,
    heightPx: 800,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    interaction: { mode: 'touch', minTapTargetPx: 44 },
    viewing: { distance: 'near' },
  });

  it('1600x200 and 400x800 have identical area but different aspect', () => {
    expect(1600 * 200).toBe(400 * 800);
    expect(1600 / 200).not.toBeCloseTo(400 / 800, 1);
  });

  it('produces different templateId values for the two surfaces', () => {
    const wideLayout = resolve(keelAd, wide);
    const tallLayout = resolve(keelAd, tall);
    expect(wideLayout.templateId).not.toBe(tallLayout.templateId);
  });

  it('produces a different top-to-bottom order of element centres', () => {
    const centreYOrder = (layout: ReturnType<typeof resolve>): string[] =>
      Object.values(layout.elements)
        .filter((e): e is Extract<typeof e, { placed: true }> => e.placed)
        .sort((a, b) => a.rect.y + a.rect.h / 2 - (b.rect.y + b.rect.h / 2))
        .map((e) => e.id);

    const wideOrder = centreYOrder(resolve(keelAd, wide));
    const tallOrder = centreYOrder(resolve(keelAd, tall));
    expect(wideOrder).not.toEqual(tallOrder);
  });
});
