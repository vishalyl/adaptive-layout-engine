// §16.3 — the headline test. 2000 randomly generated surfaces — width,
// height, safe area, interaction mode, and text floor all randomised —
// resolved against the real KEEL creative, asserting zero overlaps, zero
// out-of-bounds placements, and no undocumented hard-constraint violation.
//
// The resolver is fuzzed against 2000 randomly generated surfaces on every
// test run; the invariant is that no combination of dimensions and
// constraints can produce an overlap or a clip.

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/engine/resolver';
import { defineSurface, type SurfaceProfile } from '../src/engine/surface';
import { keelAd } from '../src/demo/creative';

// A tiny seeded PRNG (mulberry32) — deterministic and dependency-free, so a
// failure is reproducible from the printed seed alone, with no external
// randomness source involved.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, options: readonly T[]): T {
  return options[Math.floor(rand() * options.length)]!;
}

function randomSurface(rand: () => number): SurfaceProfile {
  const widthPx = 120 + rand() * (2400 - 120);
  const heightPx = 80 + rand() * (2400 - 80);

  // Each safe-area edge is at most 30% of its axis, so the sum of opposing
  // edges never exceeds 60% of that axis — always comfortably inside what
  // defineSurface accepts, and always leaves a positive usable rect.
  const safeArea = {
    top: rand() * heightPx * 0.3,
    bottom: rand() * heightPx * 0.3,
    left: rand() * widthPx * 0.3,
    right: rand() * widthPx * 0.3,
  };

  const mode = pick(rand, ['touch', 'pointer', 'passive'] as const);
  const interaction =
    mode === 'passive' ? ({ mode: 'passive' } as const) : ({ mode, minTapTargetPx: 24 + rand() * 60 } as const);

  const distance = pick(rand, ['near', 'mid', 'far'] as const);
  const viewing =
    distance === 'near' ? ({ distance: 'near' } as const) : ({ distance, minTextPx: 10 + rand() * 40 } as const);

  return defineSurface({ widthPx, heightPx, safeArea, interaction, viewing });
}

const ITERATIONS = 2000;
const SEED = process.env['FUZZ_SEED'] ? Number(process.env['FUZZ_SEED']) : 424242;

describe(`fuzz — ${ITERATIONS} random surfaces (seed ${SEED})`, () => {
  it('never overlaps, never places an element out of bounds, and never leaves an undocumented hard-constraint violation', () => {
    // eslint-disable-next-line no-console
    console.log(`fuzz seed: ${SEED} (rerun with FUZZ_SEED=${SEED} to reproduce exactly)`);
    const rand = mulberry32(SEED);

    for (let i = 0; i < ITERATIONS; i++) {
      const profile = randomSurface(rand);
      const context = () =>
        `iteration ${i}, seed ${SEED}\nsurface: ${JSON.stringify(profile)}\n` +
        `(rerun with FUZZ_SEED=${SEED} to reproduce)`;

      let layout: ReturnType<typeof resolve>;
      try {
        layout = resolve(keelAd, profile);
      } catch (err) {
        throw new Error(`resolve() threw at ${context()}\n\n${(err as Error).message}`);
      }

      // Overlap and out-of-bounds must NEVER happen, degraded or
      // constrained or not — §10.5 is explicit that clipping is never
      // acceptable.
      const structural = layout.diagnostics.violations.filter(
        (v) => v.severity === 'error' && (v.kind === 'overlap' || v.kind === 'out-of-bounds'),
      );
      expect(structural, `structural violation(s) at ${context()}: ${JSON.stringify(structural)}`).toEqual([]);

      // A hard floor (tap target / text / scan) violation is only ever
      // acceptable as the explicitly-flagged §10.5 compromise on a genuinely
      // 'constrained' surface — never on one the resolver believes is 'ok'
      // or merely 'degraded'.
      const floorViolations = layout.diagnostics.violations.filter(
        (v) => v.severity === 'error' && v.kind !== 'overlap' && v.kind !== 'out-of-bounds',
      );
      if (floorViolations.length > 0) {
        expect(
          layout.status,
          `undocumented floor violation(s) at ${context()}: ${JSON.stringify(floorViolations)}`,
        ).toBe('constrained');
      }
    }
  });
});
