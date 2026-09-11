// The one ad spec used throughout the demo: KEEL, a fictional insulated
// flask brand. See BUILD_SPEC.md §6 for why this product was chosen — a
// tall, narrow hero silhouette (intrinsic aspect 0.38) is a genuinely
// hostile shape to lay out on a 1920×250 broadcast band, which forces the
// engine to recompose rather than uniformly scale.
//
// The hero and logo are hand-authored inline SVG, embedded as data URIs, so
// the deployed demo has no network dependency, no broken-image risk, and an
// exactly known intrinsic aspect ratio.

import { defineAd } from '../engine/spec';

const KEEL_MARINE = '#0E2A38';
const KEEL_SPRUCE = '#1C4A50';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// A rounded-rectangle flask body with a narrower cap, an accent band at the
// shoulder, and a subtle highlight stripe down the left third.
// viewBox is 190×500 → intrinsicAspect 0.38, matched below in the spec.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 500">
    <rect x="75" y="0"  width="40"  height="34"  rx="8"  fill="${KEEL_SPRUCE}" />
    <rect x="55" y="28" width="80"  height="34"  rx="16" fill="${KEEL_MARINE}" />
    <rect x="15" y="56" width="160" height="444" rx="56" fill="${KEEL_SPRUCE}" />
    <rect x="15" y="150" width="160" height="30" fill="${KEEL_SEAGLASS}" />
    <rect x="40" y="56" width="22" height="430" rx="11" fill="${KEEL_SAND}" opacity="0.18" />
  </svg>
`;

// A simple monogram mark, square (intrinsicAspect 1).
const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${KEEL_MARINE}" />
    <path
      d="M20 14 L20 50 M20 32 L38 14 M20 32 L40 50"
      stroke="${KEEL_SAND}"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
`;

export const keelAd = defineAd({
  name: 'KEEL Tidal 700 — Autumn Sale',
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Cold for 24 hours. Seriously.',
      idealFontPx: 40,
      minFontPx: 20,
      maxLines: 2,
      weight: 800,
      tracking: -0.5,
    },
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(heroSvg),
      intrinsicAspect: 0.38,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Shop the Tidal',
      idealFontPx: 18,
      minFontPx: 14,
      paddingRatio: 1.4,
    },
    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: '₹2,490 · was ₹3,320',
      idealFontPx: 22,
      minFontPx: 14,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 3,
      degradability: 'droppable',
      src: svgDataUri(logoSvg),
      intrinsicAspect: 1,
      fit: 'contain',
      minShortSidePx: 24,
    },
    {
      id: 'badge',
      type: 'text',
      role: 'incentive',
      priority: 4,
      degradability: 'droppable',
      content: 'Save 25%',
      idealFontPx: 16,
      minFontPx: 11,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'qr',
      type: 'scan',
      role: 'scan',
      priority: 4,
      degradability: 'droppable',
      payload: 'https://keel.example/tidal-700',
      minModulePx: 4,
      modules: 21,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'Offer ends 30 September. Limited stock.',
      idealFontPx: 12,
      minFontPx: 9,
      maxLines: 2,
      weight: 400,
    },
  ],
});
