// ResolvedLayout -> React/DOM. This is the ONLY renderer allowed to make
// layout decisions of its own — and it doesn't: every `left/top/width/height`
// below is copied verbatim, in px, from `entry.rect`. Zero `@media` queries,
// zero flexbox/grid deciding size or position. Flexbox appears exactly once,
// to centre a button label *inside* its own already-sized box — that is
// trivial self-centring, not a layout decision, and is called out below.
//
// The renderer needs two inputs: `layout` for geometry (from resolve()) and
// `spec` for content (text/image src/label/payload never change with the
// surface, so resolve() doesn't carry them — only where things go).

import type { CSSProperties } from 'react';
import type { AdElement, AdSpec, Role } from '../engine/spec';
import type { LayoutEntry, ResolvedLayout } from '../engine/resolver';
import type { Rect } from '../engine/types';

// The KEEL brand tokens from BUILD_SPEC.md §6.3. Duplicated here rather
// than imported from src/demo/creative.ts — this renderer must import
// nothing from demo/ (§13.1), the same independence render-canvas.ts is
// held to, so each backend carries its own tiny copy of the palette rather
// than sharing one through a path this component isn't allowed to take.
const KEEL_MARINE = '#0E2A38';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';
const KEEL_SIGNAL = '#F2B705';

// Signal yellow is spent in exactly one place (the CTA); everything else
// reads off the sand/marine pair, with the badge picking up the seaglass
// accent instead of competing for the same attention.
function textColorForRole(role: Role): string {
  return role === 'legal' ? 'rgba(237, 227, 208, 0.7)' : KEEL_SAND;
}

export interface RenderDomProps<Ids extends string> {
  readonly spec: AdSpec<readonly AdElement<Ids>[]>;
  readonly layout: ResolvedLayout<Ids>;
  // Draws zone boundaries and per-element id/priority labels — cheap to
  // build, and it makes the algorithm visible to anyone skimming the demo.
  readonly showDebugOverlay?: boolean;
  // Powers the element inspector (§14.6) — a click reports the id upward,
  // the currently-selected id gets a visible highlight. Both optional: a
  // renderer consumer that doesn't want interactivity just omits them.
  readonly selectedElementId?: string | null;
  readonly onSelectElement?: (id: string) => void;
}

interface NodeProps {
  readonly element: AdElement;
  readonly entry: LayoutEntry;
  readonly selected?: boolean | undefined;
  readonly onSelect?: ((id: string) => void) | undefined;
}

const rectStyle = (rect: Rect): CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.w,
  height: rect.h,
  boxSizing: 'border-box',
});

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

function TextNode({ element, entry, selected, onSelect }: NodeProps) {
  if (!entry.placed || element.type !== 'text') return null;
  const typography = entry.typography;
  const interaction = interactionProps(element, selected, onSelect);
  // The badge (role 'incentive') is the one text element styled as a
  // filled chip rather than bare type — background-color and radius never
  // change the box's outer size, so this stays purely decorative: the
  // resolver's rect, and therefore the measurer's width assumption, is
  // untouched.
  const isBadge = element.role === 'incentive';
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        fontSize: typography?.fontPx ?? element.idealFontPx,
        lineHeight: 1.25,
        fontWeight: element.weight,
        letterSpacing: element.tracking !== undefined ? `${element.tracking}px` : undefined,
        color: isBadge ? KEEL_MARINE : textColorForRole(element.role),
        background: isBadge ? KEEL_SEAGLASS : undefined,
        borderRadius: isBadge ? 4 : undefined,
        textAlign: isBadge ? 'center' : undefined,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: typography?.lines ?? element.maxLines,
        textOverflow: typography?.truncated ? 'ellipsis' : 'clip',
      }}
      data-element-id={element.id}
      data-role={element.role}
    >
      {element.content}
    </div>
  );
}

function ImageNode({ element, entry, selected, onSelect }: NodeProps) {
  if (!entry.placed || element.type !== 'image') return null;
  const interaction = interactionProps(element, selected, onSelect);
  return (
    <img
      src={element.src}
      alt=""
      onClick={interaction.onClick}
      style={{ ...rectStyle(entry.rect), ...interaction.style, objectFit: element.fit }}
      data-element-id={element.id}
      data-role={element.role}
    />
  );
}

function ButtonNode({ element, entry, selected, onSelect }: NodeProps) {
  if (!entry.placed || element.type !== 'button') return null;
  const typography = entry.typography;
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
        fontSize: typography?.fontPx ?? element.idealFontPx,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        // Signal yellow, spent exactly once (§6.3) — this is that one place.
        background: KEEL_SIGNAL,
        color: KEEL_MARINE,
        borderRadius: 4,
      }}
      data-element-id={element.id}
      data-role={element.role}
    >
      {element.label}
    </div>
  );
}

// There is no QR-generation library in this build — the payload is real,
// the rendered mark is a deliberately simple placeholder grid standing in
// for one, sized exactly at the resolver's computed rect. Swapping in a
// real QR renderer later would not touch layout at all: this component
// only ever reads `entry.rect`.
function ScanNode({ element, entry, selected, onSelect }: NodeProps) {
  if (!entry.placed || element.type !== 'scan') return null;
  // A percentage `padding` here would resolve against the containing
  // block's width (the whole ad surface), not this element's own small
  // box, since padding percentages on an absolutely-positioned element are
  // defined relative to the containing block — not the box itself. That
  // quietly zeroed out the grid entirely on anything but a near-full-width
  // element. Computing the padding in px from the element's own rect avoids
  // the trap.
  const pad = Math.round(Math.min(entry.rect.w, entry.rect.h) * 0.08);
  const interaction = interactionProps(element, selected, onSelect);
  return (
    <div
      onClick={interaction.onClick}
      style={{
        ...rectStyle(entry.rect),
        ...interaction.style,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: 'repeat(7, 1fr)',
        padding: pad,
        background: '#fff',
      }}
      data-element-id={element.id}
      data-role={element.role}
      title={element.payload}
    >
      {Array.from({ length: 49 }, (_, i) => (
        <div key={i} style={{ background: i % 3 === 0 || i % 5 === 0 ? '#0E2A38' : 'transparent' }} />
      ))}
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
            position: 'absolute',
            left: zone.rect.x,
            top: zone.rect.y,
            width: zone.rect.w,
            height: zone.rect.h,
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
}: RenderDomProps<Ids>) {
  return (
    <div
      style={{
        position: 'relative',
        width: layout.surface.full.w,
        height: layout.surface.full.h,
        overflow: 'hidden',
        background: KEEL_MARINE,
      }}
    >
      {spec.elements.map((element) => {
        const entry = layout.elements[element.id as Ids];
        if (!entry) return null;
        const nodeProps = { element, entry, selected: element.id === selectedElementId, onSelect: onSelectElement };
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
