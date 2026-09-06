'use client';
import { useEffect, useState } from 'react';
import type { Artwork, ArtworkPlacement } from '@/lib/case-geometry';
import type { SupportedModel } from '@/lib/models';
import type { DesignStyle, InlayDesign } from '@/lib/inlay-geometry';
// Vite supplies the constructor for ?worker imports.
// oxlint-disable-next-line import/default
import InlayWorker from '../workers/inlay.worker?worker';
export function useInlay(
  art: Artwork | undefined,
  baseColor: number,
  model: SupportedModel,
  placement: ArtworkPlacement,
  style: DesignStyle = 'inlay',
) {
  const geometryColor = style === 'sculpted' ? 0 : baseColor;
  const [result, setResult] = useState<{
    art: Artwork | undefined;
    baseColor: number;
    model: SupportedModel;
    placement: ArtworkPlacement;
    style: DesignStyle;
    design?: InlayDesign;
    error?: string;
  }>();
  useEffect(() => {
    let worker: Worker;
    let timeout: ReturnType<typeof setTimeout>;
    const fail = (error: string) =>
      setResult({
        art,
        baseColor: geometryColor,
        model,
        placement,
        style,
        error,
      });
    try {
      worker = new InlayWorker();
      timeout = setTimeout(() => {
        worker.terminate();
        fail('This pattern took too long to process. Please try again.');
      }, 180000);
      worker.onmessage = (
        event: MessageEvent<{ design?: InlayDesign; error?: string }>,
      ) => {
        clearTimeout(timeout);
        setResult({
          art,
          baseColor: geometryColor,
          model,
          placement,
          style,
          ...event.data,
        });
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        fail('The geometry engine could not load. Reload and try again.');
      };
      worker.postMessage({
        art,
        baseColor: geometryColor,
        model,
        placement,
        style,
      });
    } catch {
      queueMicrotask(() =>
        fail('The geometry engine could not start. Reload and try again.'),
      );
    }
    return () => {
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [art, geometryColor, model, placement, style]);
  const current =
    result?.art === art &&
    result?.baseColor === geometryColor &&
    result?.model === model &&
    result?.placement === placement &&
    result?.style === style;
  return {
    design: current ? result?.design : undefined,
    error: current ? result?.error : undefined,
    pending: !current,
  };
}
