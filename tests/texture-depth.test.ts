import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { type Artwork, SCULPTED_GRID_PITCH } from '../lib/case-geometry';
import { exportInlay } from '../lib/inlay-export';
import { buildSculpted } from '../lib/inlay-geometry';
import { supportedModel } from '../lib/models';
import { recoverTextureDepth, TEXTURE_RELIEF } from '../lib/texture-depth';

function paint(
  width: number,
  height: number,
  shade: (x: number, y: number) => number,
): Artwork {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = Math.max(0, Math.min(255, Math.round(shade(x, y))));
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

function sample(
  field: { width: number; values: Float32Array },
  x: number,
  y: number,
) {
  return field.values[y * field.width + x];
}

const flat = recoverTextureDepth(paint(32, 32, () => 140));
assert.ok(flat.peakMm < 0.08, 'even lighting has almost no recovered relief');
assert.equal(flat.values.length, 32 * 32);

const bumpArt = paint(48, 48, (x, y) => {
  const d = Math.hypot(x - 24, y - 24);
  return 90 + 140 * Math.exp(-(d * d) / 70);
});
const bump = recoverTextureDepth(bumpArt);
assert.ok(bump.peakMm > 0.4, 'a lit bump recovers usable height');
assert.ok(
  sample(bump, 24, 24) > sample(bump, 4, 24) + 0.15,
  'highlights in the centre print higher than the surrounding field',
);

const groove = recoverTextureDepth(
  paint(48, 40, (x) => (x >= 21 && x <= 26 ? 20 : 150)),
);
assert.ok(
  sample(groove, 23, 20) < sample(groove, 8, 20) - 0.08,
  'a dark line becomes a valley',
);

const ridge = recoverTextureDepth(
  paint(48, 40, (x) => (x >= 21 && x <= 26 ? 230 : 110)),
);
assert.ok(
  sample(ridge, 23, 20) > sample(ridge, 8, 20) + 0.08,
  'a bright line becomes a ridge',
);

const design = buildSculpted(bumpArt);
assert.equal(design.kind, 'sculpted');
assert.equal(design.inserts, null);
assert.equal(design.pieces, 0);
assert.equal(design.colors.length, 4);
assert.ok(design.reliefMm && design.reliefMm <= TEXTURE_RELIEF);
assert.ok(design.bodyVolume > 0);
assert.ok(design.depthMap);

const pos = design.body.positions;
const idx = design.body.indices;
const edges = new Map<string, { count: number; balance: number }>();
let minZ = Infinity;
let centreZ = Infinity;
let rimZ = 0;
for (let i = 0; i < idx.length; i += 3) {
  const a = idx[i],
    b = idx[i + 1],
    c = idx[i + 2];
  for (const [s, t] of [
    [a, b],
    [b, c],
    [c, a],
  ]) {
    const key = `${Math.min(s, t)}:${Math.max(s, t)}`;
    const e = edges.get(key) || { count: 0, balance: 0 };
    e.count++;
    e.balance += s < t ? 1 : -1;
    edges.set(key, e);
  }
}
for (let i = 0; i < pos.length; i += 3) {
  const x = pos[i],
    y = pos[i + 1],
    z = pos[i + 2];
  if (z > 0.01) continue;
  minZ = Math.min(minZ, z);
  if (Math.hypot(x, y) < 4) centreZ = Math.min(centreZ, z);
  if (Math.hypot(x, y) > 60) rimZ = Math.min(rimZ, z);
}
for (const e of edges.values()) {
  assert.equal(e.count, 2, 'sculpted back stays watertight');
  assert.equal(e.balance, 0, 'sculpted winding stays consistent');
}
assert.ok(minZ < -0.2, 'texture is raised outward');
assert.ok(
  minZ >= -TEXTURE_RELIEF - 0.02,
  'relief stays within the print budget',
);
assert.ok(centreZ < rimZ - 0.15, 'the bump is taller than the faded rim');

const interior: number[] = [];
for (let i = 0; i < idx.length; i += 3) {
  const pts = [idx[i], idx[i + 1], idx[i + 2]].map((id) => [
    pos[id * 3],
    pos[id * 3 + 1],
    pos[id * 3 + 2],
  ]);
  if (pts.some((p) => p[2] > 0.01)) continue;
  if (pts.some((p) => Math.hypot(p[0], p[1]) > 40)) continue;
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const)
    interior.push(Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]));
}
const meanEdge = interior.reduce((s, e) => s + e, 0) / interior.length;
assert.ok(interior.length > 100, 'the grain is carried by an interior grid');
assert.ok(
  meanEdge < SCULPTED_GRID_PITCH * 1.6,
  'sculpted facets stay close to the grid pitch',
);

const files = unzipSync(exportInlay(design, supportedModel, 0));
assert.deepEqual(Object.keys(files).sort(), [
  'PRINT-NOTES.txt',
  'READ-ME.txt',
  'case.stl',
]);
const note = new TextDecoder().decode(files['READ-ME.txt']);
assert.match(note, /Sculpted texture case/);
assert.doesNotMatch(note, /loose inserts/);
console.log(
  'texture-depth: shading, lines, sculpted mesh',
  idx.length / 3,
  'triangles, ZIP',
  Object.keys(files).join(','),
);

assert.match(
  new TextDecoder().decode(files['PRINT-NOTES.txt']),
  /textured face may need to point up/,
);
