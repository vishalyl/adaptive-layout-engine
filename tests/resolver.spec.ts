// Does the resolver actually run, on every shipped surface, without
// throwing, place every 'fixed' element, produce zero validator violations,
// select the expected template, and resolve deterministically?

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolver';
import { defineSurface } from '../src/engine/surface';
import { estimateMeasurer } from '../src/engine/measure';
import { textPaddingFor } from '../src/engine/textChrome';
import { keelAd } from '../src/demo/creative';
import { surfaces } from '../src/surfaces';
import { fernAd } from '../src/demo/creatives/fern';
import { provoxAd } from '../src/demo/creatives/provox';

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
      // 320x180 has aspect 1.78 — 'wide'. It's a stress case for space,
      // not for aspect classification.
      cramped: 'split-horizontal',
    };
    for (const { key, profile } of surfaces) {
      const layout = resolve(keelAd, profile);
      expect(layout.templateId, `surface "${key}"`).toBe(expected[key]);
    }
  });
});

// The direct refutation of "uniform scaling passed off as
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

// Regression coverage for a rendering bug found on the retail kiosk / print
// panel / compact banner surfaces: TextNode (render-dom.tsx) draws every
// text box with CSS padding on top of the resolver's rect, via
// `box-sizing: border-box` — which shrinks the box's *content* area rather
// than enlarging the box. The resolver now bakes that same padding into
// computeTextDemand/measureOccupant (textChrome.ts) so the rect it hands out
// already has room for it. These tests re-derive the padded content width
// from each placed element's own rect and independently re-wrap its text
// with the same measurer the resolver used, to catch a regression of either
// half of that fix: a box too narrow/short for what it promises to show, or
// a `truncated`/line-clamp flag that doesn't match what was actually cut.
describe('resolve — text boxes budget room for the renderer\'s own padding', () => {
  const cases = [
    { adName: 'fern', ad: fernAd, surfaceKey: 'retailKiosk' },
    { adName: 'provox', ad: provoxAd, surfaceKey: 'printPanel' },
    { adName: 'provox', ad: provoxAd, surfaceKey: 'cramped' },
  ] as const;

  for (const { adName, ad, surfaceKey } of cases) {
    const profile = surfaces.find((s) => s.key === surfaceKey)!.profile;

    it(`"${adName}" on "${surfaceKey}": every placed text box already fits its own text at its padded content width`, () => {
      const layout = resolve(ad, profile, { measurer: estimateMeasurer });
      for (const element of ad.elements) {
        if (element.type !== 'text') continue;
        const entry = layout.elements[element.id];
        // Text the resolver deliberately cut (a logged ELLIPSIS/TRUNCATE
        // step) needs more lines than it shows — that's the point.
        if (!entry?.placed || !entry.typography || entry.typography.truncated) continue;

        const pad = textPaddingFor(element.role);
        const contentWidth = Math.max(0, entry.rect.w - 2 * pad.x);
        // Re-wrapping at the box's own achieved content width reproduces the
        // exact same greedy line breaks the resolver made internally (every
        // line the resolver produced is already <= this width by
        // construction), so this is a like-for-like check, not an
        // approximation.
        const rewrapped = estimateMeasurer.measure(
          element.content,
          entry.typography.fontPx,
          element.weight,
          'Archivo, sans-serif',
          contentWidth,
        );

        expect(
          rewrapped.lines,
          `"${element.id}" on "${surfaceKey}": needs ${rewrapped.lines} line(s) to show at its resolved ` +
            `${entry.typography.fontPx}px within its padded content width (${contentWidth}px), but the box ` +
            `promises only ${entry.typography.lines} — CSS padding will clip the rest.`,
        ).toBeLessThanOrEqual(entry.typography.lines);
      }
    });

    it(`"${adName}" on "${surfaceKey}": 'truncated' is never set on content that fits without cutting`, () => {
      const layout = resolve(ad, profile, { measurer: estimateMeasurer });
      for (const element of ad.elements) {
        if (element.type !== 'text') continue;
        const entry = layout.elements[element.id];
        if (!entry?.placed || !entry.typography) continue;

        const pad = textPaddingFor(element.role);
        const contentWidth = Math.max(0, entry.rect.w - 2 * pad.x);
        const rewrapped = estimateMeasurer.measure(
          element.content,
          entry.typography.fontPx,
          element.weight,
          'Archivo, sans-serif',
          contentWidth,
        );

        // If the natural wrap needs no more lines than the box already
        // shows, nothing was cut by line count — flagging `truncated` here
        // would be the exact bug this suite guards against (comparing the
        // clamped line count against the element's original `maxLines`
        // instead of what was actually rendered).
        if (rewrapped.lines <= entry.typography.lines) {
          expect(
            entry.typography.truncated,
            `"${element.id}" on "${surfaceKey}" fits on ${entry.typography.lines} line(s) with nothing cut, but was flagged truncated`,
          ).toBe(false);
        }
      }
    });
  }
});

// What the box model buys, checked on real ads.
describe('resolve — composition from content, not fixed zones', () => {
  const kiosk = surfaces.find((s) => s.key === 'retailKiosk')!.profile;

  it('every element is attempted: on a roomy surface nothing is excluded', () => {
    const layout = resolve(keelAd, kiosk);
    for (const entry of Object.values(layout.elements)) expect(entry.placed, entry.id).toBe(true);
  });

  it('a slot with nothing in it takes no space (and is not reported)', () => {
    const cramped = surfaces.find((s) => s.key === 'cramped')!.profile;
    const layout = resolve(keelAd, cramped);
    const occupied = new Set(Object.values(layout.elements).flatMap((e) => (e.placed ? [e.zone] : [])));
    expect(layout.zones.map((z) => z.id).sort()).toEqual([...occupied].sort());
  });

  it('type grows uniformly on big surfaces only when nothing needed degrading — hierarchy intact', () => {
    const layout = resolve(keelAd, kiosk);
    expect(layout.typeScale).toBeGreaterThan(1);
    const font = (id: 'headline' | 'price' | 'legal') => {
      const e = layout.elements[id];
      return e.placed ? e.typography!.fontPx : 0;
    };
    expect(font('headline')).toBeGreaterThan(font('price'));
    expect(font('price')).toBeGreaterThan(font('legal'));
  });

  it('the hero absorbs leftover space instead of it sitting empty', () => {
    const panel = surfaces.find((s) => s.key === 'printPanel')!.profile;
    const layout = resolve(keelAd, panel);
    const hero = layout.elements.hero;
    expect(hero.placed && hero.rect.h).toBeGreaterThan(panel.heightPx * 0.4);
  });

  it('the CTA reports the label size the resolver chose, so no renderer guesses', () => {
    for (const { profile } of surfaces) {
      const cta = resolve(keelAd, profile).elements.cta;
      expect(cta.placed && cta.typography?.fontPx).toBeGreaterThan(0);
    }
  });
});
