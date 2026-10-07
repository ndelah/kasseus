import {
  CASE,
  CASE_EDGES,
  createCaseGeometry,
  exportCaseSTL,
  caseFilename,
} from './case-geometry';
import {
  parseCaseProfile,
  caseClearance,
  caseOpenEdges,
  caseRetainingLip,
  type CaseProfile,
  type CaseEdge,
} from './case-profile';

/** Inspect the serialized STL, welding its repeated vertices by exact float coordinates. */
export function validatePlainCaseSTL(bytes: Uint8Array, profile: CaseProfile) {
  const model = parseCaseProfile(profile);
  if (bytes.byteLength < 84) throw new Error('Truncated binary STL.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true);
  if (!triangles || bytes.byteLength !== 84 + triangles * 50)
    throw new Error('STL triangle count does not match its byte length.');
  const vertexIds = new Map<string, number>();
  const parents: number[] = [];
  const edges = new Map<string, { count: number; balance: number }>();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  const accessCounts = Object.fromEntries(
    caseOpenEdges(model).map((edge) => [edge, 0]),
  ) as Partial<Record<CaseEdge, number>>;
  let maxOverhangDegrees = 0;
  const root = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  };
  for (let face = 0; face < triangles; face++) {
    const offset = 84 + face * 50;
    const points = [0, 1, 2].map((v) =>
      [0, 1, 2].map((axis) =>
        view.getFloat32(offset + 12 + v * 12 + axis * 4, true),
      ),
    );
    const ids = points.map((point) => {
      if (point.some((v) => !Number.isFinite(v)))
        throw new Error('STL contains non-finite coordinates.');
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
      for (const edge of caseOpenEdges(model)) {
        const atEdge =
          edge === 'bottom'
            ? Math.abs(point[0]) < 10 && point[1] < -model.height / 2
            : edge === 'top'
              ? Math.abs(point[0]) < 10 && point[1] > model.height / 2
              : edge === 'left'
                ? Math.abs(point[1]) < 10 && point[0] < -model.width / 2
                : Math.abs(point[1]) < 10 && point[0] > model.width / 2;
        if (atEdge) {
          accessCounts[edge]!++;
          if (point[2] > CASE.base + 0.401)
            throw new Error(`${edge} access opening is blocked.`);
        }
      }
      const key = point.join(',');
      let id = vertexIds.get(key);
      if (id === undefined) {
        id = parents.length;
        parents.push(id);
        vertexIds.set(key, id);
      }
      return id;
    });
    const [a, b, c] = points;
    const u = b.map((v, i) => v - a[i]);
    const v = c.map((value, i) => value - a[i]);
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    if (Math.hypot(...cross) <= 1e-8)
      throw new Error('STL contains a degenerate triangle.');
    const normal = [0, 1, 2].map((axis) =>
      view.getFloat32(offset + axis * 4, true),
    );
    if (
      normal.some((n) => !Number.isFinite(n)) ||
      Math.abs(Math.hypot(...normal) - 1) > 0.001 ||
      normal.reduce((sum, n, i) => sum + n * cross[i], 0) <= 0
    )
      throw new Error('STL normal disagrees with its triangle winding.');
    if (Math.max(...points.map((point) => point[2])) > 0.001 && normal[2] < 0) {
      const angle = (Math.asin(Math.min(1, -normal[2])) * 180) / Math.PI;
      maxOverhangDegrees = Math.max(maxOverhangDegrees, angle);
      if (normal[2] < -Math.SQRT1_2 - 0.002)
        throw new Error(
          `Above-bed overhang exceeds 45 degrees (${angle.toFixed(2)} degrees).`,
        );
    }
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    for (let i = 0; i < 3; i++) {
      const from = ids[i],
        to = ids[(i + 1) % 3];
      parents[root(from)] = root(to);
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++;
      edge.balance += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) {
    if (edge.count !== 2 || edge.balance !== 0)
      throw new Error('STL is not watertight with consistent winding.');
  }
  const components = new Set(parents.map((_, i) => root(i))).size;
  if (components !== 1)
    throw new Error('Case must be a single connected shell.');
  const dimensions = max.map((v, i) => v - min[i]);
  const expected = [
    model.width + 2 * (caseClearance(model) + CASE.wall),
    model.height + 2 * (caseClearance(model) + CASE.wall),
    CASE.base + model.depth + 0.65,
  ];
  if (
    expected.some((v, i) => Math.abs(v - dimensions[i]) > 0.001) ||
    Math.abs(min[2]) > 0.001
  )
    throw new Error(
      'STL dimensions do not match the selected model and shell settings.',
    );
  if (
    Object.values(accessCounts).some((count) => !count) ||
    volume <= 0 ||
    volume >= dimensions[0] * dimensions[1] * dimensions[2] * 0.8
  )
    throw new Error('Invalid case volume or charging opening.');
  return {
    triangles,
    vertices: vertexIds.size,
    edges: edges.size,
    connectedComponents: components,
    watertight: true,
    consistentWinding: true,
    nondegenerate: true,
    chargingEdgeOpen: caseOpenEdges(model).includes('bottom'),
    openEdges: caseOpenEdges(model),
    maxOverhangDegrees,
    within45DegreeOverhangLimit: true,
    volumeMm3: volume,
    boundsMm: { min, max },
    outerDimensionsMm: {
      width: dimensions[0],
      height: dimensions[1],
      depth: dimensions[2],
    },
  };
}

export function generateCase(input: unknown) {
  const profile = parseCaseProfile(input);
  const geometry = createCaseGeometry(undefined, profile);
  try {
    const view = exportCaseSTL(geometry);
    const stl = new Uint8Array(
      view.buffer,
      view.byteOffset,
      view.byteLength,
    ).slice();
    const validation = validatePlainCaseSTL(stl, profile);
    return {
      filename: caseFilename(profile),
      stl,
      report: {
        schemaVersion: 2,
        generator: 'kasseus-case-generator-v3',
        units: 'mm',
        profile,
        shell: {
          clearancePerSide: caseClearance(profile),
          wall: CASE.wall,
          backing: CASE.base,
          cornerRadius: profile.cornerRadius,
          backSections: profile.backSections ?? null,
          exterior: 'vertical-with-bed-chamfer-and-rounded-rim',
          edgeTreatment: CASE_EDGES,
          retainingLip: caseRetainingLip(profile),
          openEdges: caseOpenEdges(profile),
          backOpenings: profile.backOpenings ?? [],
          bottomRimHeight: 0.4,
        },
        validation,
        physicalFitValidated: false,
        limitations: [
          ...(profile.template === 'envelope-tray'
            ? [
                'Envelope tray: asymmetric contour is not reproduced; a measured insert or padding may be needed.',
              ]
            : []),
          ...(profile.measurements?.evidence === 'reference'
            ? [
                'Nominal reference dimensions need a manufacturer or caliper check.',
              ]
            : []),
          'Corner curvature, rear support, access-window placement, retention and printer tolerance need a physical fit test.',
          'Mesh checks do not certify physical fit or exclude every possible surface intersection.',
        ],
      },
    };
  } finally {
    geometry.dispose();
  }
}
