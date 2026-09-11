// Gate 3/4 coverage: does the resolver actually run, on every shipped
// surface, without throwing, and does it place every 'fixed' element?
//
// This file grows again at Gate 5 once validate.ts exists — that gate adds
// the zero-violations assertion across all six surfaces. For now it proves
// Phases 0-6 are wired together correctly.

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/engine/resolver';
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
