import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildInlay, INLAY, meshGeometry } from '../lib/inlay-geometry';
import { separateColors } from '../lib/color-separation';
import {
  artworkPanel,
  CASE,
  exportCaseSTL,
  type Artwork,
} from '../lib/case-geometry';
const engine = await Module();
engine.setup();
function art(shape: (x: number, y: number) => boolean): Artwork {
  const width = 100,
    height = 144,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        c = shape(x, y) ? [10, 35, 20] : [62, 130, 85];
      data.set([...c, 255], i);
    }
  return { width, height, data };
}
const sample = art(
  (x, y) =>
    (x > 12 && x < 35 && y > 20 && y < 60) ||
    (Math.hypot(x - 70, y - 90) < 20 && Math.hypot(x - 70, y - 90) > 9),
);
const s = separateColors(sample);
assert.ok(s.contrast > 24);
assert.equal(s.labels[0], 0);
const plain = buildInlay(engine);
const design = buildInlay(engine, sample);
assert.equal(design.pieces, 2);
assert.ok(design.bodyVolume < plain.bodyVolume);
assert.ok(design.insertVolume > 0);
assert.ok(CASE.base - INLAY.pocketDepth >= 1.6 - 1e-9);
function solid(mesh: typeof design.body) {
  return new engine.Manifold(
    new engine.Mesh({
      numProp: 3,
      vertProperties: mesh.positions,
      triVerts: mesh.indices,
    }),
  );
}
for (const [label, mesh] of [
  ['case', design.body],
  ['inserts', design.inserts!],
] as const) {
  const m = solid(mesh);
  assert.equal(m.status(), 'NoError');
  assert.ok(m.volume() > 0);
  const g = meshGeometry(mesh),
    bytes = exportCaseSTL(g);
  assert.equal(bytes.getUint32(80, true), mesh.indices.length / 3);
  assert.equal(bytes.byteLength, 84 + (mesh.indices.length / 3) * 50);
  g.dispose();
  m.delete();
  console.log(label, mesh.indices.length / 3, 'triangles, watertight STL');
}
const body = solid(design.body),
  inserts = solid(design.inserts!);
const collision = body.intersect(inserts);
assert.ok(collision.isEmpty(), 'inserts do not collide with case');
const b = inserts.boundingBox();
assert.ok(Math.abs(b.min[2] - 0.15) < 1e-5);
assert.ok(Math.abs(b.max[2] - 0.75) < 1e-5);
assert.ok(b.max[2] < INLAY.pocketDepth, 'adhesive gap');
const parts = inserts.decompose();
assert.equal(parts.length, 2);
parts.forEach((p) => p.delete());
const reversed = buildInlay(engine, sample, 1);
assert.ok(reversed.bodyVolume !== design.bodyVolume);
assert.ok(reversed.pieces > 0);
const cornerDesign = buildInlay(
  engine,
  art((x) => x < 50),
);
const panel = artworkPanel();
const halfWidth = panel.width / 2;
const halfHeight = panel.height / 2;
for (const layer of cornerDesign.layers)
  for (let i = 0; i < layer.mesh.positions.length; i += 3) {
    const x = Math.abs(layer.mesh.positions[i]);
    const y = Math.abs(layer.mesh.positions[i + 1]);
    const insideStraightEdge =
      x <= halfWidth - panel.radius || y <= halfHeight - panel.radius;
    const cornerDistance = Math.hypot(
      x - (halfWidth - panel.radius),
      y - (halfHeight - panel.radius),
    );
    assert.ok(
      insideStraightEdge || cornerDistance <= panel.radius + 1e-5,
      'inlay corners follow the rounded case back',
    );
  }
const stretchedDesign = buildInlay(
  engine,
  art((x) => x < 50),
  0,
  undefined,
  'stretched',
);
assert.ok(stretchedDesign.inserts);
assert.ok(
  stretchedDesign.insertVolume > cornerDesign.insertVolume,
  'stretched artwork covers the full exterior back',
);
const tiny = buildInlay(
  engine,
  art(
    (x, y) => (x > 15 && x < 50 && y > 30 && y < 70) || (x === 80 && y === 110),
  ),
);
assert.ok(tiny.removedArea > 0);
assert.equal(tiny.pieces, 1);
const blank = buildInlay(
  engine,
  art(() => false),
);
assert.equal(blank.inserts, null);
assert.ok(blank.warnings.length > 0);
collision.delete();
body.delete();
inserts.delete();
console.log(
  'Inlay tests passed: separation, holes, loose parts, reversed palette, small details, solid color, backing, clearance, export, multi-color, dense patterns',
);

