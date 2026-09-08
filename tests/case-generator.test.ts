import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { supportedModels } from '../lib/models';
import { parseCaseProfile } from '../lib/case-profile';
import { generateCase, validatePlainCaseSTL } from '../lib/case-generator';

const model = supportedModels.find((m) => m.id === 'paperwhite-2018')!;
assert.ok(model);
assert.equal(
  new Set(supportedModels.map((m) => m.id)).size,
  supportedModels.length,
);
const generated = generateCase(model);
// Intersect serialized triangles with a ray through the middle of the right wall.
// Independent scan-derived checks ensure the hollow cavity actually narrows at the back.
function rightWallCrossings(z: number) {
  const view = new DataView(generated.stl.buffer);
  const xs: number[] = [];
  for (let offset = 84; offset < generated.stl.length; offset += 50) {
    const p = [0, 1, 2].map((i) =>
      [0, 1, 2].map((a) => view.getFloat32(offset + 12 + i * 12 + a * 4, true)),
    );
    const section: number[][] = [];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      if ((p[a][1] <= 0 && p[b][1] > 0) || (p[b][1] <= 0 && p[a][1] > 0)) {
        const t = -p[a][1] / (p[b][1] - p[a][1]);
        section.push(p[a].map((v, k) => v + t * (p[b][k] - v)));
      }
    }
    if (section.length !== 2) continue;
    const [a, b] = section;
    if ((a[2] <= z && b[2] > z) || (b[2] <= z && a[2] > z)) {
      const x = a[0] + ((z - a[2]) / (b[2] - a[2])) * (b[0] - a[0]);
      if (x > 0) xs.push(x);
    }
  }
  return [...new Set(xs.map((x) => Math.round(x * 10000) / 10000))].sort(
    (a, b) => a - b,
  );
}
const rearWall = rightWallCrossings(2.5),
  middleWall = rightWallCrossings(5.3),
  upperWall = rightWallCrossings(9);
for (const wall of [rearWall, middleWall, upperWall]) {
  assert.equal(
    wall.length,
    2,
    'one cavity boundary and one outer wall, no folds',
  );
  assert.ok(wall[1] - wall[0] >= 1.5, 'side wall retains material thickness');
  assert.ok(
    Math.abs(wall[1] - 59.87) < 0.001,
    'exterior stays vertical through the rear transition',
  );
}
assert.ok(
  Math.abs(rearWall[0] - 53.67) < 0.1,
  'rear cavity includes measured 4.6 mm per-side inset plus clearance',
);
assert.ok(
  Math.abs(middleWall[0] - 57.0) < 0.2,
  'mid-back cavity follows scan outline',
);
assert.ok(
  Math.abs(upperWall[0] - 58.27) < 0.1,
  'full published width plus clearance near front',
);
assert.ok(rearWall[0] < middleWall[0] && middleWall[0] < upperWall[0]);
// Bed-facing edge grows by 0.4 mm over 0.4 mm of height, then stays vertical.
assert.ok(Math.abs(rightWallCrossings(0.2).at(-1)! - 59.67) < 0.001);
assert.ok(Math.abs(rightWallCrossings(0.6).at(-1)! - 59.87) < 0.001);
// The rounded upper rim retreats inward without reducing the full wall below it.
assert.ok(rightWallCrossings(11.2).at(-1)! < 59.8);
// Every downward face above the bed must remain within a 45-degree overhang.
const printableView = new DataView(generated.stl.buffer);
for (let offset = 84; offset < generated.stl.length; offset += 50) {
  const nz = printableView.getFloat32(offset + 8, true);
  const zs = [0, 1, 2].map((i) =>
    printableView.getFloat32(offset + 20 + i * 12, true),
  );
  if (Math.max(...zs) < 0.001) continue; // Flat back rests on the bed.
  assert.ok(
    nz >= -Math.SQRT1_2 - 0.002,
    `unsupported steep face: normal Z ${nz}, heights ${zs}`,
  );
}

