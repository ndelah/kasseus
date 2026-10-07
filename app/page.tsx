'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Upload,
  Download,
  RotateCcw,
  Move,
  Layers,
  Tablet,
  X,
  Loader2,
  Plus,
  Minus,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CasePreview from '@/components/case-preview';
import { models, supportedModel, supportedModels } from '@/lib/models';
import { readArtwork, type Artwork } from '@/lib/case-geometry';
import { useInlay } from '@/hooks/use-inlay';
import { exportInlay } from '@/lib/inlay-export';
import { printingNotes } from '@/lib/printing-notes';
import { InlayReview } from '@/components/inlay-review';
import { DesignPicker } from '@/components/design-picker';
import { defaultDesign, type PremadeDesign } from '@/lib/premade-designs';

export default function Home() {
  const [model, setModel] = useState(supportedModel);
  const [art, setArt] = useState<Artwork>();
  const [baseColor, setBaseColor] = useState(0);
  const {
    design,
    pending,
    error: geometryError,
  } = useInlay(art, baseColor, model);
  const [imageUrl, setImageUrl] = useState<string>(defaultDesign.artwork);
  const [filename, setFilename] = useState<string>(defaultDesign.name);
  const [artworkSource, setArtworkSource] = useState('design');
  const [presetId, setPresetId] = useState<string | undefined>(
    defaultDesign.id,
  );
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState('artwork');
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const request = useRef(0);
  useEffect(() => {
    if (!imageUrl) return;
    const n = ++request.current;
    readArtwork(imageUrl, model)
      .then((data) => {
        if (n === request.current) {
          setArt(data);
        }
      })
      .catch((e) => {
        if (n === request.current) {
          setArt(undefined);
          setError(
            e instanceof Error
              ? e.message
              : 'Artwork could not load. Upload another image or export a plain case.',
          );
        }
      })
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
    return () => {
      // Invalidate pending uploads on unmount; this ref is a request counter, not a DOM node.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      request.current++;
    };
  }, [imageUrl, model]);
  useEffect(() => {
    return () => {
      if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);
  function upload(file?: File) {
    if (!file) return;
    setError('');
    setSaved(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('This image is too large. Choose a file under 10 MB.');
      return;
    }
    request.current++;
    setBusy(true);
    setArt(undefined);
    setImageUrl(URL.createObjectURL(file));
    setFilename(file.name);
    setPresetId(undefined);
    setArtworkSource('upload');
    setBaseColor(0);
    setView('artwork');
  }
  function selectDesign(preset: PremadeDesign) {
    if (imageUrl === preset.artwork) return;
    request.current++;
    setBusy(true);
    setArt(undefined);
    setImageUrl(preset.artwork);
    setFilename(preset.name);
    setPresetId(preset.id);
    setArtworkSource('design');
    setBaseColor(0);
    setView('artwork');
    setSaved(false);
    setError('');
  }
  function showPreview() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      previewRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
    }
  }
  function selectModel(id: string | null) {
    const next = supportedModels.find((candidate) => candidate.id === id);
    if (!next || next.id === model.id) return;
    request.current++;
    setModel(next);
    setArt(undefined);
    setBusy(Boolean(imageUrl));
    setSaved(false);
    setError('');
  }
  function remove() {
    request.current++;
    setArt(undefined);
    setImageUrl('');
    setFilename('');
    setPresetId(undefined);
    setBusy(false);
    setError('');
    setSaved(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  async function download() {
    setExporting(true);
    setError('');
    setSaved(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      if (!design) throw new Error('Geometry is still preparing');
      const bytes = exportInlay(design, model, baseColor);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: 'application/zip',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kasseus-${model.exportName}-${design.inserts ? 'inlay' : 'plain'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setSaved(true);
    } catch {
      setError('The STL could not be generated. Please try again.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="studio">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Kasseus home">
          <BookOpen />
          kasseus
        </Link>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>
              Design your own <em>Kindle case.</em>
            </h1>
            <p className="intro-copy">
              Choose your model, add artwork, and download the case and inserts
              as STL files for 3D printing.
            </p>
          </div>
        </div>
        <div className="workspace">
          <aside className="controls" aria-label="Case designer controls">
            <section
              className="glass control-card model-card"
              aria-labelledby="model-heading"
            >
              <div className="section-heading">
                <span className="step">1</span>
                <h2 id="model-heading">Kindle model</h2>
              </div>
              <Select
                value={model.id}
                onValueChange={selectModel}
                disabled={exporting}
              >
                <SelectTrigger
                  className="model-select"
                  aria-label="Kindle model"
                >
                  <span className="model-option">
                    <Tablet size={26} />
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.generation}</small>
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent
                  className="model-menu"
                  alignItemWithTrigger={false}
                >
                  {[
                    ...supportedModels,
                    ...models.filter((m) => !m.enabled),
                  ].map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={!m.enabled}>
                      <span className="model-option">
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.generation} · Prototype</small>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="model-help">
                Find your model in Settings → Device Options → Device Info.{' '}
                <Link href="/cases/all-cases.zip" prefetch={false} download>
                  Download all plain cases
                </Link>
                .
              </p>
            </section>
            <section
              className="glass control-card artwork-card"
              aria-labelledby="artwork-heading"
            >
              <div className="section-heading">
                <span className="step">2</span>
                <h2 id="artwork-heading">Artwork</h2>
                <span className="small-label">Optional</span>
              </div>
              <Tabs
                value={artworkSource}
                onValueChange={setArtworkSource}
                className="artwork-source"
              >
                <TabsList aria-label="Artwork source">
                  <TabsTrigger value="design" disabled={exporting}>
                    Choose a design
                  </TabsTrigger>
                  <TabsTrigger value="upload" disabled={exporting}>
                    Upload your own
                  </TabsTrigger>
                </TabsList>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <TabsContent value="design">
                  <DesignPicker
                    modelId={model.id}
                    selectedId={presetId}
                    disabled={exporting}
                    onSelect={selectDesign}
                    onPreview={showPreview}
                  />
                </TabsContent>
                {imageUrl && (
                  <div className="art-file">
                    <Image
                      src={imageUrl}
                      alt="Selected case artwork"
                      width={40}
                      height={48}
                      unoptimized
                    />
                    <div>
                      <p>{filename}</p>
                      {!presetId && <small>Centered on the back panel</small>}
                    </div>
                    <button
                      onClick={remove}
                      disabled={exporting}
                      aria-label="Remove artwork for a plain case"
                      title="Remove artwork"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <TabsContent value="upload">
                  <button
                    className={`dropzone ${imageUrl ? 'compact' : ''} ${dragging ? 'dragging' : ''}`}
                    onClick={() => fileInput.current?.click()}
                    disabled={exporting}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (!exporting) upload(e.dataTransfer.files[0]);
                    }}
                    aria-label={imageUrl ? 'Replace artwork' : 'Upload image'}
                  >
                    <span className="upload-icon">
                      {busy ? (
                        <Loader2 className="spin" size={20} />
                      ) : (
                        <Upload size={20} />
                      )}
                    </span>
                    <strong>
                      {busy
                        ? 'Preparing artwork…'
                        : imageUrl
                          ? 'Replace artwork'
                          : 'Upload image'}
                    </strong>
                    {!imageUrl && (
                      <small>Choose an image or drag it here</small>
                    )}
                  </button>
                  <p className="file-hint">PNG, JPG or WebP · up to 10 MB</p>
                </TabsContent>
              </Tabs>
              {art && design && (
                <InlayReview
                  design={design}
                  model={model}
                  baseColor={baseColor}
                  onColor={(n) => {
                    setBaseColor(n);
                    setSaved(false);
                  }}
                />
              )}
              {(busy || pending) && (
                <output className="art-info">
                  Preparing printable geometry…
                </output>
              )}
              {(error || geometryError) && (
                <p className="error" role="alert">
                  {error || geometryError}
                </p>
              )}
            </section>
          </aside>
          <div className="preview-column">
            <section
              ref={previewRef}
              className="glass preview"
              aria-label="Live case preview"
            >
              <div className="preview-header">
                <span className="preview-label">
                  <Box size={16} /> 3D preview
                </span>
                <div className="camera-tools">
                  <button
                    className="icon-button"
                    onClick={() => setZoom((n) => n - 1)}
                    disabled={zoom <= -3}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setZoom((n) => n + 1)}
                    disabled={zoom >= 3}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setZoom(0);
                      setReset((n) => n + 1);
                    }}
                    aria-label="Reset 3D camera"
                    title="Reset view"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                {(busy || pending) && (
                  <output className="preview-status">
                    <Loader2 size={14} className="spin" /> Updating
                  </output>
                )}
              </div>
              <div className="scene-shadow" />
              <CasePreview
                model={model}
                design={design}
                baseColor={baseColor}
                view={view}
                reset={reset}
                zoom={zoom}
              />
              <div className="preview-bottom">
                <div className="preview-tools">
                  <Tabs value={view} onValueChange={(v) => setView(String(v))}>
                    <TabsList
                      className="view-switch"
                      aria-label="Preview appearance"
                    >
                      <TabsTrigger value="artwork">
                        <Layers size={14} /> Assembled
                      </TabsTrigger>
                      <TabsTrigger value="relief">
                        <Box size={14} /> Pockets
                      </TabsTrigger>
                      <TabsTrigger value="exploded">Separate</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="preview-footer">
                  <span>
                    <Move size={13} />
                    Drag to rotate
                  </span>
                  <span>{model.shortName}</span>
                </div>
              </div>
            </section>
            <section
              className="glass export-card"
              aria-labelledby="download-heading"
            >
              <div className="section-heading">
                <span className="step">3</span>
                <h2 id="download-heading">Download</h2>
              </div>
              <button
                className="export-button"
                onClick={download}
                disabled={
                  busy ||
                  pending ||
                  exporting ||
                  !design ||
                  Boolean(art && !design.inserts)
                }
              >
                {exporting ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Download size={18} />
                )}{' '}
                {exporting ? 'Preparing your STL…' : 'Download print kit'}
              </button>
              <details className="printing-notes">
                <summary>Printing guide</summary>
                <p className="guide-caption">
                  Included in your ZIP. Use flexible TPU for the case.
                  {art && ' Print and glue the inserts separately.'}
                </p>
                {printingNotes(model, art ? 'inlay' : 'plain').map(
                  ({ title, paragraphs }) => (
                    <section key={title}>
                      <h4>{title}</h4>
                      {paragraphs.map((paragraph, index) => (
                        <p key={index}>
                          {paragraph.map((part, partIndex) =>
                            typeof part === 'string' ? (
                              part
                            ) : (
                              <strong key={partIndex}>{part.strong}</strong>
                            ),
                          )}
                        </p>
                      ))}
                    </section>
                  ),
                )}
              </details>
              {saved && (
                <output className="success">
                  Print kit downloaded. Unzip it and open the STLs in your
                  slicer using millimetres.
                </output>
              )}
            </section>
          </div>
        </div>
      </main>
      <footer>
        <span>Kasseus</span>
        <span>An independent project. Not affiliated with Amazon.</span>
      </footer>
    </div>
  );
}
