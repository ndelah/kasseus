import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { supportedModel } from './models';
import { parseCaseProfile, type CaseProfile } from './case-profile';
export const CASE = {
  // Default-model dimensions retained for consumers of the original API.
  width: supportedModel.width,
  height: supportedModel.height,
  depth: supportedModel.depth,
  clearance: 0.35,
  wall: 1.6,
  base: 2.4,
  radius: 7,
  relief: 0.65,
};
// Small edge treatments for the Paperwhite 10 shell, in millimetres.
export const PAPERWHITE_10_EDGES = {
  bedChamfer: 0.4,
  rimRadius: 0.5,
  rimSegments: 8,
};
export type Artwork = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** Outward displacement of the case back, in millimetres, sampled in artwork UV. */
export type HeightField = {
  width: number;
  height: number;
  values: Float32Array;
};

/** Controls whether artwork remains centred in the inset back panel or fills it. */
export type ArtworkPlacement = 'centered' | 'stretched';

export type CaseGeometryOptions = {
  placement?: ArtworkPlacement;
  heightField?: HeightField;
};

/**
 * Return the inset, rounded panel that accepts artwork on the case back.
 * It follows the rear case contour so artwork cannot extend across a corner
 * and onto the side wall.
 */
export function artworkPanel(
  model: CaseProfile = supportedModel,
  placement: ArtworkPlacement = 'centered',
) {
  const chamfer =
    model.id === 'paperwhite-2018' ? PAPERWHITE_10_EDGES.bedChamfer : 0;
  const rear =
    model.id === 'paperwhite-2018' ? undefined : model.backSections?.at(-1);
  const outerWidth =
    model.width +
    CASE.clearance * 2 +
    CASE.wall * 2 -
    2 * ((rear?.insetX ?? 0) + chamfer);
  const outerHeight =
    model.height +
    CASE.clearance * 2 +
    CASE.wall * 2 -
    2 * ((rear?.insetY ?? 0) + chamfer);
  const outerRadius =
    (rear?.radius ?? model.cornerRadius) + CASE.wall - chamfer;
  if (placement === 'stretched')
    return {
      width: outerWidth,
      height: outerHeight,
      radius: outerRadius,
    };
  // Keep the established artwork dimensions, then round its corners by the
  // same inset from the measured rear outline.
  const width = model.width + 2 * (CASE.clearance + CASE.wall) - 12;
  const height = model.height + 2 * (CASE.clearance + CASE.wall) - 12;
  const inset = Math.max((outerWidth - width) / 2, (outerHeight - height) / 2);
  return {
    width,
    height,
    radius: Math.max(0.05, outerRadius - inset),
  };
}

/**
 * Subdivisions per 90 degree corner arc. Corners are sampled by angle rather
 * than by position along the case, so every segment carries the same share of
 * the curve. At the 10.6 mm outer radius this leaves a 0.35 mm chord and under
 * 2 micrometres of deviation from a true arc, far below what a nozzle resolves.
 */
const CORNER_SEGMENTS = 48;

/** Sampling pitch in mm along the straight sides, which need no curvature budget. */
const EDGE_PITCH = 2;

/** Pitch in mm along the rear taper's profile curve, measured as arc length. */
const TAPER_PITCH = 0.3;

/** Concentric rings tessellating the relief back so artwork height has somewhere to go. */
const RELIEF_RINGS = 64;

/** Wall outline pitch for a sculpted back; the grain itself uses a Cartesian grid. */
const SCULPTED_EDGE_PITCH = 1;
/** Spacing of the sculpted height-field grid, in millimetres. */
export const SCULPTED_GRID_PITCH = 0.5;
/** Artwork raster width used when recovering a texture height field. */
export const SCULPTED_ARTWORK_WIDTH = 800;

type BackSection = {
  depth: number;
  insetX: number;
  insetY: number;
  radius: number;
};

/**
 * Monotone cubic (Fritsch-Carlson) interpolation over strictly increasing xs.
 * Chosen over Catmull-Rom because it cannot overshoot the measured samples, so
 * a resampled taper never bulges outside the scanned outline.
 */
