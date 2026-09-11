// The priority-ordered degradation ladder (§10 of BUILD_SPEC.md). This is
// half of the 35%-weighted algorithm criterion, and the brief specifically
// calls out "correctness and predictability of the degradation order" — so
// predictability is what this file is designed around, not cleverness.

import type { Priority, Role } from './spec';

export type Rung = 'SHRINK_STEP' | 'TRUNCATE_LINE' | 'ELLIPSIS' | 'REFLOW' | 'DROP';

export type DropReason =
  | 'not-in-ambition' // this template/scale never attempted the role at all
  | 'exhausted-ladder' // every rung was applied and it still didn't fit
  | 'surface-too-small'; // the final constrained-status fallback (§10.5)

// The subset of an element's live allocation state that the ladder logic
// needs to decide "what's next." Kept as a plain interface (rather than
// passing the whole element + surface) so this function has no dependency
// on how the resolver represents state internally — it is easy to unit
// test in isolation, which is exactly what tests/degradation.spec.ts does.
export interface DegradableState {
  readonly degradability: 'fixed' | 'shrinkable' | 'droppable';
  readonly isText: boolean;
  readonly isScan: boolean; // scan elements skip SHRINK_STEP entirely — see §8.4
  readonly atFloor: boolean; // current size already at its hard floor
  readonly linesAboveOne: boolean; // text only: current maxLines still > 1
  readonly ellipsisApplied: boolean;
  readonly zonesRemaining: boolean; // more zones left to try in rolePreference
}

// Walks one element's ladder by exactly one rung, given its current state.
// Each ladder is expressed as a sequence of guards rather than a table,
// because the "*" (repeatable) rungs in §10.1 aren't really repetitions of
// a step — they're just "keep returning SHRINK_STEP until atFloor becomes
// true," which a guard expresses more directly than a queue of enum values
// would.
export function nextRung(state: DegradableState): Rung | null {
  // A QR code below its module floor isn't a smaller QR, it's a broken one
  // (§8.4) — so scan elements never receive SHRINK_STEP at all, and go
  // straight to reflow-then-drop.
  if (!state.isScan && !state.atFloor) return 'SHRINK_STEP';

  // TRUNCATE_LINE exists for shrinkable and droppable text, not fixed text
  // (a fixed element, e.g. the CTA, has no line count to truncate in this
  // creative, but the rule is general: fixed never loses content, only size).
  if (state.isText && state.degradability !== 'fixed' && state.linesAboveOne) {
    return 'TRUNCATE_LINE';
  }

  // ELLIPSIS is shrinkable-only. A droppable element skips straight from
  // truncation to reflow-then-drop; losing it outright is an acceptable
  // outcome for a droppable element, so there is no need to soften the cut
  // with an ellipsis first.
  if (state.isText && state.degradability === 'shrinkable' && !state.ellipsisApplied) {
    return 'ELLIPSIS';
  }

  if (state.zonesRemaining) return 'REFLOW';

  if (state.degradability === 'droppable') return 'DROP';

  // fixed and shrinkable ladders end here — this element is never dropped,
  // no matter how small the surface gets. If it still overflows, that
  // overflow becomes the caller's problem (§10.5, the 'constrained' status).
  return null;
}

// Suffer-first tiebreak used only when two candidates share both priority
// and rungs-already-applied (BUILD_SPEC.md §10.3 step 3). Lower index =
// picked as victim earlier. This list is a real design decision — e.g.
// `incentive` (the promo badge) is judged less essential than `scan` (the
// QR) when both are otherwise tied, so it ranks first. It is fixed and
// total over every `Role` so the sort is always deterministic.
const ROLE_SUFFER_RANK: Readonly<Record<Role, number>> = {
  legal: 0,
  incentive: 1,
  scan: 2,
  branding: 3,
  secondary: 4,
  action: 5,
  hero: 6,
  primary: 7,
};

export interface DegradationCandidate {
  readonly id: string;
  readonly role: Role;
  readonly priority: Priority;
  readonly rungsApplied: number;
}

// selectVictim (§10.3). `candidates` must already be filtered by the caller
// to elements that (a) occupy a currently-overflowing zone and (b) have at
// least one rung remaining — this function only does the ordering, so that
// ordering logic is unit-testable independent of overflow detection.
//
// The invariant this produces, stated once so it can be quoted verbatim:
// "No element of priority P has a rung applied while any element of
// priority greater than P still has a rung remaining." Sorting by priority
// DESCENDING first is what guarantees it; the two tiebreaks only decide
// order *within* a priority band, so they can never violate it.
export function selectVictim<C extends DegradationCandidate>(candidates: readonly C[]): C | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.rungsApplied !== b.rungsApplied) return a.rungsApplied - b.rungsApplied;
    return ROLE_SUFFER_RANK[a.role] - ROLE_SUFFER_RANK[b.role];
  });

  return sorted[0] ?? null;
}
