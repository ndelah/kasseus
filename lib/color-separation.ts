import { contours } from 'd3-contour';
import type { Artwork } from './case-geometry';
export type RGB = [number, number, number];
export type Separation = {
  width: number;
  height: number;
  labels: Uint8Array;
  colors: [RGB, RGB];
  contrast: number;
  approximation: number;
};
export const hexColor = (rgb: RGB) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const distance = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
// Deterministic two-means in RGB, after a 3x3 box filter to suppress paper grain.
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
  // Seed from population quartiles so rare white corners or highlights do not
  // capture a cluster and merge the two dominant pattern colors.
  const ordered = [...pixels].sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]),
  );
  let centers: [RGB, RGB] = [
    ordered[Math.floor(pixels.length * 0.25)],
    ordered[Math.floor(pixels.length * 0.75)],
  ];
  const labels = new Uint8Array(w * h);
  let counts = [0, 0];
  for (let iter = 0; iter < 16; iter++) {
    const sums: RGB[] = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    counts = [0, 0];
    pixels.forEach((c, i) => {
      const n = distance(c, centers[0]) <= distance(c, centers[1]) ? 0 : 1;
      labels[i] = n;
      counts[n]++;
      for (let k = 0; k < 3; k++) sums[n][k] += c[k];
    });
    const next = centers.map((c, n) =>
      counts[n] ? sums[n].map((v) => v / counts[n]) : c,
    ) as [RGB, RGB];
    const change =
      distance(centers[0], next[0]) + distance(centers[1], next[1]);
    centers = next;
    if (change < 0.01) break;
  }
  // Largest color is the initial case color; the user can reverse it.
  if (counts[1] > counts[0]) {
    centers.reverse();
    for (let i = 0; i < labels.length; i++) labels[i] = 1 - labels[i];
  }
  let loss = 0;
  pixels.forEach((c, i) => (loss += distance(c, centers[labels[i]])));
  return {
    width: w,
    height: h,
    labels,
    colors: centers.map((c) => c.map(Math.round)) as [RGB, RGB],
    contrast: Math.sqrt(distance(...centers)),
    approximation: Math.sqrt(loss / pixels.length),
  };
}
export function tracePattern(
  s: Separation,
  baseColor: number,
  widthMM: number,
  heightMM: number,
) {
  const values = Array.from(s.labels, (v) => (v === baseColor ? 0 : 1));
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
