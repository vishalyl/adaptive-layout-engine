# Architecture — Adaptive Layout Engine

How the code is organised, how data flows through it, and why the resolver makes the decisions it makes. Written for someone reading the code for the first time, including in a live walkthrough.

---

## 1. The one idea

```
resolve(adSpec, surfaceProfile) -> ResolvedLayout
```

`resolve` is a pure function of its inputs (plus an injected text measurer). It reads no DOM and no globals, and it never sees a surface's *name*: only numbers and constraint unions. Everything it decides comes from geometry, constraints and the spec's priorities. That's why an unseen surface works with zero code changes.

The five files the brief names sit at the top of `src/`; everything they're built from sits in a folder beside them.

| Layer | Files | Responsibility | May import |
|-------|-------|----------------|------------|
| Spec | `src/spec.ts` | the ad element model, `defineAd()` | the engine |
| Engine | `src/resolver.ts` + `src/engine/` | constraint solving, geometry, validation | spec and engine only |
| Surfaces | `src/surfaces.ts` | the named surface profiles — the *only* place a surface has a name | spec and engine |
| Rendering | `src/render-dom.tsx` + `src/render/` | pixels (DOM or Canvas) | spec and engine |
| App | `src/App.tsx` + `src/demo/` | the demo shell, panels, creatives | everything |

`tests/purity.spec.ts` enforces the engine's boundary on `spec.ts`, `resolver.ts` and every file in `engine/`: no imports from the surfaces, the renderers or the app, no DOM globals, and no surface key or device word ("mobile", "kiosk", "broadcast", …) anywhere in their source, comments included.

---

## 2. Data flow

```
AdSpec ─────┐
            ├─► resolve() ─► ResolvedLayout ─► RenderDom / renderToCanvas
Surface ────┘       │
                    └─► Diagnostics (decisions, every step, drops, restores, violations)
```

### Inputs

- **`AdSpec`** (`spec.ts`): a flat list of elements, each a discriminated union member (`text | image | button | scan`) with a `role`, a `priority` (1 best … 5 worst) and a `degradability` (`fixed | shrinkable | droppable`). Optional `background` and `markColor` feed the contrast constraint.
- **`SurfaceProfile`** (`surface.ts`): size, safe area, `interaction` (`touch | pointer` with a tap floor, or `passive` with none), `viewing` (`near`, or `mid | far` with a text floor), optional `backdrop` regions and `minContrastRatio`.

### Output

- **`ResolvedLayout<Ids>`**: for every element id, either `PlacedElement` (rect in px, slot, typography for text *and* buttons, steps taken, contrast outcome) or `DroppedElement` (reason, steps taken). It also carries the slot rects (for the debug overlay), the status, the type scale and the full diagnostics.

---

## 3. The resolver, phase by phase (`resolver.ts`)

| # | Phase | Detail |
|---|-------|--------|
| 0 | Normalise | usable = full − safe area; content = usable − a margin; spacing = 2% of each axis (clamped); tap floor (null if passive); text floor (≥12px). The only code that reads `interaction.mode` or `viewing.distance`. |
| 1 | Classify | `aspect = usable.w / usable.h` → `ultra-wide ≥3.5`, `wide ≥1.35`, `square ≥0.8`, `tall ≥0.5`, else `ultra-tall`. |
| 2 | Select | aspect class → template tree (`templates.ts`). |
| 3 | Demand | per element: `idealScale` (protected start size) and `floorScale` (hard floor). Text: authored font, floored by the surface text floor and a per-role readability floor. Buttons: same, and the tap target sets their height. Images: a share of the content area (hero 8%, logo 0.6%), never below `minShortSidePx`. QR: floor `modules × minModulePx`. **Viewing distance** (read once, in phase 0) emphasises the glance elements: at mid/far distance the badge starts at 1.3× (of its authored size and of the text floor), the logo's area share is ×2.2 / ×4 (its height capped at 6% of the content width, so on a narrow column it can't crowd the badge), and the QR starts at 18% / 23% of √(content area) — capped at 65% of the short side, snapped to whole-pixel modules. Near surfaces are unchanged. Floors don't move, so under pressure all three shrink back. |
| 4 | Place | contrast-aware starting slot for each brand mark (§6). |
| 5 | Degrade | the loop (§5). |
| 6 | Reclaim | undo unneeded steps (§5.4). |
| 7 | Grow | only if nothing was degraded: all text and buttons scale by one factor g ≤ min(shortSide/480, 1.8) — the largest that still fits. Growth multiplies the *authored* size, so fine print a floor already lifted doesn't grow again and flatten the hierarchy. The hero grows into any space left. |
| 8 | Position | each element is placed inside the box its slot gave it (centred along the slot, aligned across it); rects are rounded by **edges**, which can't create an overlap between boxes that didn't overlap before rounding. Contrast plates are attached. |
| 9 | Validate | `validate.ts` independently re-checks overlap, bounds, safe area, tap targets, text floor, scan integrity and contrast on the final rects. |

