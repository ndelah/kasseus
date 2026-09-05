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
export type Artwork = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
// A single closed surface: relief back, outer walls, retaining lip, inner walls, inner floor.
// Every layer shares its boundary indices. Coordinates and exported STL are millimetres.
export function createCaseGeometry(
  art?: Artwork,
  model: CaseProfile = supportedModel,
) {
  parseCaseProfile(model);
  const radius = model.cornerRadius;
  const nx = 100,
    ny = 140,
    positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const iw = model.width + CASE.clearance * 2,
    ih = model.height + CASE.clearance * 2;
  const ow = iw + CASE.wall * 2,
    oh = ih + CASE.wall * 2;
  function point(
    u: number,
    v: number,
    w: number,
    h: number,
    r: number,
  ): [number, number] {
    const y = (v - 0.5) * h,
      dy = Math.max(0, Math.abs(y) - (h / 2 - r));
    const half = w / 2 - r + Math.sqrt(Math.max(0, r * r - dy * dy));
    return [(u * 2 - 1) * half, y];
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
  function surface(w: number, h: number, r: number, bottom: boolean) {
    const start = positions.length / 3;
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const [x, y] = point(i / nx, j / ny, w, h, r);
        vertex(x, y, bottom ? -heightAt(x, y) : CASE.base);
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = start + j * (nx + 1) + i,
          b = a + 1,
          c = a + nx + 1,
          d = c + 1;
        if (bottom) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    const edge: number[] = [];
    for (let i = 0; i < nx; i++) edge.push(start + i);
    for (let j = 0; j < ny; j++) edge.push(start + j * (nx + 1) + nx);
    for (let i = nx; i > 0; i--) edge.push(start + ny * (nx + 1) + i);
    for (let j = ny; j > 0; j--) edge.push(start + j * (nx + 1));
    return edge;
  }
  const back = surface(ow, oh, radius + CASE.wall, true);
  const backCount = indices.length;
  const floor = surface(iw, ih, radius, false);
  function boundary(
    w: number,
    h: number,
    r: number,
    z: (x: number, y: number) => number,
  ) {
    const e: number[] = [];
    const add = (u: number, v: number) => {
      const [x, y] = point(u, v, w, h, r);
      e.push(vertex(x, y, z(x, y)));
    };
    for (let i = 0; i < nx; i++) add(i / nx, 0);
    for (let j = 0; j < ny; j++) add(1, j / ny);
    for (let i = nx; i > 0; i--) add(i / nx, 1);
    for (let j = ny; j > 0; j--) add(0, j / ny);
    return e;
  }
  // Open lower edge provides charging and power-button access without assumed port offsets.
  const wallHeight = (x: number, y: number) =>
    y < -ih / 2 + 5 && Math.abs(x) < iw / 2 - 10
      ? CASE.base + 0.4
      : CASE.base + model.depth + 0.65;
  function connect(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      indices.push(a[i], a[j], b[i], a[j], b[j], b[i]);
    }
  }
  const outerTop = boundary(ow, oh, radius + CASE.wall, wallHeight);
  const innerLip = boundary(iw - 1, ih - 1, radius - 0.5, wallHeight);
  const innerUnder = boundary(iw, ih, radius, (x, y) =>
    Math.max(CASE.base + 0.15, wallHeight(x, y) - 0.8),
  );
  connect(back, outerTop);
  connect(outerTop, innerLip);
  connect(innerLip, innerUnder);
  connect(innerUnder, floor);
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
export function artworkSize(model: CaseProfile = supportedModel) {
  // Match the panel used by both the relief height field and preview UVs.
  const border = 2 * (CASE.clearance + CASE.wall) - 12;
  return {
    width: 400,
    height: Math.round(
      (400 * (model.height + border)) / (model.width + border),
    ),
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
    throw new Error('Please use an image smaller than 40 megapixels.');
  const canvas = document.createElement('canvas');
  const { width, height } = artworkSize(model);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.max(width / image.width, height / image.height),
    w = image.width * scale,
    h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return ctx.getImageData(0, 0, width, height);
}
export function caseFilename(model: CaseProfile, art?: Artwork) {
  return `kasseus-${model.exportName}-${art ? 'relief' : 'plain'}-mm.stl`;
}
