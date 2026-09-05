import type { InlayDesign } from '@/lib/inlay-geometry';
import { hexColor } from '@/lib/color-separation';
import type { SupportedModel } from '@/lib/models';
export function InlayReview({
  design,
  model,
  baseColor,
  onColor,
}: {
  design: InlayDesign;
  model: SupportedModel;
  baseColor: number;
  onColor: (n: number) => void;
}) {
  const path = (rings: number[][][]) =>
    rings.map((r) => `M${r.map((p) => p.join(',')).join('L')}Z`).join('');
  return (
    <div className="inlay-review">
      <fieldset>
        <legend>Choose your case color</legend>
        <div className="palette">
          {design.colors.map((color, i) => (
            <label key={i}>
              <input
                type="radio"
                name="case-color"
                checked={baseColor === i}
                onChange={() => onColor(i)}
              />
              <span
                className="color-chip"
                style={{ background: hexColor(color) }}
              />
              <span>
                {hexColor(color)}
                <small>{baseColor === i ? 'Case body' : 'Loose inserts'}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="pattern-review">
        <svg
          viewBox={`${-model.width / 2} ${-model.height / 2} ${model.width} ${model.height}`}
          // SVG needs an explicit accessible image role.
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="img"
          aria-label="Simplified two-color pattern. Orange marks removed details."
        >
          <rect
            x={-model.width / 2}
            y={-model.height / 2}
            width={model.width}
            height={model.height}
            rx="7"
            fill={hexColor(design.colors[baseColor])}
          />
          <g transform="scale(-1,-1)" fillRule="evenodd">
            <path
              d={path(design.pattern)}
              fill={hexColor(design.colors[1 - baseColor])}
            />
            {design.removedArea > 1 && (
              <path d={path(design.removed)} fill="#ff8a30" />
            )}
          </g>
        </svg>
        <div>
          <strong>
            {design.pieces} loose {design.pieces === 1 ? 'insert' : 'inserts'}
          </strong>
          <p>Two filaments. One personal case.</p>
          <small>
            Orange marks cleaned-up details. Review the pattern before printing.
          </small>
        </div>
      </div>
      {design.warnings.map((w) => (
        <p className="inlay-warning" key={w}>
          {w}
        </p>
      ))}
    </div>
  );
}
