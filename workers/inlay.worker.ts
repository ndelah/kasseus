import type { SupportedModel } from '../lib/models';
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {
  buildInlay,
  buildSculpted,
  type DesignStyle,
} from '../lib/inlay-geometry';
import type { Artwork, ArtworkPlacement } from '../lib/case-geometry';
self.onmessage = async (
  event: MessageEvent<{
    art?: Artwork;
    baseColor: number;
    model: SupportedModel;
    placement: ArtworkPlacement;
    style?: DesignStyle;
  }>,
) => {
  try {
    const { art, baseColor, model, placement, style } = event.data;
    if (style === 'sculpted' && art) {
      self.postMessage({ design: buildSculpted(art, model, placement) });
      return;
    }
    const engine = await Module({ locateFile: () => wasmUrl });
    engine.setup();
    const design = buildInlay(engine, art, baseColor, model, placement);
    self.postMessage({ design });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : 'The pattern could not be generated. Please try another image.',
    });
  }
};
