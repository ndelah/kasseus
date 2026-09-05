'use client';
import { useEffect, useState } from 'react';
import type { Artwork } from '@/lib/case-geometry';
import type { SupportedModel } from '@/lib/models';
import type { InlayDesign } from '@/lib/inlay-geometry';
// Vite supplies the constructor for ?worker imports.
// oxlint-disable-next-line import/default
import InlayWorker from '../workers/inlay.worker?worker';
export function useInlay(
  art: Artwork | undefined,
  baseColor: number,
  model: SupportedModel,
) {
  const [result, setResult] = useState<{
    art: Artwork | undefined;
    baseColor: number;
    model: SupportedModel;
    design?: InlayDesign;
    error?: string;
  }>();
  useEffect(() => {
    let worker: Worker;
    let timeout: ReturnType<typeof setTimeout>;
    const fail = (error: string) => setResult({ art, baseColor, model, error });
    try {
      worker = new InlayWorker();
      timeout = setTimeout(() => {
        worker.terminate();
        fail('This pattern took too long to process. Try a simpler image.');
      }, 60000);
      worker.onmessage = (
        event: MessageEvent<{ design?: InlayDesign; error?: string }>,
      ) => {
        clearTimeout(timeout);
        setResult({ art, baseColor, model, ...event.data });
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        fail('The geometry engine could not load. Reload and try again.');
      };
      worker.postMessage({ art, baseColor, model });
    } catch {
      queueMicrotask(() =>
        fail('The geometry engine could not start. Reload and try again.'),
      );
    }
    return () => {
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [art, baseColor, model]);
  const current =
    result?.art === art &&
    result?.baseColor === baseColor &&
    result?.model === model;
  return {
    design: current ? result?.design : undefined,
    error: current ? result?.error : undefined,
    pending: !current,
  };
}
