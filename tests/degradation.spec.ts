// The degradation rule, tested three ways:
//
//   1. The two pure building blocks (degradation.ts): the ladder each
//      element may walk, and the order in which candidates are chosen.
//   2. THE RULE, checked on every single step of every resolve, straight
//      from the step log the resolver records (diagnostics.rungsApplied):
//        - every step reduced the overflow it was taken for;
//        - the victim had the worst priority of anyone with a helpful step;
//        - every worse-priority element still on the surface had been
//          examined and had NO helpful step (it's listed as `blocked`);
//        - a joint step only ever pulls in slot-mates of equal or worse
//          priority.
//      This runs over every shipped ad × surface, an inflated density,
//      and a few hundred random surfaces.
//   3. The concrete scenarios the brief names: the stress surface's drop
//      order, and a kiosk shrinking until branding must go.

import { describe, expect, it } from 'vitest';
import { defineSurface, type SurfaceProfile } from '../src/engine/surface';
import { resolve, type ResolvedLayout } from '../src/resolver';
import {
  availableRungs,
  selectVictim,
  type DegradableState,
  type DegradationCandidate,
} from '../src/engine/degradation';
import type { AdSpec } from '../src/spec';
import { ads } from '../src/demo/creatives';
import { keelAd } from '../src/demo/creative';
import { surfaces } from '../src/surfaces';

// ---------------------------------------------------------------------------
// 1a. The ladder
// ---------------------------------------------------------------------------

const text: DegradableState = {
  degradability: 'shrinkable',
  isText: true,
  atFloor: false,
  canCut: true,
  linesAboveOne: true,
  zonesRemaining: true,
};

