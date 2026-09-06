import assert from 'node:assert/strict';
import {
  createCaseGeometry,
  exportCaseSTL,
  artworkSize,
  caseFilename,
  CASE,
} from '../lib/case-geometry';
import { models, supportedModels } from '../lib/models';
assert.deepEqual(supportedModels.map((m) => m.id).sort(), [
  'paperwhite-2013',
  'paperwhite-2018',
  'paperwhite-2021',
]);
assert.equal(models.filter((m) => m.enabled).length, 3);
const data = new Uint8ClampedArray(16 * 16 * 4).fill(255);
for (let y = 4; y < 12; y++)
  for (let x = 4; x < 12; x++) {
    const p = (y * 16 + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = 0;
  }
for (const model of supportedModels) {
  const expectedById: Record<
    string,
    {
      width: number;
      height: number;
      depth: number;
      cropHeight: number;
      exportName: string;
    }
  > = {
    'paperwhite-2013': {
      width: 117,
      height: 169,
      depth: 9.16,
      cropHeight: 591,
      exportName: 'paperwhite-6',
    },
    'paperwhite-2018': {
      width: 115.84,
      height: 166.57,
      depth: 8.18,
      cropHeight: 588,
      exportName: 'paperwhite-10',
    },
    'paperwhite-2021': {
      width: 124.6,
      height: 174.2,
      depth: 8.1,
      cropHeight: 570,
      exportName: 'paperwhite-11',
    },
  };
  const expected = expectedById[model.id];
  assert.ok(expected, `Missing independent expectations for ${model.id}`);
  assert.equal(model.width, expected.width);
  assert.equal(model.height, expected.height);
  assert.equal(model.depth, expected.depth);
  assert.deepEqual(artworkSize(model), {
    width: 400,
    height: expected.cropHeight,
  });
  for (const [name, art] of [
    ['plain', undefined],
    ['relief', { width: 16, height: 16, data }],
  ] as const) {
    const g = createCaseGeometry(art, model),
      p = g.getAttribute('position'),
      idx = g.getIndex()!;
    const edges = new Map<string, { count: number; balance: number }>();
    let volume = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i),
        b = idx.getX(i + 1),
        c = idx.getX(i + 2);
      for (const [s, t] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = `${Math.min(s, t)}:${Math.max(s, t)}`,
          e = edges.get(key) || { count: 0, balance: 0 };
        e.count++;
        e.balance += s < t ? 1 : -1;
        edges.set(key, e);
      }
      const ax = p.getX(a),
        ay = p.getY(a),
        az = p.getZ(a),
        bx = p.getX(b),
        by = p.getY(b),
        bz = p.getZ(b),
        cx = p.getX(c),
        cy = p.getY(c),
        cz = p.getZ(c);
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az,
        vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      assert.ok(
        Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) >
          1e-8,
        'non-degenerate triangle',
      );
      volume +=
        (ax * (by * cz - bz * cy) +
          ay * (bz * cx - bx * cz) +
          az * (bx * cy - by * cx)) /
        6;
    }
    for (const e of edges.values()) {
      assert.equal(e.count, 2, 'watertight edge');
      assert.equal(e.balance, 0, 'consistent winding');
    }
    assert.ok(volume > 0, 'positive signed volume');
    assert.ok(volume < 80000, 'hollow case, not a solid block');
    const b = g.boundingBox!;
    assert.ok(
      Math.abs(
        b.max.x - b.min.x - (expected.width + 2 * (CASE.clearance + CASE.wall)),
      ) < 0.001,
    );
    assert.ok(
      Math.abs(
        b.max.y -
          b.min.y -
          (expected.height + 2 * (CASE.clearance + CASE.wall)),
      ) < 0.001,
    );
    assert.ok(
      Math.abs(b.max.z - (CASE.base + expected.depth + 0.65)) < 0.001,
      'model-specific wall depth',
    );
    assert.equal(b.min.z < 0, name === 'relief');
    // The centre of the lower rim stays low enough for the charging port/button.
    const bottomRim = [];
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getX(i)) < 10 && p.getY(i) < -expected.height / 2) {
        bottomRim.push(p.getZ(i));
      }
    }
    assert.ok(bottomRim.length > 0);
    assert.ok(Math.max(...bottomRim) <= CASE.base + 0.401, 'open lower edge');
    if (model.id === 'paperwhite-2018') {
      const topRim = [];
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getX(i)) < 10 && p.getY(i) > expected.height / 2) {
          topRim.push(p.getZ(i));
        }
      }
      assert.ok(topRim.length > 0);
      assert.ok(Math.max(...topRim) <= CASE.base + 0.401, 'open upper edge');
      assert.equal(Math.max(...topRim), Math.max(...bottomRim), 'matching rim heights');
    }
    assert.equal(
      caseFilename(model, art),
      `kasseus-${expected.exportName}-${name}-mm.stl`,
    );
    const stl = exportCaseSTL(g);
    assert.equal(stl.getUint32(80, true), idx.count / 3);
    assert.equal(stl.byteLength, 84 + (idx.count / 3) * 50);
    console.log(
      `${model.id} ${name}: ${idx.count / 3} triangles, every edge paired, consistent normals, ${Math.round(volume)} mm³, STL ${stl.byteLength} bytes`,
    );
    g.dispose();
  }
}
