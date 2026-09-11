// The public surface of the engine. Everything a consumer (the demo, a
// renderer, a test) needs is re-exported from here rather than reaching
// into individual engine files directly.
//
// This file grows as later gates add classify.ts, templates.ts,
// degradation.ts, resolver.ts, validate.ts and diagnostics.ts (see
// BUILD_SPEC.md §4 and §23). At this gate only the data model exists.

export * from './types';
export * from './spec';
export * from './surface';