function monotoneSpline(xs: number[], ys: number[]) {
  const n = xs.length;
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i++)
    secant.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const slope = new Array<number>(n);
  slope[0] = secant[0];
  slope[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++)
    slope[i] =
      secant[i - 1] * secant[i] <= 0 ? 0 : (secant[i - 1] + secant[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) {
      slope[i] = 0;
      slope[i + 1] = 0;
      continue;
    }
    const a = slope[i] / secant[i],
      b = slope[i + 1] / secant[i],
      s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      slope[i] = t * a * secant[i];
      slope[i + 1] = t * b * secant[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = n - 2;
    while (i > 0 && xs[i] > x) i--;
    const span = xs[i + 1] - xs[i],
      t = (x - xs[i]) / span,
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * span * slope[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * span * slope[i + 1]
    );
  };
}

/**
 * Resample a measured rear taper into many closely spaced outlines. The scan
 * supplies only a handful, and stitching straight between them leaves visible
 * bands where the back rolls into the walls. Samples are spread by arc length
 * along the profile rather than by depth, so the tight roll near the back gets
 * as many bands as the near-vertical run up the side. Every measured outline
 * still lies on the curve and the endpoints are kept exactly, so overall size
 * is unchanged.
 */
function refineTaper(sections: BackSection[]): BackSection[] {
  const xs = sections.map((s) => s.depth);
  if (sections.length < 2 || xs.some((x, i) => i > 0 && x <= xs[i - 1]))
    return sections;
  const insetX = monotoneSpline(
    xs,
    sections.map((s) => s.insetX),
  );
  const insetY = monotoneSpline(
    xs,
    sections.map((s) => s.insetY),
  );
  const radius = monotoneSpline(
    xs,
    sections.map((s) => s.radius),
  );
  const at = (d: number): BackSection => ({
    depth: d,
    insetX: insetX(d),
    insetY: insetY(d),
    radius: radius(d),
  });
  const first = xs[0],
    last = xs[xs.length - 1];
  const probes = 512;
  const depths: number[] = [],
    lengths: number[] = [0];
  for (let k = 0; k <= probes; k++)
    depths.push(first + ((last - first) * k) / probes);
  for (let k = 1; k <= probes; k++) {
    const a = at(depths[k - 1]),
      b = at(depths[k]);
    lengths.push(
      lengths[k - 1] +
        Math.hypot(b.depth - a.depth, b.insetX - a.insetX, b.insetY - a.insetY),
    );
  }
  const total = lengths[probes];
  const steps = Math.max(sections.length - 1, Math.ceil(total / TAPER_PITCH));
  const refined: BackSection[] = [sections[0]];
  let cursor = 1;
  for (let k = 1; k < steps; k++) {
    const target = (total * k) / steps;
    while (cursor < probes && lengths[cursor] < target) cursor++;
    const span = lengths[cursor] - lengths[cursor - 1];
    const t = span > 0 ? (target - lengths[cursor - 1]) / span : 0;
    refined.push(
      at(depths[cursor - 1] + (depths[cursor] - depths[cursor - 1]) * t),
    );
  }
  refined.push(sections[sections.length - 1]);
  return refined;
}
// A single closed surface: relief back, outer walls, retaining lip, inner walls, inner floor.
// Every layer shares its boundary indices. Coordinates and exported STL are millimetres.
export function createCaseGeometry(
  art?: Artwork,
  model: CaseProfile = supportedModel,
  options: CaseGeometryOptions = {},
) {
  parseCaseProfile(model);
  const radius = model.cornerRadius;
  const placement = options.placement ?? 'centered';
  const heightField = options.heightField;
  const sculpted = Boolean(heightField);
  const edgePitch = sculpted ? SCULPTED_EDGE_PITCH : EDGE_PITCH;
  const reliefRings = RELIEF_RINGS;
  const panel = artworkPanel(model, placement);
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const iw = model.width + CASE.clearance * 2,
    ih = model.height + CASE.clearance * 2;
  const ow = iw + CASE.wall * 2,
    oh = ih + CASE.wall * 2;
  // Every ring uses these counts, so index i always names the same place on the
  // outline (same corner, same fraction of the same side) whatever the ring's
  // width, height or radius. That is what lets rings be stitched pairwise.
  const ex = Math.max(
    2,
    Math.ceil((ow - 2 * (radius + CASE.wall)) / edgePitch),
  );
  const ey = Math.max(
    2,
    Math.ceil((oh - 2 * (radius + CASE.wall)) / edgePitch),
  );
  /**
   * Rounded rectangle as a closed counter-clockwise polyline: four straight
   * sides at a fixed pitch and four arcs at a fixed angle step.
   */
  function outline(w: number, h: number, r0: number): Array<[number, number]> {
    const r = Math.max(0.05, Math.min(r0, w / 2, h / 2));
    const cx = w / 2 - r,
      cy = h / 2 - r;
    const points: Array<[number, number]> = [];
    const side = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      n: number,
    ) => {
      for (let k = 0; k < n; k++) {
        const t = k / n;
        points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      }
    };
    const arc = (ax: number, ay: number, from: number) => {
      for (let k = 0; k < CORNER_SEGMENTS; k++) {
        const a = from + (k * Math.PI) / (2 * CORNER_SEGMENTS);
        points.push([ax + r * Math.cos(a), ay + r * Math.sin(a)]);
      }
    };
    side(-cx, -h / 2, cx, -h / 2, ex);
    arc(cx, -cy, -Math.PI / 2);
    side(w / 2, -cy, w / 2, cy, ey);
    arc(cx, cy, 0);
    side(cx, h / 2, -cx, h / 2, ex);
    arc(-cx, cy, Math.PI / 2);
    side(-w / 2, cy, -w / 2, -cy, ey);
    arc(-cx, -cy, Math.PI);
    return points;
  }
  function sampleField(field: HeightField, u: number, v: number) {
    const x = u * (field.width - 1);
    const y = v * (field.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(field.width - 1, x0 + 1);
    const y1 = Math.min(field.height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const at = (xx: number, yy: number) => field.values[yy * field.width + xx];
    return (
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x1, y0) * tx * (1 - ty) +
      at(x0, y1) * (1 - tx) * ty +
      at(x1, y1) * tx * ty
    );
  }
  function heightAt(x: number, y: number) {
    if (!art && !heightField) return 0;
    const u = 0.5 - x / panel.width,
      v = 0.5 - y / panel.height;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
    const fade = Math.min(1, u * 25, (1 - u) * 25, v * 25, (1 - v) * 25);
    if (heightField) return sampleField(heightField, u, v) * fade;
    if (!art) return 0;
    const px = Math.min(art.width - 1, Math.floor(u * art.width)),
      py = Math.min(art.height - 1, Math.floor(v * art.height));
    const i = (py * art.width + px) * 4;
    const l =
      (art.data[i] * 0.2126 +
        art.data[i + 1] * 0.7152 +
        art.data[i + 2] * 0.0722) /
      255;
    return (1 - l) * (art.data[i + 3] / 255) * CASE.relief * fade;
  }
  function vertex(x: number, y: number, z: number) {
    const id = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(0.5 - x / panel.width, y / panel.height + 0.5);
    return id;
  }
  function tri(a: number, b: number, c: number, bottom: boolean) {
    if (a === b || b === c || a === c) return;
    if (bottom) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  function insideRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r0: number,
    inset: number,
  ) {
    const hw = w / 2 - inset,
      hh = h / 2 - inset;
    if (hw <= 0 || hh <= 0) return false;
    const rr = Math.max(0.05, Math.min(r0 - inset, hw, hh));
    const ax = Math.abs(x),
      ay = Math.abs(y);
    if (ax > hw || ay > hh) return false;
    if (ax <= hw - rr || ay <= hh - rr) return true;
    return Math.hypot(ax - (hw - rr), ay - (hh - rr)) <= rr + 1e-9;
  }
  /**
   * Walk the outer vertex cycle of a filled vertex grid, interior on the left
   * so the loop is counter-clockwise like the case outline.
   */
  function gridBoundary(ids: number[][]): number[] {
    const rows = ids.length,
      cols = ids[0].length;
    const at = (i: number, j: number) =>
      i >= 0 && j >= 0 && i < cols && j < rows ? ids[j][i] : -1;
    const cell = (i: number, j: number) =>
      at(i, j) >= 0 &&
      at(i + 1, j) >= 0 &&
      at(i, j + 1) >= 0 &&
      at(i + 1, j + 1) >= 0;
    const next = new Map<number, number>();
    const link = (a: number, b: number) => {
      if (a >= 0 && b >= 0) next.set(a, b);
    };
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols; i++) {
        const a = at(i, j),
          b = at(i, j + 1);
        if (a < 0 || b < 0) continue;
        const left = cell(i - 1, j),
          right = cell(i, j);
        if (left && !right) link(a, b);
        else if (right && !left) link(b, a);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = at(i, j),
          b = at(i + 1, j);
        if (a < 0 || b < 0) continue;
        const above = cell(i, j),
          below = cell(i, j - 1);
        if (above && !below) link(a, b);
        else if (below && !above) link(b, a);
      }
    if (next.size === 0) return [];
    const start = next.keys().next().value as number;
    const loop: number[] = [];
    let cur = start;
    do {
      loop.push(cur);
      const nxt = next.get(cur);
      if (nxt === undefined) break;
      cur = nxt;
    } while (cur !== start && loop.length <= next.size + 1);
    return loop;
  }
  function zipper(outer: number[], inner: number[], bottom: boolean) {
    if (inner.length < 3) return false;
    let best = 0,
      bestD = Infinity;
    const ox = positions[outer[0] * 3],
      oy = positions[outer[0] * 3 + 1];
    for (let k = 0; k < inner.length; k++) {
      const d = Math.hypot(
        positions[inner[k] * 3] - ox,
        positions[inner[k] * 3 + 1] - oy,
      );
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    const rim = inner.slice(best).concat(inner.slice(0, best));
    const ni = outer.length,
      nj = rim.length;
    let i = 0,
      j = 0,
      left = ni,
      right = nj;
    const dist = (a: number, b: number) =>
      Math.hypot(
        positions[a * 3] - positions[b * 3],
        positions[a * 3 + 1] - positions[b * 3 + 1],
      );
    while (left > 0 || right > 0) {
      const i2 = (i + 1) % ni,
        j2 = (j + 1) % nj;
      const stepInner =
        left === 0 ||
        (right > 0 && dist(outer[i], rim[j2]) < dist(outer[i2], rim[j]));
      if (stepInner) {
        tri(outer[i], rim[j], rim[j2], bottom);
        j = j2;
        right--;
      } else {
        tri(outer[i], rim[j], outer[i2], bottom);
        i = i2;
        left--;
      }
    }
    return true;
  }
  /**
   * Close off a rounded-rectangle outline. The outline is convex, so a flat cap
   * needs nothing but a fan from its centre; a relief back instead gets
   * concentric scaled copies of the same outline to carry the height field.
   * A sculpted back uses a Cartesian grid so grain is not stair-stepped by
   * polar rings.
   */
  function cap(w: number, h: number, r: number, bottom: boolean) {
    const shape = outline(w, h, r);
    const n = shape.length;
    const z = (x: number, y: number) => (bottom ? -heightAt(x, y) : CASE.base);
    if (bottom && sculpted) {
      const outer = shape.map(([x, y]) => vertex(x, y, z(x, y)));
      const pitch = SCULPTED_GRID_PITCH;
      const inset = pitch * 0.7;
      const gw = w - 2 * inset,
        gh = h - 2 * inset;
      const nx = Math.max(2, Math.round(gw / pitch));
      const ny = Math.max(2, Math.round(gh / pitch));
      const ids: number[][] = [];
      for (let j = 0; j <= ny; j++) {
        const y = -gh / 2 + (j / ny) * gh;
        const row: number[] = [];
        for (let i = 0; i <= nx; i++) {
          const x = -gw / 2 + (i / nx) * gw;
          row.push(
            insideRoundedRect(x, y, w, h, r, inset)
              ? vertex(x, y, z(x, y))
              : -1,
          );
        }
        ids.push(row);
      }
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const a = ids[j][i],
            b = ids[j][i + 1],
            c = ids[j + 1][i],
            d = ids[j + 1][i + 1];
          if (a < 0 || b < 0 || c < 0 || d < 0) continue;
          tri(a, c, b, true);
          tri(b, c, d, true);
        }
      const inner = gridBoundary(ids);
      if (!zipper(outer, inner, true)) {
        const centre = vertex(0, 0, z(0, 0));
        for (let i = 0; i < n; i++)
          tri(outer[i], centre, outer[(i + 1) % n], true);
      }
      return outer;
    }
    const ring = (scale: number) =>
      shape.map(([x, y]) =>
        vertex(x * scale, y * scale, z(x * scale, y * scale)),
      );
    const rings = [ring(1)];
    if (bottom && art)
      for (let k = 1; k < reliefRings; k++)
        rings.push(ring(1 - k / reliefRings));
    const centre = vertex(0, 0, z(0, 0));
    for (let k = 0; k + 1 < rings.length; k++) {
      const a = rings[k],
        b = rings[k + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (bottom) indices.push(a[i], b[i], a[j], a[j], b[i], b[j]);
        else indices.push(a[i], a[j], b[i], a[j], b[j], b[i]);
      }
    }
    const inner = rings[rings.length - 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (bottom) indices.push(inner[i], centre, inner[j]);
      else indices.push(inner[i], inner[j], centre);
    }
    return rings[0];
  }
  const sections = model.backSections
    ? refineTaper(model.backSections)
    : undefined;
  const rear = sections?.at(-1);
  // Vertical outer walls replace the deep rear taper while preserving
  // the scan-derived cavity and finely sampled plan-view corner arcs.
  const straightExterior = model.id === 'paperwhite-2018';
  const outerRear = straightExterior ? undefined : rear;
  const chamfer = straightExterior ? PAPERWHITE_10_EDGES.bedChamfer : 0;
  const back = cap(
    ow - 2 * ((outerRear?.insetX ?? 0) + chamfer),
    oh - 2 * ((outerRear?.insetY ?? 0) + chamfer),
    (outerRear?.radius ?? radius) + CASE.wall - chamfer,
    true,
  );
  const backCount = indices.length;
  const floor = cap(
    iw - 2 * (rear?.insetX ?? 0),
    ih - 2 * (rear?.insetY ?? 0),
    rear?.radius ?? radius,
    false,
  );
  function boundary(
    w: number,
    h: number,
    r: number,
    z: (index: number) => number,
  ) {
    return outline(w, h, r).map(([x, y], i) => vertex(x, y, z(i)));
  }
  // Open lower edge provides charging and power-button access without assumed port offsets.
  // Mirror it at the top on Paperwhite 10th generation for a symmetrical shell.
  // Corresponding perimeter samples keep the opening aligned across narrowed
  // outlines, so it is resolved once against the inner outline and reused by index.
  const opening = outline(iw, ih, radius).map(
    ([x, y]) =>
      (y < -ih / 2 + 5 || (model.id === 'paperwhite-2018' && y > ih / 2 - 5)) &&
      Math.abs(x) < iw / 2 - 10,
  );
  const wallHeight = (i: number) =>
    opening[i] ? CASE.base + 0.4 : CASE.base + model.depth + 0.65;
  function connect(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      indices.push(a[i], a[j], b[i], a[j], b[j], b[i]);
    }
  }
  const rimRadius = straightExterior ? PAPERWHITE_10_EDGES.rimRadius : 0;
  const outerTop = boundary(
    ow - 2 * rimRadius,
    oh - 2 * rimRadius,
    radius + CASE.wall - rimRadius,
    wallHeight,
  );
  if (straightExterior) {
    // A 45-degree bed chamfer, then vertical walls. Unlike a bottom fillet,
    // the footprint never expands faster than the layer rises.
    let outer = boundary(ow, oh, radius + CASE.wall, () => chamfer);
    connect(back, outer);
    const shoulder = boundary(
      ow,
      oh,
      radius + CASE.wall,
      (i) => wallHeight(i) - rimRadius,
    );
    connect(outer, shoulder);
    outer = shoulder;
    // Upper rounding retreats inward as Z increases: no exterior overhang.
    for (let k = 1; k < PAPERWHITE_10_EDGES.rimSegments; k++) {
      const angle = (k * Math.PI) / (2 * PAPERWHITE_10_EDGES.rimSegments);
      const inset = rimRadius * (1 - Math.cos(angle));
      const next = boundary(
        ow - 2 * inset,
        oh - 2 * inset,
        radius + CASE.wall - inset,
        (i) => wallHeight(i) - rimRadius + rimRadius * Math.sin(angle),
      );
      connect(outer, next);
      outer = next;
    }
    connect(outer, outerTop);
  }
  const fullInner = outline(iw, ih, radius);
  const innerLip = outline(iw - 1, ih - 1, radius - 0.5).map(([x, y], i) => {
    // Access openings do not need a retaining hook; removing it also avoids
    // compressing its overhang into the low rim's final fraction of a mm.
    const point = straightExterior && opening[i] ? fullInner[i] : [x, y];
    return vertex(point[0], point[1], wallHeight(i));
  });
  const innerUnder = boundary(iw, ih, radius, (i) =>
    Math.max(CASE.base + 0.15, wallHeight(i) - 0.8),
  );
  if (sections) {
    let outer = back;
    let inner = floor;
    // Compress the opening's layers below the low rim, without coincident rings.
    for (const section of [...sections].reverse().slice(1)) {
      const t = (model.depth - section.depth) / model.depth;
      const nextOuter = straightExterior
        ? outer
        : boundary(
            ow - 2 * section.insetX,
            oh - 2 * section.insetY,
            section.radius + CASE.wall,
            (i) => (opening[i] ? t * (CASE.base + 0.3) : t * model.depth),
          );
      const nextInner = boundary(
        iw - 2 * section.insetX,
        ih - 2 * section.insetY,
        section.radius,
        (i) => CASE.base + t * (opening[i] ? 0.1 : model.depth - 0.2),
      );
      if (!straightExterior) connect(outer, nextOuter);
      connect(nextInner, inner);
      outer = nextOuter;
      inner = nextInner;
    }
    if (!straightExterior) connect(outer, outerTop);
    connect(innerUnder, inner);
  } else {
    if (!straightExterior) connect(back, outerTop);
    connect(innerUnder, floor);
  }
  connect(outerTop, innerLip);
  connect(innerLip, innerUnder);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, backCount, 0);
  geometry.addGroup(backCount, indices.length - backCount, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
export function exportCaseSTL(geometry: THREE.BufferGeometry) {
  const mesh = new THREE.Mesh(geometry);
  const result = new STLExporter().parse(mesh, { binary: true });
  return result;
}
export function artworkSize(
  model: CaseProfile = supportedModel,
  placement: ArtworkPlacement = 'centered',
  widthPx = 400,
) {
  const panel = artworkPanel(model, placement);
  return {
    width: widthPx,
    height: Math.round((widthPx * panel.height) / panel.width),
  };
}
export async function readArtwork(
  url: string,
  model: CaseProfile = supportedModel,
  placement: ArtworkPlacement = 'centered',
  widthPx = 400,
): Promise<Artwork> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.width * image.height > 40000000)
    throw new Error('Please use an image smaller than 40 megapixels.');
  const canvas = document.createElement('canvas');
  const { width, height } = artworkSize(model, placement, widthPx);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  if (placement === 'stretched') {
    ctx.drawImage(image, 0, 0, width, height);
  } else {
    const scale = Math.max(width / image.width, height / image.height),
      w = image.width * scale,
      h = image.height * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  }
  return ctx.getImageData(0, 0, width, height);
}
export function caseFilename(model: CaseProfile, art?: Artwork) {
  return `kasseus-${model.exportName}-${art ? 'relief' : 'plain'}-mm.stl`;
}
