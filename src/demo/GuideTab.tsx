// A single scrollable, document-style page
// explaining the whole application to a first-time visitor. Static content
// only: no new engine/render dependencies, no dashboard-style panels.

import { Fragment } from 'react';
import { Icon } from './Icon';
import { InfoTooltip } from './InfoTooltip';

export interface GuideTabProps {
  readonly onBack: () => void;
}

const PHASES: readonly { name: string; text: string }[] = [
  {
    name: 'Normalise',
    text: "Turn the surface's raw numbers (size, safe area, interaction mode, viewing distance) into one flat shape: a usable rectangle, spacing, a tap-target floor and a text-size floor. Nothing later reads the raw surface again.",
  },
  {
    name: 'Classify & select',
    text: "Look only at the usable rectangle's width-to-height ratio. That picks one of five composition trees — how the ad is ARRANGED. It never decides what is shown, and never sees the surface's name.",
  },
  {
    name: 'Demand',
    text: 'Give every element a protected starting size and the hard floor it can never cross (a tap target, a legibility floor, a QR module size). Every element is attempted — nothing is excluded up front.',
  },
  {
    name: 'Place',
    text: "Start each brand mark in the first slot whose backdrop gives it enough contrast (3:1 by default) — or plan to put a plate behind it if none does.",
  },
  {
    name: 'Degrade',
    text: 'Solve the box model. While anything overflows, take ONE step on ONE element: width before height; worst priority first; and only the gentlest step that actually reduces the overflow. Every step is logged with its reason.',
  },
  {
    name: 'Reclaim & grow',
    text: 'Undo any step the final layout turned out not to need. If nothing needed degrading at all, let type grow uniformly on big surfaces, and let the hero absorb any space left over.',
  },
  {
    name: 'Position & validate',
    text: 'Round to whole pixels in a way that can never create an overlap, then re-check every hard constraint independently against the final geometry. This always runs.',
  },
];

const GLOSSARY: readonly { term: string; text: string }[] = [
  { term: 'Usable rect', text: "The surface's full rectangle minus its safe area — the only region the layout is ever computed against." },
  { term: 'Aspect class', text: "One of five bands the usable rect's width÷height falls into — decides which composition tree is used." },
  { term: 'Template', text: 'A tree of rows and columns (slots) saying how things are arranged — not where, and not how big. Sizes come from the content and the surface. A slot nobody is in takes no space.' },
  { term: 'Box model', text: 'The engine\u2019s own small flexbox: widths top-down, then heights. It reports exactly how many pixels overflow, horizontally and vertically.' },
  { term: 'Step', text: 'One rung of the ladder — shrink, allow "…", cut a line, move to another slot, or drop — applied to one element (or jointly to slot-mates that only help together).' },
  { term: 'Degradability', text: "fixed: may shrink and move, never loses content. shrinkable: may also be cut with an ellipsis. droppable: may finally be removed." },
  { term: 'Blocked', text: 'For each step, the worse-priority elements that were tried first and had no step that would have helped — the proof the victim was the right one.' },
  { term: 'Tap floor', text: 'The smallest a tappable element (button, QR) is allowed to be, on both axes, on a touch or pointer surface.' },
  { term: 'Text floor', text: "The hard floor no text element's rendered font size may go below on a given surface." },
];