---

## 4. Templates and the box model

### Templates (`templates.ts`)

A template is a tree of **groups** (rows/columns of nodes) and **slots** (rows/columns of elements). It fixes *arrangement* only:

| Template | Aspect | Arrangement |
|----------|--------|-------------|
| `band-horizontal` | ultra-wide | `[logo] [hero] [headline / price·badge / legal] [QR] [CTA]` — one line of sight |
| `split-horizontal` | wide | `[hero] [logo·badge / headline / price / CTA·QR / legal]` |
| `grid-square` | square | `logo·badge` / `[hero] [headline / price / QR]` / `CTA` / `legal` |
| `stack-vertical` | tall | `logo·badge / hero / headline / price / CTA·QR / legal` |
| `column-narrow` | ultra-tall | like tall, but the QR gets its own slot |

`rolePreference` lists each role's slots, best first; later entries are where REFLOW may move an element and where the contrast pass may place a mark (e.g. `secondary: ['detail', 'action']` lets a price move up beside the CTA; `branding: ['top', 'legal']` gives a logo a bottom sign-off).

Choosing a template from a table keyed by aspect class is **not** per-surface hardcoding: the key is derived from geometry, and every size inside the template comes from content and the surface.

### Box model (`box-model.ts`)

`solveBoxes(root, leavesBySlot, rect, gap)` sizes and positions the tree and reports overflow.

1. **Widths, top-down.** Each node has `minW` (narrowest acceptable) and `maxW` (widest useful). For text, `minW` is the narrowest width at which it still fits its line budget at its current font (found by binary search on the measurer), and `maxW` is its single-line width. A row gives children their `maxW` if it can; otherwise it shrinks children toward `minW` in proportion to how much each can give (rigid images, buttons and QRs give nothing); below Σ`minW` it reports horizontal overflow. Leftover width goes to `grow` children.
2. **Heights.** Every leaf's height is known at its width. A column stacks its children and water-fills leftover height into growable children up to their caps (a hero can only grow while it still fits its width); the rest becomes spacing via `justify`. Below Σheights it reports vertical overflow.
3. **Collapse.** A slot with no elements, or a group with no live children, is removed: no size, no gap.
4. **Honest overflow.** An overflowing container still returns proportionally compressed boxes (so positions stay non-overlapping), and the deficit is counted once, at the container that couldn't fit its children, not again in every child it squeezed.

---

## 5. Degradation (`degradation.ts` + the loop in `resolver.ts`)

### 5.1 The ladder

`availableRungs(state)` lists what an element may still do, gentlest first:

```
SHRINK_STEP* → ELLIPSIS → TRUNCATE_LINE* → REFLOW → DROP
```

- `fixed`: SHRINK_STEP, REFLOW. Never cut, never dropped.
- `shrinkable`: + ELLIPSIS, TRUNCATE_LINE. Never dropped.
- `droppable`: + DROP, last.
- A QR never gets SHRINK_STEP.

### 5.2 One iteration

```
solve the box model
if no overflow → done
axis := 'x' if horizontal overflow else 'y'          (width before height)
for band in priorities, worst (5) → best (1):
    for each live element in band:
        proposal := its gentlest rung that REDUCES the overflow on `axis`
                    (rungs that wouldn't help are skipped, not taken)
    if any proposals: victim := selectVictim(proposals); stop
    else: record the band's elements as `blocked`
if no proposals for x → try y (don't give up while height can still be fixed)
if no proposals for y → retry y in "relaxed" mode (see below)
if still none → constrained
apply the victim's step; log it (axis, overflow before → after, candidates, blocked)
```

`selectVictim` orders same-band proposals by: gentlest step, then fewest steps taken so far, then role (legal, incentive, scan, branding, secondary, action, hero, primary).

### 5.3 Three refinements

1. **Cut + move bundles.** ELLIPSIS/TRUNCATE_LINE that didn't help alone are carried into the REFLOW trial: a price that doesn't fit beside the CTA uncut does once it may end in "…". The pair is one logged step.
2. **Joint steps.** A row is as tall as its tallest member, so shrinking or dropping one of two equally tall slot-mates saves nothing. A step that doesn't help alone is retried on the element **and** its slot-mates of equal or worse priority. It never reaches a better priority.
3. **Relaxed height steps.** If no height step can avoid creating horizontal overflow, one that reduces the *total* overflow is accepted; the next iteration is a width iteration and fixes it, in priority order.

