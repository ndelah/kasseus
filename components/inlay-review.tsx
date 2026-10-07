import type { InlayDesign } from '@/lib/inlay-geometry';
import { hexColor } from '@/lib/color-separation';
export function InlayReview({
  design,
  baseColor,
  onColor,
}: {
  design: InlayDesign;
  baseColor: number;
  onColor: (n: number) => void;
}) {
  return (
    <div className="inlay-review">
      <fieldset>
        <legend>Colors</legend>
        <p className="color-help">
          Choose the case color. Other colors become inserts.
        </p>
        <div className="palette">
          {design.colors.map((color, i) => (
            <label key={i}>
              <input
                type="radio"
                name="case-color"
                checked={baseColor === i}
                onChange={() => onColor(i)}
                aria-label={`Use color ${i + 1} (${hexColor(color)}) for the case body`}
              />
              <span
                className="color-chip"
                style={{ background: hexColor(color) }}
                title={hexColor(color)}
              />
              <span>{baseColor === i ? 'Case body' : 'Inserts'}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
