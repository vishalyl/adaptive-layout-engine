import type { NamedAd } from './creatives';

export interface AdPickerProps {
  readonly ads: readonly NamedAd[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
}

export function AdPicker({ ads, selectedKey, onSelect }: AdPickerProps) {
  return (
    <div className="picker" role="radiogroup" aria-label="Creative">
      {ads.map((ad) => {
        const selected = ad.key === selectedKey;
        return (
          <button
            key={ad.key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`chip chip-ad${selected ? ' is-selected' : ''}`}
            onClick={() => onSelect(ad.key)}
          >
            {/* Reads the ad's own palette — the same data the renderer
                uses — so the swatch can never drift from the creative. */}
            <span className="chip-swatch" aria-hidden="true">
              <i style={{ background: ad.palette.background }} />
              <i style={{ background: ad.palette.badgeBg }} />
              <i style={{ background: ad.palette.ctaBg }} />
            </span>
            <span className="chip-label">{ad.label}</span>
          </button>
        );
      })}
    </div>
  );
}
