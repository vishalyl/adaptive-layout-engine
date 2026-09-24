// The headline robustness test: every shipped ad against randomly
// generated surfaces — width, height, safe area, interaction mode and text
// floor all randomised — asserting no overlap, nothing out of bounds, and
// no hard-floor violation except as the explicitly flagged 'constrained'
// last resort. Seeded, so any failure is reproducible from the printed seed.

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolver';
import { defineSurface, type SurfaceProfile } from '../src/engine/surface';
import { ads } from '../src/demo/creatives';

// mulberry32 — a tiny deterministic PRNG.
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
  const safeArea = {
    top: rand() * heightPx * 0.3,
    bottom: rand() * heightPx * 0.3,
    left: rand() * widthPx * 0.3,
    right: rand() * widthPx * 0.3,
  };
  const mode = pick(rand, ['touch', 'pointer', 'passive'] as const);
  const interaction = mode === 'passive' ? ({ mode } as const) : ({ mode, minTapTargetPx: 24 + rand() * 60 } as const);
  const distance = pick(rand, ['near', 'mid', 'far'] as const);
  const viewing = distance === 'near' ? ({ distance } as const) : ({ distance, minTextPx: 10 + rand() * 40 } as const);
  return defineSurface({ widthPx, heightPx, safeArea, interaction, viewing });
}

const PER_AD = 400;
const SEED = process.env['FUZZ_SEED'] ? Number(process.env['FUZZ_SEED']) : 424242;

describe(`fuzz — ${PER_AD} random surfaces per ad, ${ads.length} ads (seed ${SEED})`, () => {
  for (const ad of ads) {
    it(`${ad.key}: never overlaps, never leaves the surface, never breaks a floor silently`, () => {
      const rand = mulberry32(SEED);
      for (let i = 0; i < PER_AD; i++) {
        const profile = randomSurface(rand);
        const context = () => `${ad.key}, iteration ${i}, seed ${SEED}\nsurface: ${JSON.stringify(profile)}`;

        let layout: ReturnType<typeof resolve>;
        try {
          layout = resolve(ad.spec, profile);
        } catch (err) {
          throw new Error(`resolve() threw at ${context()}\n\n${(err as Error).message}`);
        }

        const structural = layout.diagnostics.violations.filter(
          (v) => v.severity === 'error' && (v.kind === 'overlap' || v.kind === 'out-of-bounds'),
        );
        expect(structural, `structural violation at ${context()}`).toEqual([]);

        const floors = layout.diagnostics.violations.filter((v) => v.severity === 'error');
        if (floors.length > 0) {
          expect(layout.status, `undocumented floor violation at ${context()}: ${JSON.stringify(floors)}`).toBe('constrained');
        }

        for (const step of layout.diagnostics.rungsApplied) {
          expect(step.overflowAfter, `a step that didn't help, at ${context()}`).toBeLessThan(step.overflowBefore);
        }
      }
    });
  }
});
