// ResolvedLayout -> React/DOM. The renderer makes no layout decisions of
// its own: every `left/top/width/height` below is copied verbatim, in true
// surface pixels, from `entry.rect`, and every font size from
// `entry.typography`. Zero `@media` queries, zero flexbox/grid deciding size
// or position (flexbox only centres content inside an already-sized box).
//
// It renders at the surface's REAL size. Fitting a 1920px surface into a
// preview is the host's job (StageFrame applies a CSS transform to this
// whole tree), so text is laid out by the browser at exactly the pixel size
// the resolver measured — which is what makes "no clipping" hold on screen,
// not just in the engine's arithmetic.
//
// The renderer needs two inputs: `layout` for geometry (from resolve()) and
// `spec` for content (text/image src/label/payload never change with the
// surface, so resolve() doesn't carry them — only where things go).

import type { CSSProperties } from 'react';
import type { AdElement, AdSpec, Role } from './spec';
import type { LayoutEntry, ResolvedLayout } from './resolver';
import type { Rect } from './engine/types';
import { textPaddingFor } from './engine/textChrome';

// The KEEL brand tokens, now also the default
// `AdPalette` below. Duplicated here rather than imported from
// src/demo/creative.ts — this renderer must import nothing from demo/,
// the same independence render-canvas.ts is held to, so each
// backend carries its own tiny copy of the palette rather than sharing one
// through a path this component isn't allowed to take.
const KEEL_MARINE = '#0E2A38';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';

// --- helpers ---

// Lighten / darken a hex colour by a given percentage (0–100).
// Kept here because this renderer must not import from demo/.
function darken(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round((pct / 100) * 255));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round((pct / 100) * 255));
  const b = Math.max(0, (n & 0xff) - Math.round((pct / 100) * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
const KEEL_SIGNAL = '#F2B705';

// Must match FONT_FAMILY in resolver.ts and render-canvas.ts. The measurer
// is told to measure in Archivo, so a DOM backend that draws in anything
// else is drawing text the resolver never sized. Duplicated here rather
// than imported because this renderer must import nothing from demo/
// and nothing from the other backend.
const FONT_FAMILY = 'Archivo, sans-serif';

// Visual identity is content, not layout — the resolver never sees this and
// never decides anything from it. It's a plain data prop, the same way
// `element.content`/`element.label` already flow through the spec, so each
// ad (src/demo/creatives/) can look genuinely different while both renderers stay
// exactly as ad-agnostic as the geometry they draw.
export interface AdPalette {
  readonly background: string;
  readonly text: string;
  readonly textMuted: string; // legal / fine print
  readonly badgeBg: string;
  readonly badgeText: string;
  readonly ctaBg: string;
  readonly ctaText: string;
}

const DEFAULT_PALETTE: AdPalette = {
  background: KEEL_MARINE,
  text: KEEL_SAND,
  textMuted: 'rgba(237, 227, 208, 0.7)',
  badgeBg: KEEL_SEAGLASS,
  badgeText: KEEL_MARINE,
  ctaBg: KEEL_SIGNAL,
  ctaText: KEEL_MARINE,
};

function textColorForRole(role: Role, palette: AdPalette): string {
  return role === 'legal' ? palette.textMuted : palette.text;
}

export interface RenderDomProps<Ids extends string> {
  readonly spec: AdSpec<readonly AdElement<Ids>[]>;
  readonly layout: ResolvedLayout<Ids>;
  // Draws zone boundaries and per-element id/priority labels — cheap to
  // build, and it makes the algorithm visible to anyone skimming the demo.
  readonly showDebugOverlay?: boolean;
  // Powers the element inspector — a click reports the id upward,
  // the currently-selected id gets a visible highlight. Both optional: a
  // renderer consumer that doesn't want interactivity just omits them.
  readonly selectedElementId?: string | null;
  readonly onSelectElement?: (id: string) => void;
  // Defaults to the original KEEL tokens so any existing caller that omits
  // this keeps looking exactly as it did before.
  readonly palette?: AdPalette;
}

interface NodeProps {
  readonly element: AdElement;
  readonly entry: LayoutEntry;
  readonly selected?: boolean | undefined;
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly palette: AdPalette;
}

const rectStyle = (rect: Rect): CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.w,
  height: rect.h,
  boxSizing: 'border-box',
});

const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const;

