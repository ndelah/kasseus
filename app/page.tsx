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
import { models, catalogSource, supportedSource } from '@/lib/models';
import {
  createCaseGeometry,
  exportCaseSTL,
  readArtwork,
  type Artwork,
} from '@/lib/case-geometry';
export default function Home() {
  const [art, setArt] = useState<Artwork>();
  const [imageUrl, setImageUrl] = useState('');
  const [filename, setFilename] = useState('');
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
  const activeUrl = useRef('');
  useEffect(() => {
    const urls = activeUrl;
    const n = ++request.current;
    readArtwork('/ginkgo.png')
      .then((data) => {
        if (n === request.current) {
          setArt(data);
          setImageUrl('/ginkgo.png');
          setFilename('Ginkgo · studio artwork');
        }
      })
      .catch(() => {
        if (n === request.current)
          setError(
            'Sample artwork could not load. Upload your own image or export a plain case.',
          );
      })
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
    return () => {
      request.current++;
      if (urls.current) URL.revokeObjectURL(urls.current);
    };
  }, []);
  async function upload(file?: File) {
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
    const n = ++request.current;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const data = await readArtwork(url);
      if (n !== request.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
      activeUrl.current = url;
      setArt(data);
      setImageUrl(url);
      setFilename(file.name);
      setView('artwork');
    } catch (e) {
      URL.revokeObjectURL(url);
      if (n === request.current)
        setError(
          e instanceof Error
            ? e.message
            : 'This image could not be opened. Try a different file.',
        );
    } finally {
      if (n === request.current) setBusy(false);
    }
  }
  function remove() {
    request.current++;
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = '';
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
      const geometry = createCaseGeometry(art);
      try {
        const bytes = exportCaseSTL(geometry);
        const blob = new Blob([new Uint8Array(bytes.buffer as ArrayBuffer)], {
          type: 'model/stl',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kasseus-paperwhite-11-${art ? 'relief' : 'plain'}-mm.stl`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setSaved(true);
      } finally {
        geometry.dispose();
      }
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
              <Select value="paperwhite-2021">
                <SelectTrigger
                  className="model-select"
                  aria-label="Kindle model"
                >
                  <span className="model-option">
                    <Tablet size={26} />
                    <span>
                      <strong>Kindle Paperwhite</strong>
                      <small>11th generation · 2021</small>
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent
                  className="model-menu"
                  alignItemWithTrigger={false}
                >
                  {models.map((m) => (
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
                <span>174.2 × 124.6 × 8.1 mm</span>
                <span>6.8″ display</span>
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
                  void upload(e.target.files?.[0]);
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
                  void upload(e.dataTransfer.files[0]);
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
                      Applied to your case
                    </small>
                  </div>
                  <button onClick={remove} aria-label="Remove artwork">
                    <X size={16} />
                  </button>
                </div>
              )}
              <p className="art-info">
                Your image becomes a subtle raised texture. Simple,
                high-contrast artwork prints beautifully.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="glass export-card">
              <div className="export-title">
                <span>Ready for the real world</span>
                <span>.STL</span>
              </div>
              <button
                className="export-button"
                onClick={download}
                disabled={busy || exporting}
              >
                {exporting ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Download size={18} />
                )}{' '}
                {exporting ? 'Preparing your STL…' : 'Download your case'}
                <ArrowUpRight size={16} />
              </button>
              <p className="export-caption">
                <Box size={12} /> One piece. Made to print.
              </p>
              {saved && (
                <output className="success">
                  STL downloaded. Open it in your slicer using millimetres.
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
                {busy ? 'Updating' : 'Live preview'}
              </span>
            </div>
            <div className="scene-shadow" />
            <CasePreview art={art} view={view} reset={reset} />
            <span className="preview-name">The everyday back case.</span>
            <div className="preview-bottom">
              <div className="preview-tools">
                <Tabs value={view} onValueChange={(v) => setView(String(v))}>
                  <TabsList
                    className="view-switch"
                    aria-label="Preview appearance"
                  >
                    <TabsTrigger value="artwork">
                      <Layers size={14} /> Artwork
                    </TabsTrigger>
                    <TabsTrigger value="relief">
                      <Box size={14} /> Print preview
                    </TabsTrigger>
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
                  Paperwhite · 11th gen
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
                ? 'A simple prototype back shell for the 2021 Paperwhite.'
                : 'A personal back case, without the complicated settings.'}
          </DialogDescription>
          <div className="modal-body">
            {modal === 'models' ? (
              <>
                <p>
                  Only Paperwhite 11th generation (2021) is enabled in v1. Other
                  models are listed for reference. Kids, storage and
                  connectivity bundles use their corresponding device body; Fire
                  tablets are excluded.
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
                  <a href={supportedSource} target="_blank" rel="noreferrer">
                    Amazon Paperwhite specifications
                  </a>{' '}
                  and{' '}
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
                  Export at 100% scale in millimetres. The case has a 1.8 mm
                  back, 1.6 mm walls, 0.35 mm clearance per side and a small
                  retaining lip. Artwork adds up to 0.65 mm of relief.
                </p>
                <p>
                  Use flexible TPU for fitting around the lip. Rigid materials
                  may not flex enough to install. Orient the artwork upward and
                  review supports beneath the cavity in your slicer.
                </p>
                <h3>Artwork becomes shape</h3>
                <p>
                  STL does not store color. Darker image areas are raised; the
                  Print preview shows the monochrome result. Images are
                  automatically cropped to fill the back panel. The Artwork view
                  is a color reference.
                </p>
                <h3>Check the fit</h3>
                <p>
                  This is an untested physical prototype based on published
                  outer dimensions. Corner curvature, retention and printer
                  tolerances need a test print before a final case. The lower
                  edge is open for USB-C and power-button access.
                </p>
              </>
            ) : (
              <>
                <h3>01 · Choose your Kindle</h3>
                <p>
                  Start with the 6.8-inch Kindle Paperwhite, 11th generation
                  (2021). Find your generation in Settings → Device Options →
                  Device Info.
                </p>
                <h3>02 · Add something personal</h3>
                <p>
                  Upload a photo, illustration or pattern. It stays on your
                  device and becomes a shallow relief on the back. Remove the
                  artwork for a clean, plain shell.
                </p>
                <h3>03 · Make it yours</h3>
                <p>
                  Rotate the 3D case, inspect the Print preview and download
                  your STL. Import it into your slicer in millimetres. See the
                  printing notes for material and fit guidance.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
