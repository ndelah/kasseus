import assert from 'node:assert/strict';
import { createCaseGeometry, exportCaseSTL, CASE } from '../lib/case-geometry';
const data = new Uint8ClampedArray(16 * 16 * 4).fill(255);
for (let y = 4; y < 12; y++)
  for (let x = 4; x < 12; x++) {
    const p = (y * 16 + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = 0;
  }
for (const [name, art] of [
  ['plain', undefined],
  ['relief', { width: 16, height: 16, data }],
] as const) {
  const g = createCaseGeometry(art),
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
      b.max.x - b.min.x - (CASE.width + 2 * (CASE.clearance + CASE.wall)),
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      b.max.y - b.min.y - (CASE.height + 2 * (CASE.clearance + CASE.wall)),
    ) < 0.001,
  );
  assert.equal(b.min.z < 0, name === 'relief');
  const stl = exportCaseSTL(g);
  assert.equal(stl.getUint32(80, true), idx.count / 3);
  assert.equal(stl.byteLength, 84 + (idx.count / 3) * 50);
  console.log(
    `${name}: ${idx.count / 3} triangles, every edge paired, consistent normals, ${Math.round(volume)} mm³, STL ${stl.byteLength} bytes`,
  );
  g.dispose();
}