### 5.4 Reclaim

Greedy steps can overshoot: an element degraded early may not need it once a later step freed space. After convergence, the resolver tries undoing each element's most recent step, best priority first, and keeps any undo after which the layout still fits. Each undo is logged in `diagnostics.restored`.

### 5.5 Guarantees, and how they're tested

For every recorded step (`tests/degradation.spec.ts`, on every shipped combination, a 2× density and 1,800 random surfaces):

- `overflowAfter < overflowBefore`;
- every candidate is in the victim's priority band;
- `blocked` equals **exactly** the set of elements still on the surface with a worse priority, so each was tried first and had nothing that would help;
- joint-step partners never have a better priority;
- fixed elements are never cut or dropped; shrinkable ones are never dropped.

Termination: every step is irreversible and every ladder finite (≤10 shrink steps, one ellipsis, ≤maxLines−1 truncations, ≤prefs−1 moves, one drop). A bound of 500 iterations only guards against bugs.

### 5.6 Constrained

If no element anywhere has a helpful step, what's left can't be fixed by the spec's own rules (e.g. KEEL's bottle has a 48px minimum short side, which makes it 126px tall; on a 100px-tall banner that can't fit). Positioning then scales any over-sized content down to its box, fonts included. Nothing is clipped, the status is `constrained`, and the validator reports which floor was broken.

---

## 6. Contrast (`contrast.ts`)

- WCAG 2.x relative luminance and contrast ratio; default floor 3:1 (WCAG 1.4.11, non-text).
- `backdropColorsUnder(rect)` returns every colour that could be behind a rect: each intersecting backdrop region, plus the ad background unless one region fully covers it. It errs towards "possibly behind", because a spurious plate is better than a missed clash.
- **Placement (phase 4):** a mark starts in the first preferred slot whose worst-case contrast clears the floor. No step is spent.
- **Plate (phase 8):** if the final rect still fails, `contrast.plate` is set to white or near-black (whichever separates more from the mark), painted inside the mark's own rect.
- **Validation:** recomputed independently from spec + surface.

---

## 7. Renderers

- **`render-dom.tsx`**: absolutely positioned elements at **true surface pixels**; every position, size, font size and text alignment comes from the layout. It makes no layout decisions of its own. Text uses the same padding the engine budgeted (`textChrome.ts`); an ellipsis appears only where `typography.truncated` says content was cut. The demo's `StageFrame` fits the surface on screen with a CSS `transform`, so the browser lays out text at exactly the sizes the resolver measured.
- **`render-canvas.ts`**: draws the same layout to a canvas whose backing store is the true surface size (CSS scales it). It loads all images first and then draws synchronously, so overlapping redraws can't interleave. It paints plates and backdrops, and truncates with "…".
- **`scripts/check-render.mjs`**: renders every shipped ad on every shipped surface in real Chrome and fails if the browser reports any overflowing text, clipped CTA label, overlap, or element outside the surface.

---

## 8. Explaining one element's position

Every placement is traceable from `layout.diagnostics`, which `resolve()` returns with every layout (the demo's element inspector shows the per-element part):

1. `normalise` / `classify` / `select`: which template, and why.
2. `demand`: the element's floor, and why (e.g. "label floored at 32px by the surface's minimum text size").
3. `contrast`: whether it was placed elsewhere or plated, and the ratio.
4. `rungsApplied`: each step, what it saved, which worse-priority elements were tried first.
5. `restored`: steps undone.
6. The element inspector shows the resulting slot, rect, font, lines and steps.

---

## 9. Extending

- **New surface:** a `SurfaceProfile` value. No engine change.
- **New renderer:** consume `ResolvedLayout` + the spec. No engine change.
- **Broadcast safe areas:** title-safe/action-safe insets are already `safeArea`, subtracted before layout. A second, softer "action-safe" zone could become a backdrop-like region that only certain roles (CTA, legal) must avoid, checked by the same validator.
- **Print bleed:** bleed is the inverse of safe area: the hero may extend *into* it, text must stay out. That's a per-role inset: backgrounds and the hero lay out against the full rect, everything else against the safe rect. The box model already takes the rect as a parameter, so this is a second, larger content rect for growable roles.
- **New element type:** add a union member, its demand function and leaf model; the loop and box model are type-agnostic.