// Shared by every node: the click handler and the selection highlight.
// Kept as a small object spread rather than its own component, since each
// node already has its own required style fields to merge with these.
function interactionProps(element: AdElement, selected: boolean | undefined, onSelect: ((id: string) => void) | undefined) {
  return {
    onClick: onSelect ? () => onSelect(element.id) : undefined,
    style: {
      cursor: onSelect ? 'pointer' : undefined,
      outline: selected ? '2px solid #F2B705' : undefined,
      outlineOffset: selected ? '-2px' : undefined,
    } as CSSProperties,
  };
}

function TextNode({ element, entry, selected, onSelect, palette }: NodeProps) {
  if (!entry.placed || element.type !== 'text') return null;
  const typography = entry.typography;
  const interaction = interactionProps(element, selected, onSelect);
  // The badge (role 'incentive') is the one text element styled as a filled
  // chip. Background and radius never change the box's outer size.
  const isBadge = element.role === 'incentive';
  // The same padding the resolver budgeted into this rect (textChrome.ts),
  // applied inside it via border-box — so the content area is exactly what
  // the text was measured against.
  const pad = textPaddingFor(element.role);
  const fontPx = typography?.fontPx ?? element.idealFontPx;
  const lines = typography?.lines ?? element.maxLines;
  const truncated = typography?.truncated ?? false;
  // A single line uses nowrap + text-overflow; several lines use line-clamp.
  // Either way an ellipsis appears only where the resolver says content was
  // actually cut (`truncated`).
  const overflowStyle: CSSProperties =
    lines <= 1
      ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: truncated ? 'ellipsis' : 'clip' }
      : {
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: lines,
          textOverflow: truncated ? 'ellipsis' : 'clip',
        };
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        fontSize: `${fontPx}px`,
        fontFamily: FONT_FAMILY,
        lineHeight: 1.25,
        fontWeight: element.weight,
        letterSpacing: element.tracking !== undefined ? `${element.tracking}px` : undefined,
        color: isBadge ? palette.badgeText : textColorForRole(element.role, palette),
        padding: `${pad.y}px ${pad.x}px`,
        boxSizing: 'border-box',
        background: isBadge ? palette.badgeBg : undefined,
        borderRadius: isBadge ? 999 : 0,
        textAlign: isBadge ? 'center' : TEXT_ALIGN[typography?.align ?? 'start'],
        ...overflowStyle,
      }}
      data-element-id={element.id}
      data-role={element.role}
      data-kind="text"
      data-truncated={truncated ? 'true' : 'false'}
    >
      {element.content}
    </div>
  );
}

function ImageNode({ element, entry, selected, onSelect, palette }: NodeProps) {
  if (!entry.placed || element.type !== 'image') return null;
  const interaction = interactionProps(element, selected, onSelect);
  const minDim = Math.min(entry.rect.w, entry.rect.h);
  // A soft lightening backdrop behind hero/logo art — mostly invisible at
  // large sizes, but at small render sizes it's what keeps a dark-toned
  // asset (e.g. a near-black product photo) from disappearing into an
  // equally-dark ad background. `22` hex (~13% alpha) was `08` (~3%) —
  // too faint to register at the sizes small surfaces actually use.
  // A contrast plate (resolver.ts `attachContrast`) replaces the soft glow:
  // the resolver found this mark below the surface's contrast floor against
  // what is behind it, so it gets a solid fill inside its own rect, with
  // the mark inset so the plate reads as a deliberate frame.
  const plate = entry.contrast?.plate ?? null;
  const bgCircle = plate
    ? plate
    : minDim > 40
      ? `radial-gradient(circle at 50% 50%, ${palette.text}22 0%, transparent 70%)`
      : undefined;
  // NOTE: no overflow:hidden — hero images must render at their full
  // computed rect.  The resolver's cross-axis clamp already keeps the
  // image within the zone's bounds, so clipping the image on overflow
  // was double-enforcing and would silently hide the very overflow the
  // resolver is trying to detect in the first place.
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bgCircle,
        borderRadius: 8,
        // Pixels, not '12%': percentage padding resolves against the
        // containing block (the whole surface), not this element.
        padding: plate ? Math.round(minDim * 0.12) : undefined,
        boxSizing: 'border-box',
      }}
      data-element-id={element.id}
      data-role={element.role}
      data-contrast-plate={plate ?? undefined}
    >
      <img
        src={element.src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: element.fit }}
      />
    </div>
  );
}

