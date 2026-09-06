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
  Check,
  ShieldCheck,
  Layers,
  Sparkles,
  Tablet,
  X,
  Loader2,
  Info,
  Leaf,
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
import { readArtwork, CASE, type Artwork } from '@/lib/case-geometry';
import { useInlay } from '@/hooks/use-inlay';
import { exportInlay } from '@/lib/inlay-export';
import { InlayReview } from '@/components/inlay-review';
export default function Home() {
  const [model, setModel] = useState(supportedModel);
  const [art, setArt] = useState<Artwork>();
  const [baseColor, setBaseColor] = useState(1);
  const {
    design,
    pending,
    error: geometryError,
  } = useInlay(art, baseColor, model);
  const [imageUrl, setImageUrl] = useState('/ginkgo.png');
  const [filename, setFilename] = useState('Ginkgo · studio artwork');
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState('artwork');
  const [reset, setReset] = useState(0);
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
          kasseus<span>STUDIO</span>
        </Link>
        <div className="top-actions">
          <button className="quiet-button" onClick={() => setModal('how')}>
            How it works <ArrowUpRight size={15} />
          </button>
          <span className="pill">
            <i />
            Made for your next chapter
          </span>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">
              <Sparkles size={14} /> THE KINDLE CASE STUDIO
            </p>
            <h1>
              A case of <em>your own.</em>
            </h1>
            <p className="intro-copy">
              Your Kindle. Your artwork. Something only you could make.
            </p>
          </div>
          <span className="intro-note">
            From a little idea to a tangible thing.
          </span>
        </div>
        <div className="workspace">
          <aside className="controls" aria-label="Case designer controls">
            <section className="glass control-card">
              <div className="section-heading">
                <span className="step">1</span>
                <h2>Meet your Kindle</h2>
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
                All Kindle models & dimensions <ArrowUpRight />
              </button>
            </section>
            <section className="glass control-card">
              <div className="section-heading">
                <span className="step">2</span>
                <h2>Make it personal</h2>
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
              <button
                className={`dropzone ${dragging ? 'dragging' : ''}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  upload(e.dataTransfer.files[0]);
                }}
                aria-label="Upload artwork. PNG, JPG or WebP, up to 10 MB."
              >
                <span className="upload-icon">
                  {busy ? (
                    <Loader2 className="spin" size={20} />
                  ) : (
                    <Upload size={20} />
                  )}
                </span>
                <strong>
                  {busy ? 'Preparing your artwork…' : 'Drop in a little you'}
                </strong>
                <small>Choose an image or drag it here</small>
                <small>PNG, JPG, WebP · up to 10 MB</small>
              </button>
              {imageUrl && (
                <div className="art-file">
                  <Image
                    src={imageUrl}
                    alt="Selected case artwork"
                    width={37}
                    height={43}
                    unoptimized
                  />
                  <div>
                    <p>{filename}</p>
                    <small>
                      <Check
                        size={11}
                        style={{ display: 'inline', marginRight: 4 }}
                      />
                      {busy
                        ? 'Preparing artwork…'
                        : art
                          ? 'Cropped to your back panel'
                          : 'Artwork unavailable'}
                    </small>
                  </div>
                  <button onClick={remove} aria-label="Remove artwork">
                    <X size={16} />
                  </button>
                </div>
              )}
              <p className="art-info">
                Broad shapes work best. Your image becomes two colors, with
                recessed pockets and matching glue-in inserts.
              </p>
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
            <section className="glass export-card">
              <div className="export-title">
                <span>Ready for the real world</span>
                <span>STL KIT</span>
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
                <ArrowUpRight size={16} />
              </button>
              <p className="export-caption">
                <Box size={12} /> Case + inserts · separate STLs in a ZIP
              </p>
              {saved && (
                <output className="success">
                  Print kit downloaded. Unzip it and open the STLs in your
                  slicer using millimetres.
                </output>
              )}
            </section>
          </aside>
          <section className="glass preview" aria-label="Live case preview">
            <div className="preview-header">
              <span className="preview-label">
                <Box size={15} /> YOUR CASE, IN 3D
              </span>
              <span className="pill">
                <i />
                {busy || pending ? 'Updating' : 'Live preview'}
              </span>
            </div>
            <div className="scene-shadow" />
            <CasePreview
              model={model}
              design={design}
              baseColor={baseColor}
              view={view}
              reset={reset}
            />
            <span className="preview-name">The everyday back case.</span>
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
                <button
                  className="icon-button"
                  onClick={() => setReset((n) => n + 1)}
                  aria-label="Reset 3D camera"
                  title="Reset view"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div className="preview-footer">
                <span>
                  <Move size={13} />
                  Drag to rotate · scroll to zoom
                </span>
                <span>
                  <Check size={13} />
                  {model.shortName}
                </span>
              </div>
            </div>
          </section>
        </div>
        <div className="underbar">
          <span>
            <ShieldCheck size={15} />
            Your images stay in your browser.
          </span>
          <button
            className="quiet-button"
            style={{ fontSize: 12, padding: 0 }}
            onClick={() => setModal('print')}
          >
            <Info size={14} /> A few notes before you print{' '}
            <ArrowUpRight size={13} />
          </button>
          <span>
            <Leaf size={15} />
            Made by you. Kept for chapters.
          </span>
        </div>
      </main>
      <footer>
        <span>kasseus — small objects, personal stories.</span>
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
            {modal === 'models'
              ? 'Find your Kindle.'
              : modal === 'print'
                ? 'From screen to something real.'
                : 'Three small steps.'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'models'
              ? 'Kindle e-reader dimensions, in height × width × maximum depth.'
              : modal === 'print'
                ? `A simple prototype back shell for ${model.name}, ${model.generation}.`
                : 'A personal back case, without the complicated settings.'}
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
            ) : modal === 'print' ? (
              <>
                <h3>A starting point for your first print</h3>
                <p>
                  Export at 100% scale in millimetres. The case has a{' '}
                  {CASE.base} mm back, {CASE.wall} mm walls, {CASE.clearance} mm
                  clearance per side and a small retaining lip. Pockets are 0.8
                  mm deep. Inserts are 0.6 mm thick, with 0.2 mm side clearance
                  and 0.05 mm for adhesive. Their faces sit 0.15 mm below the
                  case surface.
                </p>
                <p>
                  Use flexible TPU for fitting around the lip. Rigid materials
                  may not flex enough to install. Print inserts flat. Inspect
                  case orientation, bridging and supports in your slicer; pocket
                  ceilings may need support.
                </p>
                <h3>Artwork becomes shape</h3>
                <p>
                  STL does not store color. Print the case and inserts using two
                  chosen filaments, then glue the inserts into their matching
                  pockets. These are glue-in parts, not locking or tested
                  press-fit pieces. Test adhesive compatibility first. Images
                  are cropped and simplified to two colors; tiny details are
                  removed and highlighted in orange.
                </p>
                <h3>Check the fit</h3>
                <p>
                  This is an untested physical prototype based on published
                  outer dimensions. Corner curvature, retention and printer
                  tolerances need a test print before a final case. The lower
                  edge is open for {model.port} and power-button access.
                </p>
              </>
            ) : (
              <>
                <h3>01 · Choose your Kindle</h3>
                <p>
                  Choose your model from the selector. Find your device details
                  in Settings → Device Options → Device Info.
                </p>
                <h3>02 · Add something personal</h3>
                <p>
                  Upload a simple two-color pattern. It stays on your device and
                  becomes recessed pockets with matching inserts. Choose your
                  case color and inspect the simplified pattern. Remove the
                  artwork for a clean, plain shell.
                </p>
                <h3>03 · Make it yours</h3>
                <p>
                  Rotate the assembled case, inspect the pockets and separated
                  inserts, then download your print kit. Import the STLs into
                  your slicer in millimetres. See the printing notes for
                  material and fit guidance.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
