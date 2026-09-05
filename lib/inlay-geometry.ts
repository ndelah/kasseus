import { supportedModel, type SupportedModel } from './models';
import type {
  ManifoldToplevel,
  CrossSection,
  Manifold,
  SimplePolygon,
} from 'manifold-3d';
import * as THREE from 'three';
import { CASE, createCaseGeometry, type Artwork } from './case-geometry';
import {
  separateColors,
  tracePattern,
  type Separation,
} from './color-separation';
export const INLAY = {
  pocketDepth: 0.8,
  thickness: 0.6,
  sideGap: 0.2,
  glueGap: 0.05,
  minWidth: 1.2,
  minArea: 4,
  maxPieces: 80,
};
export type MeshData = { positions: Float32Array; indices: Uint32Array };
export type InlayDesign = {
  body: MeshData;
  inserts: MeshData | null;
  colors: Separation['colors'];
  pattern: SimplePolygon[];
  removed: SimplePolygon[];
  pieces: number;
  warnings: string[];
  bodyVolume: number;
  insertVolume: number;
  removedArea: number;
};
export function meshGeometry(mesh: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}
export function buildInlay(
  module: ManifoldToplevel,
  art?: Artwork,
  baseColor = 0,
  model: SupportedModel = supportedModel,
): InlayDesign {
  const owned: Array<{ delete(): void }> = [];
  const own = <T extends { delete(): void }>(o: T): T => {
    owned.push(o);
    return o;
  };
  const { Manifold, Mesh, CrossSection } = module;
  const plain = createCaseGeometry(undefined, model);
  try {
    const solid = own(
      new Manifold(
        new Mesh({
          numProp: 3,
          vertProperties: new Float32Array(
            plain.getAttribute('position').array,
          ),
          triVerts: new Uint32Array(plain.getIndex()!.array),
        }),
      ),
    );
    const serialize = (m: Manifold): MeshData => {
      if (m.status() !== 'NoError')
        throw new Error(
          'Could not create a closed printable mesh. Try a simpler pattern.',
        );
      const mesh = m.getMesh();
      const pos = new Float32Array(mesh.numVert * 3);
      for (let i = 0; i < mesh.numVert; i++)
        for (let k = 0; k < 3; k++)
          pos[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k];
      return { positions: pos, indices: new Uint32Array(mesh.triVerts) };
    };
    const result: InlayDesign = {
      body: serialize(solid),
      inserts: null,
      colors: [
        [225, 196, 165],
        [120, 87, 67],
      ],
      pattern: [],
      removed: [],
      pieces: 0,
      warnings: [],
      bodyVolume: solid.volume(),
      insertVolume: 0,
      removedArea: 0,
    };
    if (!art) return result;
    const s = separateColors(art);
    result.colors = s.colors;
    if (s.contrast < 24) {
      result.warnings.push(
        'Only one distinct color was found. Use a higher-contrast image to create inserts.',
      );
      return result;
    }
    if (s.approximation > 28)
      result.warnings.push(
        'This image has more than two tones. Check the simplified preview carefully; shading and other colors are merged.',
      );
    const polygons = tracePattern(
      s,
      baseColor,
      model.width + 2 * (CASE.clearance + CASE.wall) - 12,
      model.height + 2 * (CASE.clearance + CASE.wall) - 12,
    );
    if (polygons.length > 1000)
      throw new Error(
        'This image has too many small details. Try broad shapes with two flat colors.',
      );
    const raw = own(new CrossSection(polygons.flat(), 'EvenOdd'));
    const simple = own(raw.simplify(0.12));
    // Morphological opening removes narrow bridges and details before making paired geometry.
    const core = own(simple.offset(-INLAY.minWidth / 2, 'Round', 2, 16));
    const expanded = own(core.offset(INLAY.minWidth / 2, 'Round', 2, 16));
    const opened = own(expanded.intersect(simple));
    const components = opened.decompose().map(own);
    const kept: CrossSection[] = [];
    for (const part of components) {
      if (part.area() < INLAY.minArea) continue;
      kept.push(part);
    }
    if (kept.length > INLAY.maxPieces)
      throw new Error(
        'This image would need more than 80 loose inserts. Please use a simpler pattern.',
      );
    const region = own(CrossSection.union(kept));
    // Cleanup is intentionally visible: discarded features remain highlighted in the review.
    const removed = own(raw.subtract(region));
    result.removed = removed.toPolygons();
    result.removedArea = removed.area();
    if (result.removedArea > 1)
      result.warnings.push(
        'Orange areas were removed or softened because they are too small or narrow. Review before downloading.',
      );
    if (kept.length === 0) {
      result.warnings.push(
        'No printable shapes remain. Use larger shapes or remove the image for a plain case.',
      );
      return result;
    }
    const inset = own(region.offset(-INLAY.sideGap, 'Round', 2, 16));
    if (inset.isEmpty())
      throw new Error(
        'The pattern disappears after fitting clearance. Please use larger shapes.',
      );
    const pieces = inset.decompose().map(own);
    result.pieces = pieces.length;
    if (result.pieces > INLAY.maxPieces)
      throw new Error(
        'Too many separate inserts remain after fitting clearance. Use simpler shapes.',
      );
    if (result.pieces > 25)
      result.warnings.push(
        `${result.pieces} separate inserts will need to be glued into place. A bolder pattern will be easier to assemble.`,
      );
    const cut = own(region.extrude(INLAY.pocketDepth + 0.1));
    const cutter = own(cut.translate([0, 0, -0.1]));
    const body = own(solid.subtract(cutter));
    const extruded = own(inset.extrude(INLAY.thickness));
    const inserts = own(
      extruded.translate([
        0,
        0,
        INLAY.pocketDepth - INLAY.glueGap - INLAY.thickness,
      ]),
    );
    // Keep 1.6 mm of continuous backing below the 0.8 mm pockets.
    result.body = serialize(body);
    result.inserts = serialize(inserts);
    result.pattern = region.toPolygons();
    result.bodyVolume = body.volume();
    result.insertVolume = inserts.volume();
    return result;
  } finally {
    plain.dispose();
    owned.reverse().forEach((o) => o.delete());
  }
}