function ButtonNode({ element, entry, selected, onSelect, palette }: NodeProps) {
  if (!entry.placed || element.type !== 'button') return null;
  // The label size the resolver actually chose (it shrinks and grows too).
  const fontPx = entry.typography?.fontPx ?? element.idealFontPx;
  const interaction = interactionProps(element, selected, onSelect);
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        // The one legitimate use of flexbox in the ad render path: centring
        // a label inside a box whose size was already fully decided by the
        // resolver. Flexbox renders the decision here; it does not make one.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontPx}px`,
        fontFamily: FONT_FAMILY,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        // The ad's one accent color, spent exactly once — this is
        // that one place.  A subtle gradient and shadow give the button a
        // tactile, pressable feel that flat solid colour lacks.
        background: `linear-gradient(180deg, ${palette.ctaBg}, ${darken(palette.ctaBg, 15)} )`,
        boxShadow: `0 2px 8px ${darken(palette.ctaBg, 25)}40`,
        color: palette.ctaText,
        borderRadius: 999,
        cursor: 'pointer',
        transition: 'filter 150ms ease',
      }}
      data-element-id={element.id}
      data-role={element.role}
      data-kind="button"
    >
      <span data-label="true" style={{ whiteSpace: 'nowrap' }}>{element.label}</span>
    </div>
  );
}

// QR code placeholder: a proper QR-like pattern with finder patterns
// (the three square corners) and a randomized data area, framed as a card
// so it reads as a deliberate "scan me" target rather than a stray white
// square. `entry.rect` is exactly the side the resolver chose (its module
// floor, or bigger when viewed from a distance) — it never grows just
// because its zone has room to spare, so every bit of this card's chrome
// (outer padding, caption row, gap) has to be budgeted OUT of that same
// box, the same lesson as the text
// padding fix above: adding chrome on top of an already-exact box, rather
// than carving it out of that box's own budget, silently overflows. The
// caption is dropped below a size threshold rather than let it overflow a
// small QR (e.g. the compact-banner stress case).
const SCAN_OUTER_PAD = 6;
const SCAN_CAPTION_H = 11;
const SCAN_CAPTION_GAP = 3;
const SCAN_MIN_PATTERN_PX = 24; // below this a caption would crowd out legibility — skip it

