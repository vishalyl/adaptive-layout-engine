// The public surface of the engine. Everything a consumer (the demo, a
// renderer, a test) needs is re-exported from here rather than reaching
// into individual engine files directly.
//
// This file grows as later gates add validate.ts (see BUILD_SPEC.md §4 and
// §23). Phase 7's standalone invariant checker is the only piece not wired
// in yet — resolve() computes its own 'constrained' status directly from
// the allocation loop until then.

export * from './types';
export * from './spec';
export * from './surface';
export * from './classify';
export * from './templates';
export * from './degradation';
export * from './diagnostics';
export * from './measure';
export * from './resolver';
