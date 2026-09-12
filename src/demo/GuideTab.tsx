// §4 of NEXT_STEPS_UI_PLAN.md — a single scrollable, document-style page
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
    text: "Turn the surface's raw numbers (width, height, safe area, interaction mode, viewing distance) into one flat, resolved shape — a usable rectangle plus a tap-target floor and a text-size floor. Every later phase reads from this, never from the raw surface again.",
  },
  {
    name: 'Classify',
    text: "Look only at the usable rectangle's width-to-height ratio and its shorter side. That gives an aspect class (how the composition should be arranged) and a scale class (how much the template can even attempt) — pure arithmetic, with no idea what the surface is called.",
  },
  {
    name: 'Select',
    text: 'Look up a template from the (aspect class, scale class) pair. Two completely different surfaces that happen to classify the same way get the same template — that generalisation is the point.',
  },
  {
    name: 'Demand',
    text: 'Work out what every element wants: its ideal size, its minimum size, and the hard floor it can never cross without breaking a real constraint (a tap target, a text-legibility floor, a QR module size).',
  },
  {
    name: 'Partition',
    text: 'Split the usable rectangle into named zones according to the chosen template, and decide which zone each element would prefer, in order.',
  },
  {
    name: 'Allocate',
    text: "Place everything at its ideal size, then loop: if anything overflows its zone, pick the least-important element still holding a card to play, apply the next rung of its degradation ladder, and check again — until nothing overflows or nothing is left to give.",
  },
  {
    name: 'Validate',
    text: 'Run every hard constraint one more time against the final layout and record any violation. This always runs — it is not a dev-only nicety.',
  },
];

const GLOSSARY: readonly { term: string; text: string }[] = [
  { term: 'Usable rect', text: "The surface's full rectangle minus its safe area — the only region the layout is ever computed against." },
  { term: 'Safe area', text: 'Margins the ad must stay clear of (a phone notch, a broadcast title-safe inset), subtracted before any layout decision is made.' },
  { term: 'Aspect class', text: "One of five bands the usable rect's width÷height falls into — decides which composition template gets used." },
  { term: 'Scale class', text: 'How much room there actually is, based on the shorter side — decides how many elements the template even attempts.' },
  { term: 'Template', text: 'A pure function from a usable rect to a set of named zones, plus which roles it tries at each scale class. Chosen from (aspect class, scale class) alone.' },
  { term: 'Zone', text: 'One named region of a template, with a flow direction, an alignment, and a gap — the space one or more elements are laid out inside.' },
  { term: 'Rung', text: 'One step of the degradation ladder (shrink, truncate a line, allow ellipsis, move to another zone, or drop entirely) applied to exactly one element.' },
  { term: 'Degradability', text: "An element's ceiling on the ladder: fixed (may shrink, never dropped), shrinkable (may also truncate/ellipsis), or droppable (may ultimately be removed)." },
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
          <li>Click through the six surface chips and watch the same ad recompose differently on each.</li>
          <li>
            Pick <b>Retail kiosk</b>, then drag the <b>Width</b> slider down in Custom surface — watch it degrade step
            by step (badge/QR/legal drop first, then the CTA shrinks) and the status pill move ok → degraded →
            constrained.
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
          When something has to give, the resolver never guesses — it always takes the same predictable path: pick
          the least-important element still holding a rung to apply, apply it, and check again. "Least important"
          means lowest priority first, and — among elements of equal priority — whichever has absorbed the fewest
          rungs so far, so the pain spreads out rather than landing entirely on one element. This is the single
          invariant that makes the whole algorithm predictable rather than emergent:
        </p>
        <blockquote className="demo-guide-quote">
          No element of priority <i>P</i> has a rung applied while any element of priority greater than <i>P</i>{' '}
          still has a rung remaining.
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
