'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  ArrowUpRight,
  Upload,
  Download,
  RotateCcw,
  Move,
  ShieldCheck,
  Layers,
  Tablet,
  X,
  Loader2,
  Info,
  Plus,
  Minus,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CasePreview from '@/components/case-preview';
import {
  models,
  catalogSource,
  supportedModel,
  supportedModels,
} from '@/lib/models';
import { readArtwork, type Artwork } from '@/lib/case-geometry';
import { useInlay } from '@/hooks/use-inlay';
import { exportInlay } from '@/lib/inlay-export';
import { printingNotes } from '@/lib/printing-notes';
import { InlayReview } from '@/components/inlay-review';

/** Studio sample shown until the user uploads their own artwork. */
const STUDIO_SAMPLE = {
  url: '/studio-sample.svg',
  name: 'Sample design',
} as const;

export default function Home() {
  const [model, setModel] = useState(supportedModel);
  const [art, setArt] = useState<Artwork>();
  const [baseColor, setBaseColor] = useState(0);
  const {
    design,
    pending,
    error: geometryError,
  } = useInlay(art, baseColor, model);
  const [imageUrl, setImageUrl] = useState<string>(STUDIO_SAMPLE.url);
  const [filename, setFilename] = useState<string>(STUDIO_SAMPLE.name);
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState('artwork');
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [modal, setModal] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
    setBaseColor(0);
    setView('artwork');
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
        <div className="top-actions">
          <button className="quiet-button" onClick={() => setModal('how')}>
            How it works <ArrowUpRight size={15} />
          </button>
        </div>
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
                          <small>
                            {m.generation} {!m.enabled && '· Coming later'}
                          </small>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="model-help">
                Find your model in Settings → Device Options → Device Info.
              </p>
              <details className="model-details">
                <summary>Model details</summary>
                <div className="dimensions">
                  <span>
                    {model.height} × {model.width} × {model.depth} mm
                  </span>
                  <span>{model.display}″ display</span>
                </div>
                <button
                  className="quiet-button catalog-link"
                  onClick={() => setModal('models')}
                >
                  Compare Kindle models <ArrowUpRight />
                </button>
              </details>
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
              {imageUrl && (
                <div className="art-file">
                  <Image
                    src={imageUrl}
                    alt={
                      imageUrl === STUDIO_SAMPLE.url
                        ? 'Sample case artwork'
                        : 'Selected case artwork'
                    }
                    width={40}
                    height={48}
                    unoptimized
                  />
                  <div>
                    <p>{filename}</p>
                    <small>
                      {imageUrl === STUDIO_SAMPLE.url
                        ? 'Replace with your own image, or remove for a plain case.'
                        : 'Centered on the back panel'}
                    </small>
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
                {!imageUrl && <small>Choose an image or drag it here</small>}
              </button>
              <p className="file-hint">PNG, JPG or WebP · up to 10 MB</p>
              <p className="privacy-note">
                <ShieldCheck size={14} /> Your images stay in your browser.
              </p>
              {!imageUrl && (
                <p className="art-info">
                  Your case will print without artwork.
                </p>
              )}
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
            <section className="glass preview" aria-label="Live case preview">
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
              <p className="export-caption">
                {art ? 'Case + glue-in inserts' : 'Plain case'} · STL files in a
                ZIP
              </p>
              <p className="prototype-note">
                <Info size={15} />
                <span>
                  Untested physical prototype. Print a fit test before making
                  your final case.
                </span>
              </p>
              <details className="printing-notes">
                <summary>Printing guide</summary>
                <p className="guide-caption">
                  Included in your ZIP. Use flexible TPU for the case.
                  {art && ' Print and glue the inserts separately.'}
                </p>
                {printingNotes(model, art ? 'inlay' : 'plain').map(
                  ({ title, body }) => (
                    <section key={title}>
                      <h4>{title}</h4>
                      <p>{body}</p>
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
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="modal">
          <DialogTitle>
            {modal === 'models' ? 'Kindle models' : 'How it works'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'models'
              ? 'Kindle e-reader dimensions, in height × width × maximum depth.'
              : 'Design a back case to 3D print and assemble yourself.'}
          </DialogDescription>
          <div className="modal-body">
            {modal === 'models' ? (
              <>
                <p>
                  {supportedModels
                    .map((m) => `${m.name} ${m.generation}`)
                    .join('; ')}{' '}
                  are available. Other models are listed for reference. Kids,
                  storage and connectivity bundles use their corresponding
                  device body; Fire tablets are excluded.
                </p>
                {models.map((m) => (
                  <div
                    key={m.id}
                    className={`catalog-row ${m.enabled ? 'active' : ''}`}
                  >
                    <div>
                      {m.name}
                      <small>
                        {m.generation} ·{' '}
                        {m.enabled ? 'Available' : 'Not supported yet'}
                      </small>
                    </div>
                    <code>
                      {m.height} × {m.width} × {m.depth}
                    </code>
                  </div>
                ))}
                <p>
                  Sources:{' '}
                  {supportedModels.map((m) => (
                    <span key={m.id}>
                      <a href={m.source} target="_blank" rel="noreferrer">
                        Amazon {m.shortName} specifications
                      </a>
                      {' · '}
                    </span>
                  ))}
                  <a href={catalogSource} target="_blank" rel="noreferrer">
                    Kindle model catalog
                  </a>
                  . Checked September 2026. Rounded catalog dimensions are
                  reference values, not manufacturing drawings.
                </p>
              </>
            ) : (
              <>
                <h3>01 · Choose your Kindle</h3>
                <p>
                  Choose your model from the selector. Find your device details
                  in Settings → Device Options → Device Info.
                </p>
                <h3>02 · Add artwork</h3>
                <p>
                  Upload a picture. It stays on your device and is centered on
                  the back panel, with flat-color pockets and glue-in inserts.
                  Remove the artwork for a clean, plain shell.
                </p>
                <h3>03 · Download and print</h3>
                <p>
                  Rotate the case in 3D, then download your print kit. Import
                  the STLs into your slicer in millimetres. See the printing
                  notes for material and fit guidance.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
