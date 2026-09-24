// SIP PULSE, a fictional sparkling hydration brand. The hero is a tall,
// slim can (intrinsic aspect 0.36) — a narrow cylinder that looks
// great at true pixel size on wide surfaces.
//
// Palette: warm coral/sand/cream, evoking tropical citrus sparkle.

import { defineAd } from '../../spec';
import { brandLockup, svgDataUri } from './svg';
import type { AdPalette } from '../../render-dom';

const CORAL = '#E8644E';
const CORAL_LIGHT = '#F4957E';
const SAND = '#FFF4E6';
const DEEP_BROWN = '#3D1E0E';
const SPARKLE = '#FFD700';
const MINT = '#4ECDC4';

export const sipPulsePalette: AdPalette = {
  background: DEEP_BROWN,
  text: SAND,
  textMuted: 'rgba(255, 244, 230, 0.65)',
  badgeBg: CORAL_LIGHT,
  badgeText: DEEP_BROWN,
  ctaBg: CORAL,
  ctaText: SAND,
};

// A tall beverage can with gradient body, pull-tab, and sparkle details.
// viewBox: 180×500 → intrinsicAspect 0.36.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 500">
    <defs>
      <linearGradient id="sipCanBody" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${CORAL_LIGHT}" stop-opacity="0.9"/>
        <stop offset="25%" stop-color="${CORAL}"/>
        <stop offset="50%" stop-color="#D4543A"/>
        <stop offset="80%" stop-color="${CORAL}"/>
        <stop offset="100%" stop-color="${CORAL_LIGHT}" stop-opacity="0.7"/>
      </linearGradient>
      <linearGradient id="sipCanTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#C44E3A"/>
        <stop offset="100%" stop-color="${CORAL}"/>
      </linearGradient>
      <linearGradient id="sipCanBottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${CORAL}"/>
        <stop offset="100%" stop-color="#C44E3A"/>
      </linearGradient>
      <linearGradient id="sipHighlight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="white" stop-opacity="0.18"/>
        <stop offset="40%" stop-color="white" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="sipCoral" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${CORAL_LIGHT}"/>
        <stop offset="100%" stop-color="${CORAL}"/>
      </linearGradient>
      <filter id="sipShadow" x="-25%" y="-15%" width="150%" height="130%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.3"/>
      </filter>
      <filter id="sipGlow" x="-30%" y="-20%" width="160%" height="140%">
        <feGaussianBlur stdDeviation="25" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
      <radialGradient id="sipBgGlow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stop-color="${CORAL}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${DEEP_BROWN}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Ambient background glow -->
    <circle cx="90" cy="230" r="140" fill="url(#sipBgGlow)" opacity="0.9"/>
    <g filter="url(#sipShadow)">
      <!-- Can bottom -->
      <rect x="18" y="440" width="144" height="60" rx="30" fill="url(#sipCanBottom)"/>
      <!-- Can body -->
      <rect x="18" y="70" width="144" height="370" rx="0" fill="url(#sipCanBody)"/>
      <!-- Left highlight (cylindrical reflection) -->
      <rect x="22" y="70" width="28" height="370" fill="url(#sipHighlight)"/>
      <!-- Right subtle edge -->
      <rect x="145" y="70" width="17" height="370" fill="white" opacity="0.04"/>
      <!-- Brand band around can -->
      <rect x="18" y="180" width="144" height="140" fill="url(#sipCoral)" opacity="0.9"/>
      <rect x="18" y="180" width="144" height="30" fill="white" opacity="0.08"/>
      <rect x="18" y="290" width="144" height="30" fill="white" opacity="0.05"/>
      <!-- Sip Pulse text on band (simple arcs for label effect) -->
      <ellipse cx="90" cy="250" rx="42" ry="18" fill="none" stroke="white" stroke-width="1.5" opacity="0.15"/>
      <ellipse cx="90" cy="250" rx="36" ry="14" fill="none" stroke="white" stroke-width="1" opacity="0.10"/>
      <!-- Carbonation bubbles on body -->
      <circle cx="38" cy="120" r="4" fill="white" opacity="0.12"/>
      <circle cx="130" cy="100" r="3" fill="white" opacity="0.10"/>
      <circle cx="50" cy="350" r="5" fill="white" opacity="0.08"/>
      <circle cx="118" cy="320" r="3.5" fill="white" opacity="0.10"/>
      <circle cx="30" cy="200" r="2.5" fill="white" opacity="0.08"/>
      <circle cx="140" cy="280" r="3" fill="white" opacity="0.07"/>
      <!-- Sparkle accents -->
      <circle cx="55" cy="110" r="3" fill="${SPARKLE}" opacity="0.5"/>
      <circle cx="120" cy="380" r="2.5" fill="${SPARKLE}" opacity="0.4"/>
    </g>
    <!-- Can top -->
    <ellipse cx="90" cy="70" rx="72" ry="14" fill="url(#sipCanTop)" filter="url(#sipGlow)"/>
    <!-- Pull tab -->
    <ellipse cx="90" cy="65" rx="18" ry="5" fill="#A83E2E"/>
    <rect x="85" y="58" width="10" height="8" rx="3" fill="#B84A38"/>
  </svg>
`;

// A simple monogram mark for branding.
// Brand lockup: the monogram tile plus the brand name, so the brand is
// legible wherever the logo survives (see brandLockup in svg.ts).
const logo = brandLockup({
  tile: `
    <rect width="64" height="64" rx="14" fill="${MINT}" />
    <circle cx="32" cy="32" r="16" fill="none" stroke="${DEEP_BROWN}" stroke-width="4"/>
    <path d="M24 32 Q32 20 40 32 Q32 44 24 32Z" fill="${DEEP_BROWN}" opacity="0.7"/>
    <line x1="32" y1="20" x2="32" y2="12" stroke="${DEEP_BROWN}" stroke-width="2" stroke-linecap="round"/>
  `,
  name: 'SipPulse',
  nameColor: SAND,
  charWidth: 24,
});

export const sipPulseAd = defineAd({
  name: 'SipPulse Sparkling Citrus — Summer Drop',
  background: DEEP_BROWN,
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Real fruit. Zero sugar. All fizz.',
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
      intrinsicAspect: 0.36,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Order a Pack',
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
      content: '₹699 · 12-pack · Free delivery',
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
      markColor: SAND,
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
      content: 'First Sip Free',
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
      payload: 'https://sippulse.example/summer',
      minModulePx: 4,
      modules: 21,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'While supplies last. Delivery in 24h metro areas.',
      idealFontPx: 12,
      minFontPx: 9,
      maxLines: 2,
      weight: 400,
    },
  ],
});
