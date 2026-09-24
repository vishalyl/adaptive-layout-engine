// The visual padding every text/badge box reserves inside its own rect.
// `render-dom.tsx`'s TextNode applies this as CSS `padding` with
// `box-sizing: border-box` — which shrinks a box's *content* area rather
// than enlarging the box, so if the engine sized that box to exactly fit
// its unpadded text, adding CSS padding on top silently steals room the
// text needs and causes clipped/rewrapped content. The fix is for the
// engine to budget this padding into every text element's demand and zone
// measurement up front (computeTextDemand / measureOccupant in
// resolver.ts), the same way computeButtonDemand already bakes
// `paddingRatio` into a button's demanded width — so the rect handed to the
// renderer already has room for the padding the renderer is going to add.
//
// Living under src/engine/ (not src/render/) keeps this a plain, DOM-free
// constant table that both sides import — the engine budgets it, the DOM
// renderer applies it — rather than two independently-maintained copies of
// the same numbers drifting apart.

import type { Role } from '../spec';

export interface TextPadding {
  readonly x: number;
  readonly y: number;
}

const DEFAULT_TEXT_PADDING: TextPadding = { x: 10, y: 6 };
// Legal/fine-print gets a tighter inset — it's small text that doesn't need
// as much breathing room, and giving it the default padding would eat a
// disproportionate share of its already-small font size.
const LEGAL_TEXT_PADDING: TextPadding = { x: 4, y: 2 };

export function textPaddingFor(role: Role): TextPadding {
  return role === 'legal' ? LEGAL_TEXT_PADDING : DEFAULT_TEXT_PADDING;
}

// A small width buffer added on top of the padding budget above. The demo
// renders every surface at true pixel geometry and then scales the whole
// thing down visually with a CSS transform (StageFrame) — which means a
// text box's actual on-screen font-size is very often a non-integer number
// of CSS pixels (e.g. a 40px resolved headline shown at 0.39x scale renders
// at 15.5556px). At sizes like that, font hinting/sub-pixel shaping can
// legitimately advance a glyph run by a fraction of a pixel more than the
// same measurer's `measureText` predicted at the true, unscaled size — and
// a box sized with zero slack beyond that prediction has nowhere to absorb
// the difference, so a single line of text can tip into wrapping and get
// clipped by the renderer's line-clamp. This margin is cheap insurance
// against that; it's independent of TEXT_PADDING, which exists for visual
// breathing room, not measurement slack.
export const TEXT_WIDTH_SAFETY_MARGIN_PX = 2;
