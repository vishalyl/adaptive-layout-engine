import type { NamedSurface } from './surfaces';

export interface SurfacePickerProps {
  readonly surfaces: readonly NamedSurface[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
}

export function SurfacePicker({ surfaces, selectedKey, onSelect }: SurfacePickerProps) {
  return (
    <div className="demo-picker">
      {surfaces.map((surface) => (
        <button
          key={surface.key}
          type="button"
          className={`demo-chip${surface.key === selectedKey ? ' selected' : ''}`}
          onClick={() => onSelect(surface.key)}
        >
          {surface.label}
          <span className="demo-chip-dims">
            {surface.profile.widthPx} × {surface.profile.heightPx}
          </span>
        </button>
      ))}
    </div>
  );
}
