import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { supportedModel } from "./models";
import { parseCaseProfile, type CaseProfile } from "./case-profile";
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
export type Artwork = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/**
 * Return the inset, rounded panel that accepts artwork on the case back.
 * It follows the rear case contour so artwork cannot extend across a corner
 * and onto the side wall.
 */
export function artworkPanel(model: CaseProfile = supportedModel) {
  const rear = model.backSections?.at(-1);
  const outerWidth =
    model.width + CASE.clearance * 2 + CASE.wall * 2 - 2 * (rear?.insetX ?? 0);
  const outerHeight =
    model.height +
    CASE.clearance * 2 +
    CASE.wall * 2 -
    2 * (rear?.insetY ?? 0);
  // Keep the established artwork dimensions, then round its corners by the
  // same inset from the measured rear outline.
  const width = model.width + 2 * (CASE.clearance + CASE.wall) - 12;
  const height = model.height + 2 * (CASE.clearance + CASE.wall) - 12;
  const inset = Math.max((outerWidth - width) / 2, (outerHeight - height) / 2);
  return {
    width,
    height,
    radius: Math.max(0.05, (rear?.radius ?? model.cornerRadius) + CASE.wall - inset),
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
) {
  parseCaseProfile(model);
  const radius = model.cornerRadius;
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
    Math.ceil((ow - 2 * (radius + CASE.wall)) / EDGE_PITCH),
  );
  const ey = Math.max(
    2,
    Math.ceil((oh - 2 * (radius + CASE.wall)) / EDGE_PITCH),
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
  function heightAt(x: number, y: number) {
    if (!art) return 0;
    const u = 0.5 - x / (ow - 12),
      v = 0.5 - y / (oh - 12);
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
    const px = Math.min(art.width - 1, Math.floor(u * art.width)),
      py = Math.min(art.height - 1, Math.floor(v * art.height));
    const i = (py * art.width + px) * 4;
    const l =
      (art.data[i] * 0.2126 +
        art.data[i + 1] * 0.7152 +
        art.data[i + 2] * 0.0722) /
      255;
    const fade = Math.min(1, u * 25, (1 - u) * 25, v * 25, (1 - v) * 25);
    return (1 - l) * (art.data[i + 3] / 255) * CASE.relief * fade;
  }
  function vertex(x: number, y: number, z: number) {
    const id = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(0.5 - x / (ow - 12), y / (oh - 12) + 0.5);
    return id;
  }
  /**
   * Close off a rounded-rectangle outline. The outline is convex, so a flat cap
   * needs nothing but a fan from its centre; a relief back instead gets
   * concentric scaled copies of the same outline to carry the height field.
   */
  function cap(w: number, h: number, r: number, bottom: boolean) {
    const shape = outline(w, h, r);
    const n = shape.length;
    const z = (x: number, y: number) => (bottom ? -heightAt(x, y) : CASE.base);
    const ring = (scale: number) =>
      shape.map(([x, y]) =>
        vertex(x * scale, y * scale, z(x * scale, y * scale)),
      );
    const rings = [ring(1)];
    if (bottom && art)
      for (let k = 1; k < RELIEF_RINGS; k++)
        rings.push(ring(1 - k / RELIEF_RINGS));
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
  const back = cap(
    ow - 2 * (rear?.insetX ?? 0),
    oh - 2 * (rear?.insetY ?? 0),
    (rear?.radius ?? radius) + CASE.wall,
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
      (y < -ih / 2 + 5 ||
        (model.id === "paperwhite-2018" && y > ih / 2 - 5)) &&
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
  const outerTop = boundary(ow, oh, radius + CASE.wall, wallHeight);
  const innerLip = boundary(iw - 1, ih - 1, radius - 0.5, wallHeight);
  const innerUnder = boundary(iw, ih, radius, (i) =>
    Math.max(CASE.base + 0.15, wallHeight(i) - 0.8),
  );
  if (sections) {
    let outer = back;
    let inner = floor;
    // Compress the opening's layers below the low rim, without coincident rings.
    for (const section of [...sections].reverse().slice(1)) {
      const t = (model.depth - section.depth) / model.depth;
      const nextOuter = boundary(
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
      connect(outer, nextOuter);
      connect(nextInner, inner);
      outer = nextOuter;
      inner = nextInner;
    }
    connect(outer, outerTop);
    connect(innerUnder, inner);
  } else {
    connect(back, outerTop);
    connect(innerUnder, floor);
  }
  connect(outerTop, innerLip);
  connect(innerLip, innerUnder);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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
export function artworkSize(model: CaseProfile = supportedModel) {
  const panel = artworkPanel(model);
  return {
    width: 400,
    height: Math.round((400 * panel.height) / panel.width),
  };
}
export async function readArtwork(
  url: string,
  model: CaseProfile = supportedModel,
): Promise<Artwork> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.width * image.height > 40000000)
    throw new Error("Please use an image smaller than 40 megapixels.");
  const canvas = document.createElement("canvas");
  const { width, height } = artworkSize(model);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process this image.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.max(width / image.width, height / image.height),
    w = image.width * scale,
    h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return ctx.getImageData(0, 0, width, height);
}
export function caseFilename(model: CaseProfile, art?: Artwork) {
  return `kasseus-${model.exportName}-${art ? "relief" : "plain"}-mm.stl`;
}
