import { supportedModel, type SupportedModel } from './models';
import type {
  ManifoldToplevel,
  CrossSection,
  Manifold,
  SimplePolygon,
} from 'manifold-3d';
import * as THREE from 'three';
import {
  artworkPanel,
  createCaseGeometry,
  type Artwork,
  type ArtworkPlacement,
} from './case-geometry';
import {
  COLOR_SEPARATION,
  separateColors,
  tracePattern,
  type RGB,
  type Separation,
} from './color-separation';
import { recoverTextureDepth, TEXTURE_RELIEF } from './texture-depth';

/** How uploaded artwork is turned into a printable case. */
export type DesignStyle = 'inlay' | 'sculpted';

/** Filament references for a single-piece sculpted case. */
export const SCULPTED_FILAMENTS: RGB[] = [
  [225, 196, 165],
  [48, 46, 44],
  [122, 92, 70],
  [186, 112, 86],
];
export const INLAY = {
  pocketDepth: 0.8,
  thickness: 0.6,
  sideGap: 0.2,
  glueGap: 0.05,
  minWidth: 0.8,
  minArea: 1,
  assemblyNoteAt: 25,
};
export type MeshData = { positions: Float32Array; indices: Uint32Array };
export type InsertLayer = {
  colorIndex: number;
  mesh: MeshData;
  pattern: SimplePolygon[];
  pieces: number;
  volume: number;
};
export type DepthPreview = {
  width: number;
  height: number;
  values: Float32Array;
};

export type InlayDesign = {
  kind: 'plain' | 'inlay' | 'sculpted';
  body: MeshData;
  inserts: MeshData | null;
  layers: InsertLayer[];
  colors: Separation['colors'];
  pattern: SimplePolygon[];
  removed: SimplePolygon[];
  pieces: number;
  warnings: string[];
  bodyVolume: number;
  insertVolume: number;
  removedArea: number;
  reliefMm?: number;
  depthMap?: DepthPreview;
};
export function meshGeometry(mesh: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/**
 * Create a counter-clockwise rounded rectangle suitable for a Manifold
 * cross-section. The artwork boundary uses the same dimensions and curvature
 * as the case back's printable panel.
 */
function roundedRectangle(
  width: number,
  height: number,
  radius: number,
): SimplePolygon {
  const r = Math.min(radius, width / 2, height / 2);
  const x = width / 2 - r;
  const y = height / 2 - r;
  const points: SimplePolygon = [];
  for (let corner = 0; corner < 4; corner++) {
    const start = -Math.PI / 2 + (corner * Math.PI) / 2;
    const cx = corner < 2 ? x : -x;
    const cy = corner === 0 || corner === 3 ? -y : y;
    for (let step = 0; step < 16; step++) {
      const angle = start + (step * Math.PI) / 32;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  }
  return points;
}

export function buildInlay(
  module: ManifoldToplevel,
  art?: Artwork,
  baseColor = 0,
  model: SupportedModel = supportedModel,
  placement: ArtworkPlacement = 'centered',
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
          'Could not create a closed printable mesh from this pattern.',
        );
      const mesh = m.getMesh();
      const pos = new Float32Array(mesh.numVert * 3);
      for (let i = 0; i < mesh.numVert; i++)
        for (let k = 0; k < 3; k++)
          pos[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k];
      return { positions: pos, indices: new Uint32Array(mesh.triVerts) };
    };
    const combine = (parts: CrossSection[]) => {
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return own(CrossSection.union(parts));
    };
    const printable = (polygons: SimplePolygon[][]) => {
      if (polygons.length === 0) return null;
      const source = own(new CrossSection(polygons.flat(), 'EvenOdd'));
      const panel = artworkPanel(model, placement);
      const boundary = own(
        new CrossSection(
          [roundedRectangle(panel.width, panel.height, panel.radius)],
          'EvenOdd',
        ),
      );
      // Crop before simplifying so no insert can spill over the curved back edge.
      const raw = own(source.intersect(boundary));
      const simple = own(raw.simplify(0.12));
      const core = own(simple.offset(-INLAY.minWidth / 2, 'Round', 2, 16));
      const expanded = own(core.offset(INLAY.minWidth / 2, 'Round', 2, 16));
      const opened = own(expanded.intersect(simple));
      const kept: CrossSection[] = [];
      for (const part of opened.decompose().map(own)) {
        if (part.area() < INLAY.minArea) continue;
        kept.push(part);
      }
      return { raw, region: combine(kept) };
    };
    const result: InlayDesign = {
      kind: art ? 'inlay' : 'plain',
      body: serialize(solid),
      inserts: null,
      layers: [],
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
    const bodyIndex = Math.min(Math.max(0, baseColor), s.colors.length - 1);
    if (s.colors.length < 2 || s.contrast < COLOR_SEPARATION) {
      result.warnings.push(
        'Only one distinct color was found. Use a higher-contrast image to create inserts.',
      );
      return result;
    }
    const { width: widthMM, height: heightMM } = artworkPanel(model, placement);
    const combined = printable(
      tracePattern(s, (label) => label !== bodyIndex, widthMM, heightMM),
    );
    if (!combined?.region) {
      result.warnings.push(
        'No printable shapes remain. Use larger shapes or remove the image for a plain case.',
      );
      if (combined) {
        result.removed = combined.raw.toPolygons();
        result.removedArea = combined.raw.area();
      }
      return result;
    }
    const region = combined.region;
    const removed = own(combined.raw.subtract(region));
    result.removed = removed.toPolygons();
    result.removedArea = removed.area();
    if (result.removedArea > 1)
      result.warnings.push(
        'Orange areas were removed or softened because they are too small or narrow. Review before downloading.',
      );
    const inset = own(region.offset(-INLAY.sideGap, 'Round', 2, 16));
    if (inset.isEmpty())
      throw new Error(
        'The pattern disappears after fitting clearance. Please use larger shapes.',
      );
    const solids: Manifold[] = [];
    for (let colorIndex = 0; colorIndex < s.colors.length; colorIndex++) {
      if (colorIndex === bodyIndex) continue;
      const traced = tracePattern(
        s,
        (label) => label === colorIndex,
        widthMM,
        heightMM,
      );
      if (traced.length === 0) continue;
      const mask = own(new CrossSection(traced.flat(), 'EvenOdd'));
      const slice = own(mask.intersect(region));
      if (slice.isEmpty() || slice.area() < INLAY.minArea) continue;
      const layerInset = own(slice.offset(-INLAY.sideGap, 'Round', 2, 16));
      if (layerInset.isEmpty()) continue;
      const pieces = layerInset.decompose().map(own);
      const printablePieces = pieces.filter(
        (part) => part.area() >= INLAY.minArea,
      );
      if (printablePieces.length === 0) continue;
      const layerRegion = combine(printablePieces);
      if (!layerRegion) continue;
      const extruded = own(layerRegion.extrude(INLAY.thickness));
      const placed = own(
        extruded.translate([
          0,
          0,
          INLAY.pocketDepth - INLAY.glueGap - INLAY.thickness,
        ]),
      );
      solids.push(placed);
      result.layers.push({
        colorIndex,
        mesh: serialize(placed),
        pattern: layerRegion.toPolygons(),
        pieces: printablePieces.length,
        volume: placed.volume(),
      });
    }
    result.pattern = result.layers.flatMap((layer) => layer.pattern);
    result.pieces = result.layers.reduce((n, layer) => n + layer.pieces, 0);
    if (result.pieces === 0) {
      result.warnings.push(
        'No printable shapes remain. Use larger shapes or remove the image for a plain case.',
      );
      return result;
    }
    if (result.pieces > INLAY.assemblyNoteAt)
      result.warnings.push(
        `${result.pieces} separate inserts will need to be glued into place.`,
      );
    const cut = own(region.extrude(INLAY.pocketDepth + 0.1));
    const cutter = own(cut.translate([0, 0, -0.1]));
    const body = own(solid.subtract(cutter));
    let inserts = solids[0];
    for (let i = 1; i < solids.length; i++)
      inserts = own(inserts.add(solids[i]));
    result.body = serialize(body);
    result.inserts = serialize(inserts);
    result.bodyVolume = body.volume();
    result.insertVolume = inserts.volume();
    return result;
  } finally {
    plain.dispose();
    owned.reverse().forEach((o) => o.delete());
  }
}

