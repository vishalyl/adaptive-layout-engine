// The degradation ladder and victim selection. The resolver (resolver.ts)
// owns the loop; this file owns the two rules the loop is built from, kept
// pure so each can be tested on its own:
//
//   availableRungs(state)  — which steps an element may still take, gentlest
//                            first. Which of them is actually TAKEN is decided
//                            by the resolver: the first one that measurably
//                            reduces the overflow.
//   selectVictim(cands)    — among elements that have such a step, whose turn
//                            it is: worst priority first.
//
// Together they give the one rule the whole algorithm can be summarised by:
//
//   At every step, among the elements whose gentlest available step would
//   actually reduce the overflow, degrade the one with the worst priority.

import type { Priority, Role } from '../spec';

export type Rung =
  | 'SHRINK_STEP' // scale down by 10% of the ideal→floor range (text/button font, image size)
  | 'ELLIPSIS' // text: allow cutting what doesn't fit in the current line budget, with "…"
  | 'TRUNCATE_LINE' // text: one line fewer (content cut with "…")
  | 'REFLOW' // move to a later slot in the template's preference list for its role
  | 'DROP'; // remove from the layout

// Elements only ever leave a layout for one reason now: the space ran out
// and every gentler step had been exhausted or would not have helped. There
// is no size-class table that excludes roles up front.
export type DropReason = 'insufficient-space';

// The subset of an element's live allocation state the ladder needs.
export interface DegradableState {
  readonly degradability: 'fixed' | 'shrinkable' | 'droppable';
  readonly isText: boolean;
  // Current scale already at its hard floor. For a scan target that is its
  // module floor — below it, it stops scanning — so it shrinks no further.
  readonly atFloor: boolean;
  readonly canCut: boolean; // text only: content may not be cut yet
  readonly linesAboveOne: boolean; // text only: current line budget still > 1
  readonly zonesRemaining: boolean; // a later slot exists in its role preference
}

// Every step still available to an element, gentlest first. The order is
// the ladder:
//
//   SHRINK_STEP* → ELLIPSIS → TRUNCATE_LINE* → REFLOW → DROP
//
//   fixed       may shrink and move, never loses content, never dropped
//   shrinkable  may also cut text (ellipsis, fewer lines), never dropped
//   droppable   may do all of the above and, last, be removed
export function availableRungs(state: DegradableState): Rung[] {
  const rungs: Rung[] = [];
  if (!state.atFloor) rungs.push('SHRINK_STEP');
  const mayCutText = state.isText && state.degradability !== 'fixed';
  if (mayCutText && state.canCut) rungs.push('ELLIPSIS');
  if (mayCutText && state.linesAboveOne) rungs.push('TRUNCATE_LINE');
  if (state.zonesRemaining) rungs.push('REFLOW');
  if (state.degradability === 'droppable') rungs.push('DROP');
  return rungs;
}

// Tiebreak used only when two candidates share both priority and number of
// steps already taken. Lower = degraded earlier. Total over every Role so the
// ordering is always deterministic.
export const ROLE_SUFFER_RANK: Readonly<Record<Role, number>> = {
  legal: 0,
  incentive: 1,
  scan: 2,
  branding: 3,
  secondary: 4,
  action: 5,
  hero: 6,
  primary: 7,
};

// How severe a step is, gentlest first — the ladder order itself.
export const RUNG_SEVERITY: Readonly<Record<Rung, number>> = {
  SHRINK_STEP: 0,
  ELLIPSIS: 1,
  TRUNCATE_LINE: 2,
  REFLOW: 3,
  DROP: 4,
};

export interface DegradationCandidate {
  readonly id: string;
  readonly role: Role;
  readonly priority: Priority;
  // The step this candidate would take (its gentlest helpful one).
  readonly rung: Rung;
  readonly rungsApplied: number;
}

// Orders candidates and returns whose turn it is:
//   1. worst priority first (priority 5 before priority 1),
//   2. then the gentlest proposed step (among equal priorities, shrinking
//      one element is tried before dropping another outright),
//   3. then the one that has taken fewer steps (spreads the pain),
//   4. then ROLE_SUFFER_RANK.
// `candidates` must already be filtered to elements that have a step which
// reduces the overflow — this function only orders them.
export function selectVictim<C extends DegradationCandidate>(candidates: readonly C[]): C | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.rung !== b.rung) return RUNG_SEVERITY[a.rung] - RUNG_SEVERITY[b.rung];
    if (a.rungsApplied !== b.rungsApplied) return a.rungsApplied - b.rungsApplied;
    return ROLE_SUFFER_RANK[a.role] - ROLE_SUFFER_RANK[b.role];
  });
  return sorted[0] ?? null;
}
