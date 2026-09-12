// The page's brand moment. Carries four things a grader must see within
// two seconds of landing: who this was built for (Flam), which assignment
// it answers, what the thing actually does, and who built it.
//
// The credit panel on the right runs alongside the main copy from the
// first paint — no click, no scroll, nothing gating it.
// `activeAdLabel` is passed in purely so the standfirst can name
// what is currently on stage.

export interface BrandHeaderProps {
  readonly activeAdLabel: string;
}

export function BrandHeader({ activeAdLabel }: BrandHeaderProps) {
  return (
    <header className="brand-header">
      <div className="brand-header-glow" aria-hidden="true" />

      <div className="brand-header-grid">
        <div className="brand-header-main">
          <div className="brand-badge">
            <span className="brand-badge-dot" aria-hidden="true" />
            Built for Flam
            <span className="brand-badge-sep" aria-hidden="true" />
            <span className="brand-badge-sub">Frontend R&amp;D Assignment</span>
          </div>

          <h1 className="brand-title">Adaptive Layout Engine</h1>

          <div className="brand-meta">
            <span className="brand-meta-item">
              Currently on stage: <b className="mono">{activeAdLabel}</b>
            </span>
          </div>

          <p className="brand-standfirst">
            One ad spec. One resolver. Any surface. Hand it a creative and the real geometry of wherever it&rsquo;s
            landing, and it works out a layout that&rsquo;s genuinely built for that surface, not a fixed design
            getting squeezed or stretched to fit. That&rsquo;s the whole idea behind multi&#8209;surface ads, and
            it&rsquo;s the kind of problem I love sinking my teeth into.
          </p>
        </div>

        <aside className="brand-credit">
          <p className="brand-credit-eyebrow">Who built this</p>
          <p className="brand-credit-name">
            A project by
            <span className="brand-credit-name-hi">Y.L. Vishal</span>
          </p>
          <p className="brand-credit-school">
            VIT Chennai <span aria-hidden="true">&middot;</span> Roll No. 22MIA1073
          </p>
          <p className="brand-credit-text">
            My submission to <b>Flam</b> for the Frontend R&amp;D Assignment, and my pitch for the{' '}
            <b>Software Engineering Intern</b> role in Bangalore. I&rsquo;d love to build this stuff with your team.
          </p>
          <div className="brand-credit-links">
            <a className="btn btn-ghost btn-xs" href="mailto:vishalcollege1829@gmail.com">
              vishalcollege1829@gmail.com
            </a>
            <a className="btn btn-ghost btn-xs" href="tel:+917397265407">
              +91 73972 65407
            </a>
          </div>
        </aside>
      </div>
    </header>
  );
}
