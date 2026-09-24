import type { NamedSurface } from '../surfaces';
import { SurfaceThumb } from './SurfaceThumb';

export interface SurfacePickerProps {
  readonly surfaces: readonly NamedSurface[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
}

export function SurfacePicker({ surfaces, selectedKey, onSelect }: SurfacePickerProps) {
  return (
    <div className="picker" role="radiogroup" aria-label="Surface">
      {surfaces.map((surface) => {
        const selected = surface.key === selectedKey;
        return (
          <button
            key={surface.key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`chip chip-surface${selected ? ' is-selected' : ''}`}
            onClick={() => onSelect(surface.key)}
          >
            <SurfaceThumb widthPx={surface.profile.widthPx} heightPx={surface.profile.heightPx} />
            <span className="chip-body">
              <span className="chip-label">{surface.label}</span>
              <span className="chip-dims mono">
                {surface.profile.widthPx} &times; {surface.profile.heightPx}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