function ScanNode({ element, entry, selected, onSelect }: NodeProps) {
  if (!entry.placed || element.type !== 'scan') return null;
  const captionReserve = SCAN_CAPTION_H + SCAN_CAPTION_GAP;
  const rawBudget = Math.min(entry.rect.w, entry.rect.h) - 2 * SCAN_OUTER_PAD;
  const showCaption = rawBudget - captionReserve >= SCAN_MIN_PATTERN_PX;
  const patternBudget = Math.max(SCAN_MIN_PATTERN_PX, rawBudget - (showCaption ? captionReserve : 0));
  const cellSize = Math.max(2, Math.floor(patternBudget / 25));
  const gridSize = Math.floor(patternBudget / cellSize);
  const cellPx = cellSize;
  const interaction = interactionProps(element, selected, onSelect);
  // Deterministic pseudo-random pattern seeded by payload length so it's
  // the same for a given QR but looks different across different ads.
  const seed = element.payload.length * 7 + element.id.length;
  // An integer hash per cell (not a linear formula, which produces long runs
  // of identical cells and reads as a blank white box).
  const seededRandom = (i: number) => {
    let h = Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 7, 40503);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const finderSize = Math.min(7, Math.max(5, Math.floor(gridSize / 5)));
  const cells = Array.from({ length: gridSize * gridSize }, (_, i) => {
    const gx = i % gridSize;
    const gy = Math.floor(i / gridSize);
    // Finder patterns: top-left, top-right, bottom-left
    const isTopLeft = gx < finderSize && gy < finderSize;
    const isTopRight = gx >= gridSize - finderSize && gy < finderSize;
    const isBottomLeft = gx < finderSize && gy >= gridSize - finderSize;
    if (isTopLeft || isTopRight || isBottomLeft) {
      const fx = isTopRight ? gx - (gridSize - finderSize) : gx;
      const fy = isTopRight || isBottomLeft ? gy - (isBottomLeft ? gridSize - finderSize : 0) : gy;
      const isBorder = fx === 0 || fy === 0 || fx === finderSize - 1 || fy === finderSize - 1;
      const isInner = fx >= 2 && fy >= 2 && fx <= finderSize - 3 && fy <= finderSize - 3;
      return isBorder || isInner ? 1 : 0;
    }
    // Random data cells
    return seededRandom(i) > 0.5 ? 1 : 0;
  });
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SCAN_CAPTION_GAP,
        padding: SCAN_OUTER_PAD,
        boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 10,
      }}
      data-element-id={element.id}
      data-role={element.role}
      title={element.payload}
    >
      {/* QR pattern */}
      <div
        style={{
          width: gridSize * cellPx,
          height: gridSize * cellPx,
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, ${cellPx}px)`,
          gridTemplateRows: `repeat(${gridSize}, ${cellPx}px)`,
          background: '#FFFFFF',
          borderRadius: 4,
        }}
      >
        {cells.map((v, i) => (
          <div
            key={i}
            style={{
              width: cellPx,
              height: cellPx,
              background: v ? '#0E2A38' : '#FFFFFF',
            }}
          />
        ))}
      </div>
      {/* URL text below QR — only when the box has genuine room for it */}
      {showCaption && (
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: gridSize * cellPx }}>
          {element.payload}
        </div>
      )}
    </div>
  );
}

function ZoneOverlay({ layout }: { layout: ResolvedLayout }) {
  return (
    <>
      {layout.zones.map((zone) => (
        <div
          key={zone.id}
          style={{
            ...rectStyle(zone.rect),
            border: '1px dashed rgba(255,0,128,0.6)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 9, color: 'rgba(255,0,128,0.9)', fontFamily: 'monospace' }}>
            {zone.id}
          </span>
        </div>
      ))}
    </>
  );
}

function ElementOverlay({ elements }: { elements: Readonly<Record<string, LayoutEntry>> }) {
  return (
    <>
      {Object.values(elements).map((entry) =>
        entry.placed ? (
          <div
            key={entry.id}
            style={{ ...rectStyle(entry.rect), border: '1px solid rgba(0,140,255,0.7)', pointerEvents: 'none' }}
          >
            <span
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                fontSize: 9,
                color: '#fff',
                background: 'rgba(0,140,255,0.85)',
                padding: '1px 3px',
                fontFamily: 'monospace',
              }}
            >
              {entry.id}·{entry.role}
            </span>
          </div>
        ) : null,
      )}
    </>
  );
}

export function RenderDom<Ids extends string>({
  spec,
  layout,
  showDebugOverlay,
  selectedElementId,
  onSelectElement,
  palette = DEFAULT_PALETTE,
}: RenderDomProps<Ids>) {
  return (
    <div
      data-surface-root="true"
      style={{
        position: 'relative',
        width: layout.surface.full.w,
        height: layout.surface.full.h,
        overflow: 'hidden',
        // Subtle radial gradient gives the ad a "lit from above" depth that
        // flat solid colour lacks — a small but noticeable quality bump.
        background: palette.background === '#ffffff'
          ? 'radial-gradient(ellipse at 50% 0%, #f8f6f3 0%, #ffffff 60%)'
          : `linear-gradient(180deg, ${darken(palette.background, 8)} 0%, ${palette.background} 40%)`,
      }}
    >
      {/* Surface backdrop regions (e.g. a lit header strip) — painted so the
          viewer can see what the contrast constraint reacted to. */}
      {layout.surface.backdrops.map((b, i) => (
        <div
          key={`backdrop-${i}`}
          aria-hidden="true"
          style={{ ...rectStyle(b.rect), background: b.color, pointerEvents: 'none' }}
        />
      ))}
      {spec.elements.map((element) => {
        const entry = layout.elements[element.id as Ids];
        if (!entry) return null;
        const nodeProps = { element, entry, selected: element.id === selectedElementId, onSelect: onSelectElement, palette };
        switch (element.type) {
          case 'text':
            return <TextNode key={element.id} {...nodeProps} />;
          case 'image':
            return <ImageNode key={element.id} {...nodeProps} />;
          case 'button':
            return <ButtonNode key={element.id} {...nodeProps} />;
          case 'scan':
            return <ScanNode key={element.id} {...nodeProps} />;
        }
      })}
      {showDebugOverlay && <ZoneOverlay layout={layout} />}
      {showDebugOverlay && <ElementOverlay elements={layout.elements} />}
    </div>
  );
}
