import type { Artwork, HeightField } from './case-geometry';

/** Peak outward displacement of a sculpted back, in millimetres. */
export const TEXTURE_RELIEF = 0.9;

export type TextureDepth = HeightField & {
  /** Peak of the printable field, millimetres. */
  peakMm: number;
  /** 0–1 copy of the field for on-screen preview. */
  preview: Float32Array;
};

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * Recover a printable height field from a texture photograph.
 *
 * Grain is treated as a shaded surface: highlights become raised ridges,
 * shadows become valleys, and strong lines are emphasised as grooves or
 * crests depending on whether they are dark or bright. The result is shifted
 * so valleys sit on the original back (no thinning) and peaks rise outward.
 */
export function recoverTextureDepth(art: Artwork): TextureDepth {
  const { width: w, height: h, data } = art;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < luma.length; i++) {
    const p = i * 4;
    const a = data[p + 3] / 255;
    const r = (data[p] / 255) * a + (1 - a);
    const g = (data[p + 1] / 255) * a + (1 - a);
    const b = (data[p + 2] / 255) * a + (1 - a);
    luma[i] = r * LUMA_R + g * LUMA_G + b * LUMA_B;
  }

  const fineBase = boxBlur(luma, w, h, 2);
  const mediumBase = boxBlur(luma, w, h, 8);
  const formBase = boxBlur(luma, w, h, 24);
  const fine = subtract(luma, fineBase);
  const medium = subtract(fineBase, mediumBase);
  const form = subtract(mediumBase, formBase);

  const { gx, gy, mag } = sobel(fineBase, w, h);
  const lightX = mean(gx);
  const lightY = mean(gy);
  const light = Math.hypot(lightX, lightY);
  // Side-lit photos carry more large-scale depth in the shadows.
  const formWeight = 0.14 + 0.22 * smoothstep(0.015, 0.1, light);

  const magScale = 1 / (percentile(mag, 0.9) + 1e-6);
  const values = new Float32Array(w * h);
  for (let i = 0; i < values.length; i++) {
    const shading = 0.48 * fine[i] + 0.3 * medium[i] + formWeight * form[i];
    const edge = Math.min(1.4, mag[i] * magScale);
    const line = edge * (2 * luma[i] - 1);
    values[i] = shading + 0.2 * line;
  }

  if (light > 0.02) {
    const sfs = integrateAlongLight(luma, w, h, lightX, lightY);
    const sfsWeight = 0.28 * smoothstep(0.02, 0.12, light);
    for (let i = 0; i < values.length; i++)
      values[i] = values[i] * (1 - sfsWeight) + sfs[i] * sfsWeight;
  }

  const lo = percentile(values, 0.02);
  const hi = percentile(values, 0.98);
  const span = Math.max(1e-6, hi - lo);
  const preview = new Float32Array(w * h);
  const mm = new Float32Array(w * h);
  let peakMm = 0;
  for (let i = 0; i < values.length; i++) {
    const unit = Math.min(1, Math.max(0, (values[i] - lo) / span));
    preview[i] = unit;
    mm[i] = unit * TEXTURE_RELIEF;
    if (mm[i] > peakMm) peakMm = mm[i];
  }

  return { width: w, height: h, values: mm, peakMm, preview };
}

function subtract(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

function mean(values: Float32Array) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function percentile(values: Float32Array, p: number) {
  const sorted = Float32Array.from(values);
  sorted.sort();
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[i];
}

/**
 * Separable box blur. A few wide passes are enough to split grain from form
 * without a Gaussian kernel.
 */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  radius: number,
): Float32Array {
  if (radius < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const extent = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++)
      sum += src[y * w + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / extent;
      sum +=
        src[y * w + clamp(x + radius + 1, 0, w - 1)] -
        src[y * w + clamp(x - radius, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++)
      sum += tmp[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / extent;
      sum +=
        tmp[clamp(y + radius + 1, 0, h - 1) * w + x] -
        tmp[clamp(y - radius, 0, h - 1) * w + x];
    }
  }
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sobel(src: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  const at = (x: number, y: number) =>
    src[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) -
        2 * at(x - 1, y) +
        2 * at(x + 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y + 1);
      gy[i] =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      mag[i] = Math.hypot(gx[i], gy[i]);
    }
  return { gx, gy, mag };
}

/**
 * Cheap shape-from-shading: accumulate brightness change along the estimated
 * light direction so a side-lit bump reads as a rise rather than a stain.
 */
function integrateAlongLight(
  luma: Float32Array,
  w: number,
  h: number,
  lightX: number,
  lightY: number,
) {
  const len = Math.hypot(lightX, lightY) || 1;
  const dx = lightX / len;
  const dy = lightY / len;
  const average = mean(luma);
  const out = new Float32Array(w * h);
  const steps = 14;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let s = 1; s <= steps; s++) {
        const xx = clamp(Math.round(x - dx * s), 0, w - 1);
        const yy = clamp(Math.round(y - dy * s), 0, h - 1);
        acc += luma[yy * w + xx] - average;
      }
      out[y * w + x] = acc / steps;
    }
  return out;
}
