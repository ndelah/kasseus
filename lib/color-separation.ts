import { contours } from 'd3-contour';
import type { Artwork } from './case-geometry';
export type RGB = [number, number, number];
export type Separation = {
  width: number;
  height: number;
  labels: Uint8Array;
  colors: RGB[];
  contrast: number;
  approximation: number;
};
/** Clusters closer than this (RGB Euclidean) are treated as one filament. */
export const COLOR_SEPARATION = 24;
/** Keep splitting while reconstruction error stays above this. */
export const COLOR_ERROR_TARGET = 28;
export const hexColor = (rgb: RGB) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const distance = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const brightness = (c: RGB) => c[0] + c[1] + c[2];
const meanColor = (pixels: RGB[]): RGB => {
  const sum: RGB = [0, 0, 0];
  pixels.forEach((c) => {
    for (let k = 0; k < 3; k++) sum[k] += c[k];
  });
  return sum.map((v) => v / pixels.length) as RGB;
};
const nearest = (c: RGB, centers: RGB[]) => {
  let best = 0,
    bestD = Infinity;
  for (let n = 0; n < centers.length; n++) {
    const d = distance(c, centers[n]);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
};
function cluster(
  pixels: RGB[],
  centers: RGB[],
  labels: Uint8Array,
): { centers: RGB[]; counts: number[]; loss: number } {
  let current = centers.map((c) => [...c] as RGB);
  let counts = current.map(() => 0);
  for (let iter = 0; iter < 16; iter++) {
    const sums: RGB[] = current.map(() => [0, 0, 0]);
    counts = current.map(() => 0);
    pixels.forEach((c, i) => {
      const n = nearest(c, current);
      labels[i] = n;
      counts[n]++;
      for (let k = 0; k < 3; k++) sums[n][k] += c[k];
    });
    const next = current.map((c, n) =>
      counts[n] ? (sums[n].map((v) => v / counts[n]) as RGB) : c,
    );
    const change = next.reduce((s, c, n) => s + distance(c, current[n]), 0);
    current = next;
    if (change < 0.01) break;
  }
  let loss = 0;
  pixels.forEach((c, i) => (loss += distance(c, current[labels[i]])));
  return { centers: current, counts, loss };
}
function dropTinyClusters(
  pixels: RGB[],
  centers: RGB[],
  labels: Uint8Array,
  minCount: number,
): { centers: RGB[]; counts: number[]; loss: number } {
  const { counts } = cluster(pixels, centers, labels);
  const keep = counts
    .map((n, i) => (n >= minCount ? i : -1))
    .filter((i) => i >= 0);
  if (keep.length === 0 || keep.length === centers.length)
    return cluster(pixels, centers, labels);
  return cluster(
    pixels,
    keep.map((i) => centers[i]),
    labels,
  );
}
function remapByPopulation(
  centers: RGB[],
  counts: number[],
  labels: Uint8Array,
) {
  const order = counts.map((n, i) => i).sort((a, b) => counts[b] - counts[a]);
  const lookup = new Uint8Array(order.length);
  order.forEach((from, to) => {
    lookup[from] = to;
  });
  for (let i = 0; i < labels.length; i++) labels[i] = lookup[labels[i]];
  return {
    centers: order.map((i) => centers[i]),
    counts: order.map((i) => counts[i]),
  };
}
function splitSeed(
  pixels: RGB[],
  labels: Uint8Array,
  index: number,
): RGB | null {
  const members: RGB[] = [];
  pixels.forEach((c, i) => {
    if (labels[i] === index) members.push(c);
  });
  if (members.length < 4) return null;
  members.sort((a, b) => brightness(a) - brightness(b));
  return members[Math.floor(members.length * 0.75)];
}
function minPairwise(centers: RGB[]) {
  if (centers.length < 2) return 0;
  let best = Infinity;
  for (let i = 0; i < centers.length; i++)
    for (let j = i + 1; j < centers.length; j++)
      best = Math.min(best, distance(centers[i], centers[j]));
  return Math.sqrt(best);
}
// Quantize after a 3x3 box filter. k starts at two brightness quartiles so
// rare highlights do not steal a cluster, then splits while reconstruction
// error stays high and each new filament remains a distinct, sizable region.
export function separateColors(art: Artwork): Separation {
  const { width: w, height: h } = art;
  const pixels: RGB[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c: RGB = [0, 0, 0];
      let count = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx)),
            yy = Math.max(0, Math.min(h - 1, y + dy)),
            i = (yy * w + xx) * 4,
            a = art.data[i + 3] / 255;
          for (let k = 0; k < 3; k++)
            c[k] += art.data[i + k] * a + 255 * (1 - a);
          count++;
        }
      pixels.push(c.map((v) => v / count) as RGB);
    }
  const ordered = [...pixels].sort((a, b) => brightness(a) - brightness(b));
  const labels = new Uint8Array(w * h);
  const minCount = Math.max(16, Math.floor(pixels.length * 0.005));
  let fitted = dropTinyClusters(
    pixels,
    [
      ordered[Math.floor(pixels.length * 0.25)],
      ordered[Math.floor(pixels.length * 0.75)],
    ],
    labels,
    minCount,
  );
  while (
    Math.sqrt(fitted.loss / pixels.length) > COLOR_ERROR_TARGET &&
    fitted.centers.length < 256
  ) {
    let splitAt = -1,
      worst = -1;
    const errors = fitted.centers.map(() => 0);
    pixels.forEach(
      (c, i) => (errors[labels[i]] += distance(c, fitted.centers[labels[i]])),
    );
    errors.forEach((e, i) => {
      if (fitted.counts[i] >= minCount * 2 && e > worst) {
        worst = e;
        splitAt = i;
      }
    });
    if (splitAt < 0) break;
    const seed = splitSeed(pixels, labels, splitAt);
    if (
      !seed ||
      distance(seed, fitted.centers[splitAt]) < COLOR_SEPARATION ** 2
    )
      break;
    const previous = labels.slice();
    const next = dropTinyClusters(
      pixels,
      [...fitted.centers, seed],
      labels,
      minCount,
    );
    if (
      next.centers.length <= fitted.centers.length ||
      next.loss >= fitted.loss * 0.995
    ) {
      labels.set(previous);
      break;
    }
    fitted = next;
  }
  if (fitted.centers.length === 1)
    fitted = cluster(pixels, [fitted.centers[0], meanColor(pixels)], labels);
  const ranked = remapByPopulation(fitted.centers, fitted.counts, labels);
  return {
    width: w,
    height: h,
    labels,
    colors: ranked.centers.map((c) => c.map(Math.round) as RGB),
    contrast: minPairwise(ranked.centers),
    approximation: Math.sqrt(fitted.loss / pixels.length),
  };
}
export function tracePattern(
  s: Separation,
  match: (label: number) => boolean,
  widthMM: number,
  heightMM: number,
) {
  const values = Array.from(s.labels, (v) => (match(v) ? 1 : 0));
  return contours()
    .size([s.width, s.height])
    .smooth(true)
    .contour(values, 0.5)
    .coordinates.map((polygon) =>
      polygon.map((ring) =>
        ring
          .slice(0, -1)
          .map(
            ([x, y]) =>
              [
                (0.5 - x / s.width) * widthMM,
                (0.5 - y / s.height) * heightMM,
              ] as [number, number],
          ),
      ),
    );
}
