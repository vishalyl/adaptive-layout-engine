// A structured trace of every decision the resolver makes. This is
// what turns "walk through why a specific element ended up at a specific
// position and size" from a memory test into a pointing exercise — the
// demo's diagnostics panel (Gate 6) just renders this data.
//
// Quietly, it is also evidence the resolver is real: a hardcoded per-surface
// lookup table cannot narrate its own reasoning the way this can.

import type { AspectClass } from './classify';
import type { DropReason, Rung } from './degradation';
import type { Priority } from '../spec';
import type { TemplateId } from './templates';

export interface Decision {
  readonly phase: string;
  readonly note: string;
}

export interface DropRecord {
  readonly id: string;
  readonly reason: DropReason;
  readonly atIteration: number;
}

// One step of the degradation loop, with everything needed to check it was
// the right one: which axis was being resolved, the overflow before and
// after (the step must reduce it), the other candidates in the victim's
// priority band, and the worse-priority elements that were examined first
// and had no step that would have helped (`blocked`).
export interface RungRecord {
  readonly id: string;
  readonly priority: Priority;
  readonly rung: Rung;
  // Cuts carried into this step because it only works with them (e.g. a
  // price may end in "…" AND move beside the CTA). Usually empty.
  readonly bundled: readonly Rung[];
  // Slot-mates of equal or worse priority that took the same step jointly,
  // because in a shared row neither step helps alone. Usually empty.
  readonly partners: readonly string[];
  readonly atIteration: number;
  readonly axis: 'x' | 'y';
  readonly overflowBefore: number;
  readonly overflowAfter: number;
  readonly candidates: readonly { readonly id: string; readonly priority: Priority; readonly rung: Rung }[];
  readonly blocked: readonly string[];
  // True when no step fit without creating horizontal overflow, so the loop
  // accepted one that reduced the total instead (resolver.ts `helps`).
  readonly relaxed: boolean;
  readonly note: string;
}

// A step undone after the loop converged, because the layout still fits
// without it (the "reclaim" pass in resolver.ts).
export interface RestoreRecord {
  readonly id: string;
  readonly rung: Rung;
  readonly note: string;
}

// Populated by validate.ts (Phase 7, Gate 5). Declared here — not there —
// because Diagnostics needs the type and diagnostics.ts is built first in
// the file order; validate.ts imports this definition rather than the
// other way around.
export type ViolationKind =
  | 'overlap'
  | 'out-of-bounds'
  | 'safe-area'
  | 'tap-target'
  | 'text-floor'
  | 'scan-integrity'
  | 'contrast';

// 'error' means a hard invariant actually broke (overlap, clipping, a
// floor violated) — these are what the validator throws on in dev. 'warning' is
// reserved for the one explicitly softer check: an element resting
// in the safe-area margin is worth flagging, not failing.
export type ViolationSeverity = 'error' | 'warning';

export interface Violation {
  readonly kind: ViolationKind;
  readonly severity: ViolationSeverity;
  readonly message: string;
  readonly elementIds: readonly string[];
}

export interface Diagnostics {
  readonly surfaceSummary: {
    readonly aspect: number;
    readonly aspectClass: AspectClass;
    readonly templateId: TemplateId;
  };
  readonly decisions: readonly Decision[];
  readonly drops: readonly DropRecord[];
  readonly rungsApplied: readonly RungRecord[];
  readonly restored: readonly RestoreRecord[];
  readonly violations: readonly Violation[];
  readonly iterations: number;
  readonly resolveMs: number;
}

// Cap the trace so a pathological input (or a bug in the allocation loop)
// cannot make the decision log grow without bound — it is meant to be read
// by a person in a side panel, not to be a full audit log.
const MAX_DECISIONS = 500;

// A small mutable accumulator used only inside resolve(); everything it
// produces is frozen into a plain `Diagnostics` object by `build()` before
// leaving the resolver, so nothing downstream can mutate the trace after
// the fact.
export class DiagnosticsBuilder {
  private readonly decisions: Decision[] = [];
  private readonly drops: DropRecord[] = [];
  private readonly rungsApplied: RungRecord[] = [];
  private readonly restored: RestoreRecord[] = [];
  private truncated = false;

  note(phase: string, note: string): void {
    if (this.decisions.length >= MAX_DECISIONS) {
      this.truncated = true;
      return;
    }
    this.decisions.push({ phase, note });
  }

  recordDrop(id: string, reason: DropReason, atIteration: number): void {
    this.drops.push({ id, reason, atIteration });
  }

  recordRung(record: RungRecord): void {
    this.rungsApplied.push(record);
  }

  recordRestore(record: RestoreRecord): void {
    this.restored.push(record);
  }

  // A reverted drop is no longer a drop.
  undoDrop(id: string): void {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i >= 0) this.drops.splice(i, 1);
  }

  build(
    surfaceSummary: Diagnostics['surfaceSummary'],
    iterations: number,
    resolveMs: number,
    violations: readonly Violation[],
  ): Diagnostics {
    if (this.truncated) {
      this.decisions.push({ phase: 'diagnostics', note: `decision log truncated at ${MAX_DECISIONS} entries` });
    }
    return {
      surfaceSummary,
      decisions: this.decisions,
      drops: this.drops,
      rungsApplied: this.rungsApplied,
      restored: this.restored,
      violations,
      iterations,
      resolveMs,
    };
  }
}
