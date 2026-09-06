import { zipSync, strToU8 } from 'fflate';
import { exportCaseSTL } from './case-geometry';
import {
  meshGeometry,
  type InlayDesign,
  type MeshData,
} from './inlay-geometry';
import { hexColor } from './color-separation';
import type { SupportedModel } from './models';
function stl(mesh: MeshData, flat = false) {
  const g = meshGeometry(mesh);
  try {
    if (flat) {
      g.computeBoundingBox();
      g.translate(0, 0, -g.boundingBox!.min.z);
    }
    const data = exportCaseSTL(g);
    return new Uint8Array(
      data.buffer as ArrayBuffer,
      data.byteOffset,
      data.byteLength,
    );
  } finally {
    g.dispose();
  }
}
export function exportInlay(
  design: InlayDesign,
  model: SupportedModel,
  baseColor: number,
) {
  const files: Record<string, Uint8Array> = { 'case.stl': stl(design.body) };
  const bodyIndex = Math.min(
    Math.max(0, baseColor),
    Math.max(0, design.colors.length - 1),
  );
  if (design.layers.length <= 1) {
    if (design.inserts) files['inserts.stl'] = stl(design.inserts, true);
  } else {
    for (const layer of design.layers) {
      const hex = hexColor(design.colors[layer.colorIndex]).slice(1);
      files[`inserts-${layer.colorIndex}-${hex}.stl`] = stl(layer.mesh, true);
    }
  }
  const colors = design.colors.map(hexColor);
  const insertLines = design.layers.length
    ? design.layers
        .map(
          (layer) =>
            `Insert filament ${layer.colorIndex + 1}: ${colors[layer.colorIndex]} (${layer.pieces} piece${layer.pieces === 1 ? '' : 's'})`,
        )
        .join('\n')
    : `Insert filament reference: ${colors.find((_, i) => i !== bodyIndex) ?? 'none'}`;
  files['READ-ME.txt'] = strToU8(
    `KASSEUS — ${model.name}, ${model.generation}\n\nUnits: millimetres. Import at 100% scale.\nCase filament reference: ${colors[bodyIndex]}\n${insertLines}\nSTL does not encode color: choose the corresponding filament yourself.\n\n${design.pieces} loose inserts, arranged in their assembly positions. Print inserts flat. Use the app's assembled preview as your placement guide.\nPockets: 0.8 mm. Inserts: 0.6 mm. Side clearance: 0.2 mm. Glue allowance: 0.05 mm. Insert faces sit 0.15 mm below the case surface.\nThese are glue-in inlays, not locking or tested press-fit parts. Test adhesive compatibility and fit first.\nBack thickness: 2.4 mm, leaving 1.6 mm below pockets. Walls: 1.6 mm. Flexible TPU is recommended for fitting the retaining lip. Inspect orientation, bridging and supports in your slicer; pocket ceilings may need support.\nThis is an untested physical prototype based on published device dimensions. Print a fit test before a final case.\n\n${design.warnings.join('\n')}\n`,
  );
  return zipSync(files);
}
