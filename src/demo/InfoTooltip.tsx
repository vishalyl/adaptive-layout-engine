// A small "?" trigger next to any label a
// first-time visitor wouldn't already understand. Hover opens it on
// desktop; a tap toggles it open on touch, since CSS-only `:hover` doesn't
// exist there. No tooltip library — a plain `position: absolute` popover
// styled with the existing demo tokens is enough for this scope.

import { useEffect, useId, useRef, useState } from 'react';

export interface InfoTooltipProps {
  readonly text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  // Closes on outside-click or Escape — a hover-only affordance would leave
  // touch users with no way to dismiss it, and a click-only one would leave
  // it open forever once tapped.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span
      className="demo-info-tooltip"
      ref={rootRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="demo-info-trigger"
        aria-label={text}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={popoverId} className="demo-info-popover">
          {text}
        </span>
      )}
    </span>
  );
}
