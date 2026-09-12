// Backward-compatible re-export. The real KEEL spec now lives in
// src/demo/creatives/keel.ts, alongside the two other shipped ads (ORBIT,
// FERN) — see src/demo/creatives/index.ts. (Deliberately not named "ads/":
// browser ad-blockers generically block any URL path containing "/ads/",
// which broke the dev server for anyone running one — see the "ads"
// directory rename.) Several existing tests import `keelAd` from this
// path; kept as a thin re-export rather than churning every one of them
// for a rename with no behavior change.

export { keelAd } from './creatives/keel';
