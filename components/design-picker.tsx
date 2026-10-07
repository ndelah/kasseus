'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { premadeDesigns, type PremadeDesign } from '@/lib/premade-designs';

function DesignCard({
  preset,
  modelId,
  selected,
  disabled,
  onSelect,
}: {
  preset: PremadeDesign;
  modelId: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const preview = preset.previews[modelId] ?? Object.values(preset.previews)[0];
  return (
    <button
      className="design-card"
      type="button"
      aria-label={`Use ${preset.name} design`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="design-thumbnail">
        <Image src={preview.url} alt="" width={180} height={250} unoptimized />
        {selected && <Check className="design-selected" size={16} />}
      </span>
      <strong>{preset.name}</strong>
      <span className="design-swatches" aria-hidden="true">
        {preview.colors.map((color) => (
          <span key={color} style={{ background: color }} />
        ))}
      </span>
    </button>
  );
}

export function DesignPicker({
  modelId,
  selectedId,
  disabled,
  onSelect,
  onPreview,
}: {
  modelId: string;
  selectedId?: string;
  disabled: boolean;
  onSelect: (preset: PremadeDesign) => void;
  onPreview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = useRef(false);
  const card = (preset: PremadeDesign, fromGallery = false) => (
    <DesignCard
      key={preset.id}
      preset={preset}
      modelId={modelId}
      selected={selectedId === preset.id}
      disabled={disabled}
      onSelect={() => {
        onSelect(preset);
        if (fromGallery) {
          chosen.current = true;
          setOpen(false);
        } else {
          onPreview();
        }
      }}
    />
  );
  return (
    <>
      <div className="featured-designs">
        {premadeDesigns
          .filter((preset) => preset.featured)
          .map((preset) => card(preset))}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen && chosen.current) {
            chosen.current = false;
            onPreview();
          }
        }}
      >
        <DialogTrigger className="gallery-link" disabled={disabled}>
          View all designs <ChevronRight size={16} />
        </DialogTrigger>
        <DialogContent className="design-gallery">
          <DialogTitle>Premade designs</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a design to apply it to your selected Kindle model and 3D
            preview.
          </DialogDescription>
          <div className="gallery-grid">
            {premadeDesigns.map((preset) => card(preset, true))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
