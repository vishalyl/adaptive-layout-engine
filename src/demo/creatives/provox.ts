// PROVOX, a fictional wireless headphone brand. The hero is a pair of
// over-ear headphones (intrinsic aspect 1.8 — wide landscape) — a
// striking shape that tests the engine's ability to lay out wide art
// on both narrow and wide surfaces.
//
// Palette: deep charcoal/silver/cyan, evoking premium audio hardware.

import { defineAd } from '../../spec';
import { brandLockup, svgDataUri } from './svg';
import type { AdPalette } from '../../render-dom';

const CHARCOAL = '#1A1A24';
const CHARCOAL_LIGHT = '#2D2D3E';
const SILVER = '#D4D4E0';
const CYAN = '#00D4FF';

export const provoxPalette: AdPalette = {
  background: CHARCOAL,
  text: SILVER,
  textMuted: 'rgba(212, 212, 224, 0.6)',
  badgeBg: CYAN,
  badgeText: CHARCOAL,
  ctaBg: CYAN,
  ctaText: CHARCOAL,
};

// Over-ear headphones, side profile — the headband forms a wide arc,
// the ear cups are deep oval shapes. viewBox: 300×170 → intrinsicAspect ~1.76.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 170">
    <defs>
      <linearGradient id="provoxBand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3A3A4C"/>
        <stop offset="50%" stop-color="#2D2D3E"/>
        <stop offset="100%" stop-color="#242432"/>
      </linearGradient>
      <linearGradient id="provoxCup" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2D2D3E"/>
        <stop offset="30%" stop-color="#3A3A4C"/>
        <stop offset="70%" stop-color="#2D2D3E"/>
        <stop offset="100%" stop-color="#242432"/>
      </linearGradient>
      <linearGradient id="provoxCushion" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#1A1A24"/>
        <stop offset="50%" stop-color="#2A2A3A"/>
        <stop offset="100%" stop-color="#1A1A24"/>
      </linearGradient>
      <linearGradient id="provoxHighlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="white" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="provoxGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${CHARCOAL}" stop-opacity="0"/>
      </radialGradient>
      <filter id="provoxShadow" x="-20%" y="-25%" width="140%" height="150%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.35"/>
      </filter>
      <filter id="provoxLED" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <!-- Ambient glow -->
    <ellipse cx="150" cy="85" rx="120" ry="70" fill="url(#provoxGlow)" opacity="0.8"/>
    <g filter="url(#provoxShadow)">
      <!-- Left ear cup assembly -->
      <rect x="30" y="55" width="45" height="70" rx="22" fill="url(#provoxCup)"/>
      <!-- Left cushion -->
      <rect x="15" y="60" width="20" height="60" rx="10" fill="url(#provoxCushion)"/>
      <!-- Left cup highlight -->
      <rect x="31" y="56" width="20" height="68" rx="10" fill="url(#provoxHighlight)"/>
      <!-- Left cup edge detail -->
      <rect x="30" y="55" width="45" height="70" rx="22" fill="none" stroke="white" stroke-width="0.5" opacity="0.08"/>
      
      <!-- Right ear cup assembly -->
      <rect x="225" y="55" width="45" height="70" rx="22" fill="url(#provoxCup)"/>
      <!-- Right cushion -->
      <rect x="265" y="60" width="20" height="60" rx="10" fill="url(#provoxCushion)"/>
      <!-- Right cup highlight -->
      <rect x="226" y="56" width="20" height="68" rx="10" fill="url(#provoxHighlight)"/>
      <rect x="225" y="55" width="45" height="70" rx="22" fill="none" stroke="white" stroke-width="0.5" opacity="0.08"/>
      
      <!-- Headband arc — left hinge -->
      <path d="M52 55 Q52 25 90 20" stroke="url(#provoxBand)" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- Headband arc — right hinge -->
      <path d="M248 55 Q248 25 210 20" stroke="url(#provoxBand)" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- Headband connector -->
      <path d="M90 20 Q150 5 210 20" stroke="url(#provoxBand)" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- Headband highlight -->
      <path d="M92 18 Q150 3 208 18" stroke="white" stroke-width="1" fill="none" opacity="0.10" stroke-linecap="round"/>
      <!-- Headband inner cushion -->
      <path d="M90 28 Q150 15 210 28" stroke="#1A1A24" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.5"/>
      
      <!-- Left hinge detail -->
      <circle cx="52" cy="55" r="5" fill="#3A3A4C"/>
      <circle cx="52" cy="55" r="2.5" fill="#2D2D3E"/>
      <!-- Right hinge detail -->
      <circle cx="248" cy="55" r="5" fill="#3A3A4C"/>
      <circle cx="248" cy="55" r="2.5" fill="#2D2D3E"/>
      
      <!-- Left LED indicator (active) -->
      <circle cx="50" cy="90" r="3" fill="${CYAN}" filter="url(#provoxLED)" opacity="0.8"/>
      <!-- Right LED indicator (sync) -->
      <circle cx="250" cy="90" r="3" fill="${CYAN}" filter="url(#provoxLED)" opacity="0.5"/>
    </g>
  </svg>
`;

// A simple monogram mark for branding — angular and geometric.
// Brand lockup: the monogram tile plus the brand name, so the brand is
// legible wherever the logo survives (see brandLockup in svg.ts).
const logo = brandLockup({
  tile: `
    <rect width="64" height="64" rx="14" fill="${CHARCOAL_LIGHT}" />
    <rect x="14" y="14" width="36" height="36" rx="8" fill="none" stroke="${CYAN}" stroke-width="3" opacity="0.8"/>
    <circle cx="32" cy="32" r="10" fill="${CYAN}" opacity="0.6"/>
    <line x1="32" y1="22" x2="32" y2="14" stroke="${CYAN}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <line x1="32" y1="42" x2="32" y2="50" stroke="${CYAN}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <line x1="22" y1="32" x2="14" y2="32" stroke="${CYAN}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <line x1="42" y1="32" x2="50" y2="32" stroke="${CYAN}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  `,
  name: 'PROVOX',
  nameColor: SILVER,
  charWidth: 30,
});

export const provoxAd = defineAd({
  name: 'Provox One ANC — Midnight Drop',
  background: CHARCOAL,
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Silence isn\'t empty. It\'s Provox.',
      idealFontPx: 38,
      minFontPx: 20,
      maxLines: 2,
      weight: 800,
      tracking: -0.4,
    },
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(heroSvg),
      intrinsicAspect: 1.76,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Pre-Order Now',
      idealFontPx: 18,
      minFontPx: 14,
      paddingRatio: 1.5,
    },
    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: '₹14,999 · Launch price',
      idealFontPx: 22,
      minFontPx: 14,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 2,
      degradability: 'droppable',
      src: svgDataUri(logo.svg),
      markColor: SILVER,
      intrinsicAspect: logo.aspect,
      fit: 'contain',
      minShortSidePx: 22,
    },
    {
      id: 'badge',
      type: 'text',
      role: 'incentive',
      priority: 4,
      degradability: 'droppable',
      content: '-45dB ANC',
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
      payload: 'https://provox.example/one-anc',
      minModulePx: 4,
      modules: 21,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'Ships October 2025. 2-year warranty included.',
      idealFontPx: 12,
      minFontPx: 9,
      maxLines: 2,
      weight: 400,
    },
  ],
});
