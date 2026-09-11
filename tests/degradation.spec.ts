// §16.2 — the degradation ladder's correctness tests. This is described in
// BUILD_SPEC.md as "the single most valuable test in the suite," so it gets
// both a pure unit-level treatment of the two functions the ladder is built
// from (nextRung, selectVictim) and an integration-level treatment against
// resolve() itself.
//
// A note on the drop-order example: BUILD_SPEC.md §16.2 suggests asserting
// an exact drop order ("legal -> badge -> qr -> logo") on "a shrinking
// kiosk," with the explicit instruction to fix the test to whatever the
// real, designed order turns out to be. Empirically, the KEEL creative on
// the shipped `retailKiosk` profile mostly resolves shrinking demand via
// SHRINK_STEP/REFLOW alone (our zones are generous enough), and below the
// 'large' scale class badge/qr/legal simply leave `ambition` outright — a
// different, earlier-and-blunter mechanism for the same "low priority goes
// first" intent, not a ladder-driven DROP. To test the ladder's actual DROP
// behaviour precisely, this file uses a small purpose-built fixture spec
// that forces genuine, simultaneous overflow across every priority level —
// that is what BUILD_SPEC.md's own instruction is asking for: the real,
// verified order, not the illustrative one.

import { describe, expect, it } from 'vitest';
import { defineAd } from '../src/engine/spec';
import { defineSurface } from '../src/engine/surface';
import { resolve } from '../src/engine/resolver';
import { nextRung, selectVictim, type DegradableState, type DegradationCandidate } from '../src/engine/degradation';
import { keelAd } from '../src/demo/creative';
import { surfaces } from '../src/demo/surfaces';

// ---------------------------------------------------------------------------
// Unit tests: nextRung — one assertion per row of the §10.2 ladder table.
// ---------------------------------------------------------------------------

const baseState: DegradableState = {
  degradability: 'shrinkable',
  isText: true,
  isScan: false,
  atFloor: false,
  linesAboveOne: false,
  ellipsisApplied: false,
  zonesRemaining: false,
};