// Exercise the full export bundle and each supported model.
const { supportedModels } = await import('../lib/models');
const { exportInlay } = await import('../lib/inlay-export');
const { unzipSync } = await import('fflate');
for (const model of supportedModels) {
  const d = buildInlay(engine, sample, 0, model);
  assert.equal(d.pieces, 2);
  const files = unzipSync(exportInlay(d, model, 0));
  assert.deepEqual(Object.keys(files).sort(), [
    'PRINT-NOTES.txt',
    'READ-ME.txt',
    'case.stl',
    'inserts.stl',
  ]);
  const printNotes = new TextDecoder().decode(files['PRINT-NOTES.txt']);
  assert.match(printNotes, /unsupported pocket ceilings/);
  assert.doesNotMatch(printNotes, /sliced into 56 layers/);
  assert.equal(
    printNotes.includes('Paperwhite 10 · soft edges'),
    model.id === 'paperwhite-2018',
  );
  for (const filename of ['case.stl', 'inserts.stl']) {
    const bytes = files[filename];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.equal(bytes.length, 84 + view.getUint32(80, true) * 50);
  }
  console.log(model.id, 'inlay ZIP validated');
}
const cornerSample = art((x) => x % 30 < 16);
for (let y = 0; y < 3; y++)
  for (let x = 0; x < 3; x++)
    cornerSample.data.set(
      [255, 255, 255, 255],
      (y * cornerSample.width + x) * 4,
    );
const cornerColors = separateColors(cornerSample).colors;
assert.ok(
  cornerColors.every((c) => c[0] < 100),
  'rare white corners do not replace the two green tones',
);

const tri = art(() => false);
for (let y = 0; y < tri.height; y++)
  for (let x = 0; x < tri.width; x++) {
    const i = (y * tri.width + x) * 4;
    const c = y < 48 ? [200, 30, 30] : y < 96 ? [30, 180, 40] : [30, 40, 200];
    tri.data.set([...c, 255], i);
  }
const triColors = separateColors(tri).colors;
assert.equal(triColors.length, 3);
const triDesign = buildInlay(engine, tri);
assert.equal(triDesign.layers.length, 2);
assert.equal(triDesign.pieces, 2);
assert.ok(triDesign.inserts);
const triFiles = unzipSync(exportInlay(triDesign, supportedModels[0], 0));
assert.equal(Object.keys(triFiles).filter((n) => n.endsWith('.stl')).length, 3);

const dense = art(
  (x, y) => x % 10 >= 2 && x % 10 <= 7 && y % 12 >= 2 && y % 12 <= 9,
);
const denseDesign = buildInlay(engine, dense);
assert.ok(denseDesign.pieces > 80);
assert.ok(denseDesign.inserts);
assert.equal(denseDesign.layers.length, 1);
const denseBody = solid(denseDesign.body),
  denseInserts = solid(denseDesign.inserts!);
const denseHit = denseBody.intersect(denseInserts);
assert.ok(denseHit.isEmpty(), 'dense inserts do not collide with case');
denseHit.delete();
denseBody.delete();
denseInserts.delete();
console.log('dense pattern', denseDesign.pieces, 'inserts');

const plainModel = supportedModels.find((m) => m.id === 'paperwhite-2018')!;
const plainFiles = unzipSync(
  exportInlay(buildInlay(engine, undefined, 0, plainModel), plainModel, 0),
);
const plainNotes = new TextDecoder().decode(plainFiles['PRINT-NOTES.txt']);
assert.match(plainNotes, /56 layers without supports/);
assert.match(plainNotes, /bed-temperature warning/);
assert.doesNotMatch(plainNotes, /unsupported pocket ceilings/);