assert.equal(generated.filename, 'kasseus-paperwhite-10-plain-mm.stl');
assert.deepEqual(
  generated.stl,
  generateCase(model).stl,
  'reproducible binary STL',
);
assert.equal(generated.report.physicalFitValidated, false);
assert.ok(
  Math.abs(generated.report.validation.outerDimensionsMm.height - 170.47) <
    0.001,
);
assert.ok(
  Math.abs(generated.report.validation.outerDimensionsMm.width - 119.74) <
    0.001,
);
assert.ok(
  Math.abs(generated.report.validation.outerDimensionsMm.depth - 11.23) < 0.001,
);
assert.throws(
  () => validatePlainCaseSTL(generated.stl.slice(0, -1), model),
  /byte length/,
);
const broken = generated.stl.slice();
new DataView(broken.buffer).setFloat32(96, NaN, true);
assert.throws(() => validatePlainCaseSTL(broken, model), /non-finite/);
const hole = generated.stl.slice(0, -50);
const holeView = new DataView(hole.buffer);
holeView.setUint32(80, holeView.getUint32(80, true) - 1, true);
assert.throws(() => validatePlainCaseSTL(hole, model), /watertight/);
assert.throws(
  () => validatePlainCaseSTL(generated.stl, supportedModels[0]),
  /dimensions/,
);
for (const bad of [
  { ...model, width: -1 },
  { ...model, depth: NaN },
  { ...model, cornerRadius: 60 },
  { ...model, id: '../escape' },
  { ...model, template: 'asymmetric-oasis' },
  { ...model, fitStatus: 'verified' },
  { ...model, backSections: [] },
  {
    ...model,
    backSections: [
      { depth: 0, insetX: 0, insetY: 0, radius: 9 },
      { depth: 8.18, insetX: 80, insetY: 0, radius: 5 },
    ],
  },
  { ...model, backSections: model.backSections!.toReversed() },
  {
    ...model,
    backSections: model.backSections!.map((s, i) =>
      i === 2 ? { ...s, insetX: NaN } : s,
    ),
  },
])
  assert.throws(() => parseCaseProfile(bad));

const directory = mkdtempSync(join(tmpdir(), 'kasseus-generator-test-'));
const cli = resolve('scripts/generate-case.ts');
const run = (...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
  });
try {
  assert.match(run('--list'), /paperwhite-2018\s+prototype ready/);
  const invalid = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      cli,
      '--model',
      'paperwhite-2018',
      '--model',
      'oasis-2019',
      '--out-dir',
      directory,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /No case profile/);
  assert.deepEqual(readdirSync(directory), [], 'invalid batch writes nothing');
  run('--all', '--out-dir', directory);
  assert.deepEqual(
    readdirSync(directory).sort(),
    supportedModels.map((m) => m.id).sort(),
  );
  for (const profile of supportedModels) {
    const report = JSON.parse(
      readFileSync(join(directory, profile.id, 'report.json'), 'utf8'),
    );
    const bytes = readFileSync(
      join(directory, profile.id, report.stl.filename),
    );
    assert.equal(bytes.length, report.stl.bytes);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      report.stl.sha256,
    );
    assert.equal(report.profile.id, profile.id);
    assert.equal(validatePlainCaseSTL(bytes, profile).connectedComponents, 1);
    assert.match(
      readFileSync(join(directory, profile.id, 'PRINT-NOTES.txt'), 'utf8'),
      /untested physical prototype/,
    );
  }
  const custom = {
    ...model,
    id: 'custom-kindle',
    exportName: 'custom-kindle',
    width: 121,
    cornerRadius: 10,
    backSections: undefined,
  };
  const customPath = join(directory, 'custom.json');
  writeFileSync(customPath, JSON.stringify(custom));
  run('--profile', customPath, '--out-dir', directory);
  const bytes = readFileSync(
    join(directory, custom.id, 'kasseus-custom-kindle-plain-mm.stl'),
  );
  assert.ok(
    Math.abs(
      validatePlainCaseSTL(bytes, custom).outerDimensionsMm.width - 124.9,
    ) < 0.001,
  );
  assert.notDeepEqual(
    bytes,
    generated.stl,
    'custom dimensions and radius change the mesh',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(
  'Case generator: deterministic STL, serialized mesh validation, invalid profiles, batch generation and custom profiles passed.',
);