describe('nextRung', () => {
  it('returns SHRINK_STEP while not at floor, for every degradability', () => {
    for (const degradability of ['fixed', 'shrinkable', 'droppable'] as const) {
      expect(nextRung({ ...baseState, degradability, atFloor: false })).toBe('SHRINK_STEP');
    }
  });

  it('fixed: goes straight from floor to REFLOW, skipping TRUNCATE_LINE/ELLIPSIS', () => {
    const state: DegradableState = { ...baseState, degradability: 'fixed', atFloor: true, linesAboveOne: true, zonesRemaining: true };
    expect(nextRung(state)).toBe('REFLOW');
  });

  it('fixed: returns null (stop) once at floor with no zones left — never DROP', () => {
    const state: DegradableState = { ...baseState, degradability: 'fixed', atFloor: true, linesAboveOne: true, zonesRemaining: false };
    expect(nextRung(state)).toBeNull();
  });

  it('shrinkable: TRUNCATE_LINE before ELLIPSIS before REFLOW', () => {
    const atFloor: DegradableState = { ...baseState, degradability: 'shrinkable', atFloor: true, linesAboveOne: true, zonesRemaining: true };
    expect(nextRung(atFloor)).toBe('TRUNCATE_LINE');

    const oneLine: DegradableState = { ...atFloor, linesAboveOne: false, ellipsisApplied: false };
    expect(nextRung(oneLine)).toBe('ELLIPSIS');

    const ellipsised: DegradableState = { ...oneLine, ellipsisApplied: true };
    expect(nextRung(ellipsised)).toBe('REFLOW');
  });

  it('shrinkable: stops (null) after REFLOW is exhausted — never DROP', () => {
    const state: DegradableState = {
      ...baseState,
      degradability: 'shrinkable',
      atFloor: true,
      linesAboveOne: false,
      ellipsisApplied: true,
      zonesRemaining: false,
    };
    expect(nextRung(state)).toBeNull();
  });

  it('droppable: TRUNCATE_LINE then REFLOW then DROP, with no ELLIPSIS in between', () => {
    const atFloor: DegradableState = { ...baseState, degradability: 'droppable', atFloor: true, linesAboveOne: true, zonesRemaining: true };
    expect(nextRung(atFloor)).toBe('TRUNCATE_LINE');

    const oneLine: DegradableState = { ...atFloor, linesAboveOne: false };
    expect(nextRung(oneLine)).toBe('REFLOW');

    const noZonesLeft: DegradableState = { ...oneLine, zonesRemaining: false };
    expect(nextRung(noZonesLeft)).toBe('DROP');
  });

  it('scan: skips SHRINK_STEP entirely, going straight to REFLOW then DROP', () => {
    const scanState: DegradableState = {
      degradability: 'droppable',
      isText: false,
      isScan: true,
      atFloor: false, // irrelevant for scan — SHRINK_STEP must never be offered regardless
      linesAboveOne: false,
      ellipsisApplied: false,
      zonesRemaining: true,
    };
    expect(nextRung(scanState)).toBe('REFLOW');
    expect(nextRung({ ...scanState, zonesRemaining: false })).toBe('DROP');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: selectVictim — the ordering guarantee itself.
// ---------------------------------------------------------------------------

describe('selectVictim', () => {
  it('returns null for an empty candidate list', () => {
    expect(selectVictim([])).toBeNull();
  });

  it('picks the highest priority number (worst priority) first', () => {
    const candidates: DegradationCandidate[] = [
      { id: 'a', role: 'primary', priority: 1, rungsApplied: 0 },
      { id: 'b', role: 'legal', priority: 5, rungsApplied: 0 },
      { id: 'c', role: 'secondary', priority: 3, rungsApplied: 0 },
    ];
    expect(selectVictim(candidates)?.id).toBe('b');
  });

  it('within the same priority, prefers the one with fewer rungs already applied', () => {
    const candidates: DegradationCandidate[] = [
      { id: 'a', role: 'legal', priority: 5, rungsApplied: 3 },
      { id: 'b', role: 'legal', priority: 5, rungsApplied: 1 },
    ];
    expect(selectVictim(candidates)?.id).toBe('b');
  });

  it('breaks a full tie (priority and rungsApplied equal) deterministically by role', () => {
    const candidates: DegradationCandidate[] = [
      { id: 'a', role: 'scan', priority: 4, rungsApplied: 0 },
      { id: 'b', role: 'incentive', priority: 4, rungsApplied: 0 },
    ];
    // incentive ranks before scan in the suffer order (degradation.ts) —
    // run it many times shuffled to prove it is not accidentally stable-by-input-order.
    for (let i = 0; i < 5; i++) {
      const shuffled = i % 2 === 0 ? candidates : [...candidates].reverse();
      expect(selectVictim(shuffled)?.id).toBe('b');
    }
  });

  it('never picks a candidate with a strictly better priority when a worse one is available', () => {
    // A property check across many random candidate sets: the winner's
    // priority must always be >= every other candidate's priority.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const roles = ['hero', 'primary', 'secondary', 'action', 'branding', 'incentive', 'legal', 'scan'] as const;

    for (let trial = 0; trial < 200; trial++) {
      const count = 1 + Math.floor(rand() * 6);
      const candidates: DegradationCandidate[] = Array.from({ length: count }, (_, i) => ({
        id: `c${i}`,
        role: roles[Math.floor(rand() * roles.length)]!,
        priority: (1 + Math.floor(rand() * 5)) as DegradationCandidate['priority'],
        rungsApplied: Math.floor(rand() * 4),
      }));
      const winner = selectVictim(candidates)!;
      for (const c of candidates) {
        expect(winner.priority).toBeGreaterThanOrEqual(c.priority);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: the priority invariant, stated exactly as BUILD_SPEC.md §10.3
// does — "no element of priority P has a rung applied while any element of
// priority greater than P still has a rung remaining" — checked against the
// full recorded rung sequence from real resolve() calls.
// ---------------------------------------------------------------------------

function assertPriorityInvariant(
  layout: ReturnType<typeof resolve>,
  elements: readonly { readonly id: string; readonly priority: number }[],
): void {
  const priorityById = new Map(elements.map((e) => [e.id, e.priority]));
  let bestPriorityTouched = Number.POSITIVE_INFINITY;
  for (const record of layout.diagnostics.rungsApplied) {
    const priority = priorityById.get(record.id)!;
    expect(
      priority,
      `@iteration ${record.atIteration}: "${record.id}" (priority ${priority}) received a rung after ` +
        `priority ${bestPriorityTouched} had already been touched — a better-priority element should ` +
        `never be reached before every worse-priority candidate is exhausted.`,
    ).toBeLessThanOrEqual(bestPriorityTouched);
    bestPriorityTouched = Math.min(bestPriorityTouched, priority);
  }
}

describe('the priority invariant', () => {
  it('holds for the KEEL creative on every shipped surface', () => {
    for (const { profile } of surfaces) {
      assertPriorityInvariant(resolve(keelAd, profile), keelAd.elements);
    }
  });

  it('holds under an artificially inflated densityScale (forces heavier degradation)', () => {
    for (const { profile } of surfaces) {
      assertPriorityInvariant(resolve(keelAd, { ...profile, densityScale: 5 }), keelAd.elements);
    }
  });

  // A purpose-built fixture: five text elements, one per priority level
  // 1-5, all oversized enough that every one of their (separate) zones
  // overflows simultaneously on a 900x1200 surface. This forces the loop to
  // repeatedly choose among *competing* zones, which is what actually
  // exercises selectVictim's cross-zone ordering — the shipped creative
  // rarely creates that much simultaneous contention.
  const fixture = defineAd({
    name: 'degradation ladder fixture',
    elements: [
      {
        id: 'primary', type: 'text', role: 'primary', priority: 1, degradability: 'fixed',
        content: 'PRIMARY PRIMARY PRIMARY PRIMARY', idealFontPx: 200, minFontPx: 120, maxLines: 2, weight: 700,
      },
      {
        id: 'action', type: 'text', role: 'action', priority: 2, degradability: 'fixed',
        content: 'ACTION ACTION ACTION ACTION', idealFontPx: 200, minFontPx: 120, maxLines: 2, weight: 700,
      },
      {
        id: 'secondary', type: 'text', role: 'secondary', priority: 3, degradability: 'shrinkable',
        content: 'SECONDARY SECONDARY SECONDARY', idealFontPx: 200, minFontPx: 60, maxLines: 3, weight: 700,
      },
      {
        id: 'incentive', type: 'text', role: 'incentive', priority: 4, degradability: 'droppable',
        content: 'INCENTIVE INCENTIVE INCENTIVE', idealFontPx: 200, minFontPx: 60, maxLines: 3, weight: 700,
      },
      {
        id: 'legal', type: 'text', role: 'legal', priority: 5, degradability: 'droppable',
        content: 'LEGAL LEGAL LEGAL LEGAL LEGAL', idealFontPx: 200, minFontPx: 60, maxLines: 3, weight: 700,
      },
    ],
  });
  const fixtureSurface = defineSurface({
    widthPx: 900,
    heightPx: 1200,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    interaction: { mode: 'touch', minTapTargetPx: 44 },
    viewing: { distance: 'mid', minTextPx: 20 },
  });

  it('holds under deliberately forced multi-zone contention', () => {
    assertPriorityInvariant(resolve(fixture, fixtureSurface), fixture.elements);
  });

  it('the actual, verified drop order on this fixture: only the droppable, worst-priority ' +
    'element that never stops overflowing is dropped — legal (priority 5) fully exhausts its ' +
    'own ladder first and fits without being dropped, then incentive (priority 4) is dropped, ' +
    'and priority 1-3 never lose a single rung until 4 and 5 are fully resolved', () => {
    const layout = resolve(fixture, fixtureSurface);
    expect(layout.diagnostics.drops.map((d) => d.id)).toEqual(['incentive']);

    // primary and action (both 'fixed') are placed no matter what.
    expect(layout.elements['primary']?.placed).toBe(true);
    expect(layout.elements['action']?.placed).toBe(true);

    // Every rung applied to 'legal' happens strictly before every rung
    // applied to 'incentive', which happens strictly before 'secondary',
    // then 'action', then 'primary' — i.e. exactly priority-descending,
    // fully segregated by element rather than interleaved.
    const order = layout.diagnostics.rungsApplied.map((r) => r.id);
    const firstIndexOf = (id: string) => order.indexOf(id);
    const lastIndexOf = (id: string) => order.lastIndexOf(id);
    expect(lastIndexOf('legal')).toBeLessThan(firstIndexOf('incentive'));
    expect(lastIndexOf('incentive')).toBeLessThan(firstIndexOf('secondary'));
    expect(lastIndexOf('secondary')).toBeLessThan(firstIndexOf('action'));
    expect(lastIndexOf('action')).toBeLessThan(firstIndexOf('primary'));
  });
});

// ---------------------------------------------------------------------------
// The remaining §16.2 bullets.
// ---------------------------------------------------------------------------

describe('fixed elements are never dropped', () => {
  it('across every shipped surface, at any density', () => {
    const fixedIds = keelAd.elements.filter((el) => el.degradability === 'fixed').map((el) => el.id);
    for (const { key, profile } of surfaces) {
      for (const densityScale of [1, 3, 6]) {
        const layout = resolve(keelAd, { ...profile, densityScale });
        for (const id of fixedIds) {
          expect(layout.elements[id]?.placed, `"${id}" on "${key}" @density ${densityScale}`).toBe(true);
        }
      }
    }
  });

  it('even on an absurdly small 40x40 surface', () => {
    const profile = defineSurface({
      widthPx: 40,
      heightPx: 40,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      interaction: { mode: 'touch', minTapTargetPx: 44 },
      viewing: { distance: 'mid', minTextPx: 20 },
    });
    const layout = resolve(keelAd, profile);
    expect(layout.elements['headline']?.placed).toBe(true);
    expect(layout.elements['cta']?.placed).toBe(true);
  });
});

describe('scan never renders below its module floor', () => {
  it('every placed scan element meets modules x minModulePx on every shipped surface', () => {
    const qrSpec = keelAd.elements.find((el) => el.type === 'scan')!;
    const floor = qrSpec.type === 'scan' ? qrSpec.modules * qrSpec.minModulePx : 0;
    for (const { key, profile } of surfaces) {
      const layout = resolve(keelAd, profile);
      const entry = layout.elements['qr'];
      if (entry?.placed) {
        expect(entry.rect.w, `"qr" width on "${key}"`).toBeGreaterThanOrEqual(floor - 0.5);
        expect(entry.rect.h, `"qr" height on "${key}"`).toBeGreaterThanOrEqual(floor - 0.5);
      }
      // If not placed, it must be because it was excluded or dropped —
      // never because it silently rendered undersized. `placed: false` is
      // exactly the honest alternative to a broken QR.
    }
  });
});
