// A structured trace of every decision the resolver makes (§12). This is
// what turns "walk through why a specific element ended up at a specific
// position and size" from a memory test into a pointing exercise — the
// demo's diagnostics panel (Gate 6) just renders this data.
//
// Quietly, it is also evidence the resolver is real: a hardcoded per-surface
// lookup table cannot narrate its own reasoning the way this can.

import type { AspectClass, ScaleClass } from './classify';
import type { DropReason, Rung } from './degradation';
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

export interface RungRecord {
  readonly id: string;
  readonly rung: Rung;
  readonly atIteration: number;
  readonly note: string;
}

// Populated by validate.ts (Phase 7, Gate 5). Declared here — not there —
// because Diagnostics needs the type and diagnostics.ts is built first in
// the file order; validate.ts imports this definition rather than the
// other way around.
export interface Violation {
  readonly kind: string;
  readonly message: string;
  readonly elementIds: readonly string[];
}

export interface Diagnostics {
  readonly surfaceSummary: {
    readonly aspect: number;
    readonly aspectClass: AspectClass;
    readonly scaleClass: ScaleClass;
    readonly templateId: TemplateId;
  };
  readonly decisions: readonly Decision[];
  readonly drops: readonly DropRecord[];
  readonly rungsApplied: readonly RungRecord[];
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

  recordRung(id: string, rung: Rung, atIteration: number, note: string): void {
    this.rungsApplied.push({ id, rung, atIteration, note });
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
      violations,
      iterations,
      resolveMs,
    };
  }
}
