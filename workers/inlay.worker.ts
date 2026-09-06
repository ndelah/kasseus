import type { SupportedModel } from '../lib/models';
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildInlay } from '../lib/inlay-geometry';
import type { Artwork } from '../lib/case-geometry';
self.onmessage = async (
  event: MessageEvent<{
    art?: Artwork;
    baseColor: number;
    model: SupportedModel;
  }>,
) => {
  try {
    const engine = await Module({ locateFile: () => wasmUrl });
    engine.setup();
    const design = buildInlay(
      engine,
      event.data.art,
      event.data.baseColor,
      event.data.model,
    );
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