export function GuideTab({ onBack }: GuideTabProps) {
  return (
    <div className="demo-guide">
      <section className="demo-guide-section">
        <h2>What this is</h2>
        <p>
          One ad spec, one resolver, any surface. Given a description of an ad's content and a description of a
          surface's geometry and constraints, the resolver computes a complete layout — not by picking from a set of
          pre-built breakpoints, but by genuinely recomposing the ad for that surface's shape and size. The same ad
          looks structurally different on a broadcast lower-third than it does on a retail kiosk, because it's solving
          a different geometry problem each time, not scaling one fixed design up or down.
        </p>
      </section>

      <section className="demo-guide-section">
        <h2>Try this first</h2>
        <ol className="demo-guide-steps">
          <li>Click through the surface chips and watch the same ad recompose differently on each.</li>
          <li>
            Pick <b>Compact card</b> — the stress case — and read the diagnostics timeline: legal goes first, then QR
            and badge, then the logo, and the headline, price and CTA survive intact. Each step says what it saved.
          </li>
          <li>
            Pick <b>Retail kiosk</b>, then drag the <b>Height</b> slider down in Custom surface — the layout recomposes
            (square → split → band) and degrades step by step, never overlapping.
          </li>
          <li>Click the headline on stage — the Element inspector explains exactly why it's that size.</li>
          <li>Toggle DOM ↔ Canvas renderer on the same surface — identical layout, two independent rendering backends.</li>
          <li>Try the "Micro" preset (160×160) — the stress case where almost nothing survives.</li>
          <li>
            Switch to a different ad in the ad picker and repeat step 1 — notice the <i>same</i> surfaces recompose
            differently again, because it's a different spec, not a different code path. FERN's wide, flat hero fights
            a different geometric battle than KEEL's tall bottle, so it recomposes differently even on the surfaces
            where KEEL looked comfortable.
          </li>
        </ol>
      </section>

      <section className="demo-guide-section">
        <h2>How the resolver thinks</h2>
        <p className="demo-text-muted">
          Every resolve() call runs the same seven phases, in the same order, on any spec and any surface:
        </p>
        <ol className="demo-guide-phases">
          {PHASES.map((phase) => (
            <li key={phase.name}>
              <b>{phase.name}</b> — {phase.text}
            </li>
          ))}
        </ol>
      </section>

      <section className="demo-guide-section">
        <h2>The priority ladder</h2>
        <p>
          When something has to give, the resolver takes exactly one step at a time, and the step is always chosen
          the same way. It resolves width before height (text height depends on width, never the reverse), and for
          that axis it walks priorities from worst to best. It takes the first element with a step that actually
          reduces the overflow, and uses that element's gentlest such step: shrink, then allow "…", then cut a line,
          then move, then — for droppable elements only — drop.
        </p>
        <blockquote className="demo-guide-quote">
          No element is ever degraded while an element of worse priority had a step that would have helped — and no
          step is ever taken that doesn't reduce the overflow.
        </blockquote>
      </section>

      <section className="demo-guide-section">
        <h2>ok / degraded / constrained</h2>
        <dl className="demo-guide-deflist">
          <dt>ok</dt>
          <dd>Nothing degraded.</dd>
          <dt>degraded</dt>
          <dd>Some elements shrank or moved but every hard constraint was met.</dd>
          <dt>constrained</dt>
          <dd>The surface was too small to satisfy every hard constraint even after every fallback.</dd>
        </dl>
      </section>

      <section className="demo-guide-section">
        <h2>Glossary</h2>
        <dl className="demo-guide-deflist">
          {GLOSSARY.map((entry, i) => (
            <Fragment key={entry.term}>
              <dt>
                {entry.term}
                {i === 0 && <InfoTooltip text="This whole glossary is just definitions like this one, shown inline instead of behind a hover — the same InfoTooltip component used throughout the Live Demo tab." />}
              </dt>
              <dd>{entry.text}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="demo-guide-section">
        <h2>What's real vs. placeholder</h2>
        <p>
          Everything about layout — the geometry, the constraint math, the degradation decisions — is real and
          genuinely computed for whatever spec and surface you give it. One thing in the visuals is not: the QR
          element renders as a decorative module grid, not a real scannable code, because this build has no
          QR-generation library. The payload string is real and flows through the same sizing and constraint logic a
          working QR would; only the pixels drawn on top are a placeholder standing in for one.
        </p>
      </section>

      <div className="demo-guide-back">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <Icon name="chevron-left" /> Back to live demo
        </button>
      </div>
    </div>
  );
}