function meshFromGeometry(geometry: THREE.BufferGeometry): MeshData {
  return {
    positions: new Float32Array(geometry.getAttribute('position').array),
    indices: new Uint32Array(geometry.getIndex()!.array),
  };
}

function signedVolume(mesh: MeshData) {
  let volume = 0;
  const p = mesh.positions;
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3,
      b = idx[i + 1] * 3,
      c = idx[i + 2] * 3;
    volume +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
        p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return volume;
}

/**
 * Build a single-piece case whose back is displaced by the depth recovered
 * from a texture photograph. No pockets or inserts are cut.
 */
export function buildSculpted(
  art: Artwork,
  model: SupportedModel = supportedModel,
  placement: ArtworkPlacement = 'centered',
): InlayDesign {
  const depth = recoverTextureDepth(art);
  const geometry = createCaseGeometry(art, model, {
    placement,
    heightField: depth,
  });
  try {
    const body = meshFromGeometry(geometry);
    const warnings: string[] = [];
    if (depth.peakMm < 0.08)
      warnings.push(
        'This image has little shading. Try a photo with clearer grain, lines or side lighting.',
      );
    return {
      kind: 'sculpted',
      body,
      inserts: null,
      layers: [],
      colors: SCULPTED_FILAMENTS,
      pattern: [],
      removed: [],
      pieces: 0,
      warnings,
      bodyVolume: signedVolume(body),
      insertVolume: 0,
      removedArea: 0,
      reliefMm: Math.min(TEXTURE_RELIEF, depth.peakMm),
      depthMap: {
        width: depth.width,
        height: depth.height,
        values: depth.preview,
      },
    };
  } finally {
    geometry.dispose();
  }
}
