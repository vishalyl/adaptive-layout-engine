// Coverage for every shipped ad, not just KEEL. `defineAd` itself already enforces "exactly one
// primary, exactly one action, unique ids" at construction time, so the
// main thing worth asserting per-ad here is that resolve() doesn't throw
// and produces zero validator violations across every shipped surface —
// mirrors the existing keelAd coverage in resolver.spec.ts.

import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolver';
import { ads } from '../src/demo/creatives';
import { surfaces } from '../src/surfaces';

describe('resolve — every shipped ad × every shipped surface', () => {
  for (const { key: adKey, spec } of ads) {
    for (const { key: surfaceKey, profile } of surfaces) {
      it(`resolves "${adKey}" on "${surfaceKey}" without throwing`, () => {
        expect(() => resolve(spec, profile)).not.toThrow();
      });

      it(`resolves "${adKey}" on "${surfaceKey}" with zero validator violations`, () => {
        const layout = resolve(spec, profile);
        expect(layout.diagnostics.violations, `violations for "${adKey}" on "${surfaceKey}"`).toEqual([]);
      });

      it(`places every 'fixed' element for "${adKey}" on "${surfaceKey}"`, () => {
        const layout = resolve(spec, profile);
        const fixedIds = spec.elements.filter((el) => el.degradability === 'fixed').map((el) => el.id);
        for (const id of fixedIds) {
          const entry = layout.elements[id];
          expect(entry?.placed, `expected fixed element "${id}" to be placed`).toBe(true);
        }
      });
    }
  }
});
