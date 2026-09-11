// The named surface profiles. This is the ONLY place in the codebase where
// a surface gets an identity — a label, a key, a display context. The
// engine (src/engine/) never imports this file and never sees these names;
// it only ever receives a plain SurfaceProfile of numbers and constraint
// unions. tests/purity.spec.ts enforces this mechanically. See BUILD_SPEC.md
// §0.2 and §7.

import { defineSurface, type SurfaceProfile } from '../engine/surface';

export interface NamedSurface {
  readonly key: string;
  readonly label: string;
  readonly profile: SurfaceProfile;
}

const ZERO_SAFE_AREA = { top: 0, right: 0, bottom: 0, left: 0 };

export const surfaces: readonly NamedSurface[] = [
  {
    key: 'mobilePortrait',
    label: 'Mobile interstitial',
    profile: defineSurface({
      widthPx: 320,
      heightPx: 480,
      // A realistic notch/home-indicator inset.
      safeArea: { top: 44, right: 0, bottom: 34, left: 0 },
      interaction: { mode: 'touch', minTapTargetPx: 44 },
      viewing: { distance: 'near' },
    }),
  },
  {
    key: 'mobileLandscape',
    label: 'Mobile landscape',
    profile: defineSurface({
      widthPx: 480,
      heightPx: 320,
      safeArea: ZERO_SAFE_AREA,
      interaction: { mode: 'touch', minTapTargetPx: 44 },
      viewing: { distance: 'near' },
    }),
  },
  {
    key: 'broadcastLowerThird',
    label: 'Broadcast lower-third',
    profile: defineSurface({
      widthPx: 1920,
      heightPx: 250,
      // Broadcast-style horizontal title-safe inset.
      safeArea: { top: 0, right: 48, bottom: 0, left: 48 },
      interaction: { mode: 'passive' },
      viewing: { distance: 'far', minTextPx: 32 },
    }),
  },
  {
    key: 'retailKiosk',
    label: 'Retail kiosk',
    profile: defineSurface({
      widthPx: 1080,
      heightPx: 1080,
      safeArea: ZERO_SAFE_AREA,
      interaction: { mode: 'touch', minTapTargetPx: 60 },
      viewing: { distance: 'mid', minTextPx: 20 },
    }),
  },
  {
    key: 'printPanel',
    label: 'Print-to-digital QR panel',
    profile: defineSurface({
      widthPx: 600,
      heightPx: 1600,
      safeArea: ZERO_SAFE_AREA,
      interaction: { mode: 'passive' },
      viewing: { distance: 'mid', minTextPx: 18 },
    }),
  },
  {
    key: 'cramped',
    label: 'Compact banner (stress case)',
    profile: defineSurface({
      widthPx: 300,
      heightPx: 100,
      safeArea: ZERO_SAFE_AREA,
      interaction: { mode: 'pointer', minTapTargetPx: 44 },
      viewing: { distance: 'near' },
    }),
  },
];