describe('availableRungs — the ladder, gentlest first', () => {
  it('shrinkable text: shrink → ellipsis → fewer lines → move; never dropped', () => {
    expect(availableRungs(text)).toEqual(['SHRINK_STEP', 'ELLIPSIS', 'TRUNCATE_LINE', 'REFLOW']);
  });

  it('droppable text: the same ladder, with DROP as the very last resort', () => {
    expect(availableRungs({ ...text, degradability: 'droppable' })).toEqual([
      'SHRINK_STEP',
      'ELLIPSIS',
      'TRUNCATE_LINE',
      'REFLOW',
      'DROP',
    ]);
  });

  it('fixed: may shrink and move, never loses content, never dropped', () => {
    expect(availableRungs({ ...text, degradability: 'fixed' })).toEqual(['SHRINK_STEP', 'REFLOW']);
    expect(availableRungs({ ...text, degradability: 'fixed', atFloor: true, zonesRemaining: false })).toEqual([]);
  });

  it('a scan target shrinks only down to its module floor (below it, it stops scanning)', () => {
    const scan: DegradableState = { ...text, isText: false, degradability: 'droppable' };
    expect(availableRungs(scan)).toEqual(['SHRINK_STEP', 'REFLOW', 'DROP']);
    expect(availableRungs({ ...scan, atFloor: true })).toEqual(['REFLOW', 'DROP']);
  });

  it('steps already used up disappear from the ladder', () => {
    expect(availableRungs({ ...text, atFloor: true, canCut: false, linesAboveOne: false, zonesRemaining: false })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1b. Victim selection
// ---------------------------------------------------------------------------

const cand = (c: Partial<DegradationCandidate> & Pick<DegradationCandidate, 'id'>): DegradationCandidate => ({
  role: 'secondary',
  priority: 3,
  rung: 'SHRINK_STEP',
  rungsApplied: 0,
  ...c,
});

describe('selectVictim', () => {
  it('returns null for no candidates', () => {
    expect(selectVictim([])).toBeNull();
  });

  it('worst priority first', () => {
    expect(selectVictim([cand({ id: 'a', priority: 1 }), cand({ id: 'b', priority: 5 }), cand({ id: 'c', priority: 3 })])?.id).toBe('b');
  });

  it('within a priority, the gentlest step first — shrink one before dropping another', () => {
    expect(selectVictim([cand({ id: 'drop', rung: 'DROP' }), cand({ id: 'shrink', rung: 'SHRINK_STEP', rungsApplied: 5 })])?.id).toBe('shrink');
  });

  it('then fewer steps taken, then role — and never depends on input order', () => {
    const a = cand({ id: 'a', role: 'scan', priority: 4 });
    const b = cand({ id: 'b', role: 'incentive', priority: 4 });
    expect(selectVictim([a, b])?.id).toBe('b');
    expect(selectVictim([b, a])?.id).toBe('b');
    expect(selectVictim([cand({ id: 'x', rungsApplied: 3 }), cand({ id: 'y', rungsApplied: 1 })])?.id).toBe('y');
  });

  it('never picks a better priority while a worse one is available (property check)', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const rungs = ['SHRINK_STEP', 'ELLIPSIS', 'TRUNCATE_LINE', 'REFLOW', 'DROP'] as const;
    for (let t = 0; t < 300; t++) {
      const cs = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) =>
        cand({
          id: `c${i}`,
          priority: (1 + Math.floor(rand() * 5)) as DegradationCandidate['priority'],
          rung: rungs[Math.floor(rand() * rungs.length)]!,
          rungsApplied: Math.floor(rand() * 4),
        }),
      );
      const winner = selectVictim(cs)!;
      for (const c of cs) expect(winner.priority).toBeGreaterThanOrEqual(c.priority);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The rule, on every step of every resolve
// ---------------------------------------------------------------------------

function checkEveryStep(spec: AdSpec, layout: ResolvedLayout, context: string): void {
  const priorityOf = new Map(spec.elements.map((e) => [e.id, e.priority]));
  const live = new Set(spec.elements.map((e) => e.id));

  for (const step of layout.diagnostics.rungsApplied) {
    const where = `${context}, step #${step.atIteration} (${step.id} ${step.rung})`;

    expect(step.overflowAfter, `${where}: must reduce the overflow`).toBeLessThan(step.overflowBefore);

    expect(step.candidates.map((c) => c.id), `${where}: victim is among the candidates`).toContain(step.id);
    for (const c of step.candidates) {
      expect(c.priority, `${where}: every candidate shares the victim's priority band`).toBe(step.priority);
    }

    // Every element still on the surface with a WORSE priority must have
    // been examined first and found to have no helpful step.
    const worseLive = [...live].filter((id) => priorityOf.get(id)! > step.priority).sort();
    expect([...step.blocked].sort(), `${where}: all worse-priority elements were tried first`).toEqual(worseLive);

    for (const partner of step.partners) {
      expect(priorityOf.get(partner)!, `${where}: joint step never pulls in a better priority`).toBeGreaterThanOrEqual(step.priority);
    }

    if (step.rung === 'DROP') {
      live.delete(step.id);
      for (const partner of step.partners) live.delete(partner);
    }
  }

  // Degradability is honoured in the final layout.
  for (const el of spec.elements) {
    const entry = layout.elements[el.id]!;
    if (el.degradability !== 'droppable') {
      expect(entry.placed, `${context}: ${el.degradability} "${el.id}" is never dropped`).toBe(true);
    }
    if (el.degradability === 'fixed' && entry.placed && entry.typography) {
      expect(entry.typography.truncated, `${context}: fixed "${el.id}" never loses content`).toBe(false);
    }
  }
}

describe('the rule holds on every step', () => {
  it('for every shipped ad on every shipped surface', () => {
    for (const ad of ads) {
      for (const s of surfaces) checkEveryStep(ad.spec, resolve(ad.spec, s.profile), `${ad.key} on ${s.key}`);
    }
  });

  it('under an inflated density that forces heavy degradation', () => {
    for (const ad of ads) {
      for (const s of surfaces) {
        checkEveryStep(ad.spec, resolve(ad.spec, { ...s.profile, densityScale: 2 }), `${ad.key} on ${s.key} @2x`);
      }
    }
  });

  it('on 300 random surfaces per ad', () => {
    let seed = 20240924;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const ad of ads) {
      for (let i = 0; i < 300; i++) {
        const w = 120 + rand() * 2000;
        const h = 80 + rand() * 2000;
        const profile: SurfaceProfile = defineSurface({
          widthPx: w,
          heightPx: h,
          safeArea: { top: rand() * h * 0.15, right: rand() * w * 0.15, bottom: rand() * h * 0.15, left: rand() * w * 0.15 },
          interaction: rand() < 0.5 ? { mode: 'passive' } : { mode: 'touch', minTapTargetPx: 24 + rand() * 50 },
          viewing: rand() < 0.5 ? { distance: 'near' } : { distance: 'far', minTextPx: 10 + rand() * 30 },
        });
        checkEveryStep(ad.spec, resolve(ad.spec, profile), `${ad.key} on random #${i} ${JSON.stringify(profile)}`);
      }
    }
  });
});

describe('no unnecessary degradation survives', () => {
  it('a surface with room to spare takes no steps at all', () => {
    for (const ad of ads) {
      const layout = resolve(ad.spec, surfaces.find((s) => s.key === 'retailKiosk')!.profile);
      expect(layout.status, ad.key).toBe('ok');
      expect(layout.diagnostics.rungsApplied, ad.key).toEqual([]);
      for (const entry of Object.values(layout.elements)) expect(entry.placed, `${ad.key}: ${entry.id}`).toBe(true);
    }
  });

  it('steps the final layout turned out not to need are undone and logged', () => {
    // FERN on a 1080×150 band: legal is dropped early, but later steps free
    // the room it needed, so the reclaim pass restores it.
    const layout = resolve(
      ads.find((a) => a.key === 'fern')!.spec,
      defineSurface({
        widthPx: 1080,
        heightPx: 150,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        interaction: { mode: 'touch', minTapTargetPx: 60 },
        viewing: { distance: 'mid', minTextPx: 20 },
      }),
    );
    expect(layout.diagnostics.restored.map((r) => `${r.id}:${r.rung}`)).toContain('legal:DROP');
    expect(layout.elements['legal' as never]?.placed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. The scenarios
// ---------------------------------------------------------------------------

const dropOrder = (layout: ResolvedLayout) =>
  layout.diagnostics.rungsApplied.filter((r) => r.rung === 'DROP').flatMap((r) => [r.id, ...r.partners]);

describe('the stress surface (compact card, 320×180)', () => {
  const cramped = surfaces.find((s) => s.key === 'cramped')!.profile;

  it('KEEL degrades cleanly: legal (5), then QR and badge (4), then logo (2) — never the headline, CTA, price or hero', () => {
    const layout = resolve(keelAd, cramped);
    expect(layout.status).toBe('degraded');
    expect(layout.diagnostics.violations).toEqual([]);
    expect(dropOrder(layout)).toEqual(['legal', 'qr', 'badge', 'logo']);
    for (const id of ['headline', 'cta', 'price', 'hero']) {
      expect(layout.elements[id as keyof typeof layout.elements]?.placed, id).toBe(true);
    }
  });

  it('every shipped ad fits it without breaking a single constraint', () => {
    for (const ad of ads) {
      const layout = resolve(ad.spec, cramped);
      expect(layout.status, ad.key).toBe('degraded');
      expect(layout.diagnostics.violations, ad.key).toEqual([]);
    }
  });
});

describe('the brief\'s kiosk scenario: shrink it until branding must go', () => {
  const kiosk = (w: number, h: number) =>
    defineSurface({
      widthPx: w,
      heightPx: h,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      interaction: { mode: 'touch', minTapTargetPx: 60 },
      viewing: { distance: 'mid', minTextPx: 20 },
    });

  it('shrinking the height: headline and CTA survive every step, nothing ever overlaps or clips', () => {
    for (let h = 1080; h >= 140; h -= 20) {
      const layout = resolve(keelAd, kiosk(1080, h));
      const structural = layout.diagnostics.violations.filter((v) => v.kind === 'overlap' || v.kind === 'out-of-bounds');
      expect(structural, `h=${h}`).toEqual([]);
      expect(layout.elements.headline.placed, `h=${h}`).toBe(true);
      expect(layout.elements.cta.placed, `h=${h}`).toBe(true);
      checkEveryStep(keelAd, layout, `kiosk 1080×${h}`);
    }
  });

  it('shrinking the whole kiosk: the logo goes only after legal, badge and QR — and it goes cleanly', () => {
    let firstWithoutLogo: ResolvedLayout<'headline' | 'hero' | 'cta' | 'price' | 'logo' | 'badge' | 'qr' | 'legal'> | null = null;
    let side = 0;
    for (side = 1080; side >= 120 && !firstWithoutLogo; side -= 20) {
      const layout = resolve(keelAd, kiosk(side, side));
      if (!layout.elements.logo.placed) firstWithoutLogo = layout;
    }
    expect(firstWithoutLogo, 'the logo is eventually dropped').not.toBeNull();
    const layout = firstWithoutLogo!;
    const order = dropOrder(layout);
    for (const lower of ['legal', 'badge', 'qr']) {
      expect(order.indexOf(lower), `${lower} is dropped before the logo`).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(lower)).toBeLessThan(order.indexOf('logo'));
    }
    expect(layout.elements.headline.placed).toBe(true);
    expect(layout.elements.cta.placed).toBe(true);
    const structural = layout.diagnostics.violations.filter((v) => v.kind === 'overlap' || v.kind === 'out-of-bounds');
    expect(structural).toEqual([]);
  });
});
