'use client';
import { useEffect, useRef } from 'react';
import { hexColor } from '@/lib/color-separation';
import type { InlayDesign } from '@/lib/inlay-geometry';

const FILAMENT_NAMES = ['Sand', 'Charcoal', 'Walnut', 'Clay'];

/**
 * Review panel for a sculpted case: recovered height, filament colour, and
 * print notes. The canvas redraws whenever the worker returns a new depth map.
 */
export function SculptedReview({
  design,
  baseColor,
  onColor,
}: {
  design: InlayDesign;
  baseColor: number;
  onColor: (n: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = design.depthMap;
  useEffect(() => {
    const node = canvas.current;
    if (!node || !map) return;
    node.width = map.width;
    node.height = map.height;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(map.width, map.height);
    for (let i = 0; i < map.values.length; i++) {
      const v = Math.round(map.values[i] * 255);
      const p = i * 4;
      image.data[p] = 48 + v * 0.72;
      image.data[p + 1] = 42 + v * 0.62;
      image.data[p + 2] = 38 + v * 0.48;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [map]);
  const relief = design.reliefMm ?? 0;
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
                {FILAMENT_NAMES[i] ?? hexColor(color)}
                <small>{hexColor(color)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="pattern-review">
        <canvas
          ref={canvas}
          className="depth-preview"
          aria-label="Recovered texture height. Light areas will print raised."
        />
        <div>
          <strong>Sculpted from light and shadow</strong>
          <p>
            Up to {relief.toFixed(2)} mm of raised grain. One single-piece case.
          </p>
          <small>
            Highlights become ridges, shadows become valleys. Dark lines cut
            grooves; bright lines rise.
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
