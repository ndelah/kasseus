import { CASE, PAPERWHITE_10_EDGES } from './case-geometry';
import type { CaseProfile } from './case-profile';

export type PrintKind = 'plain' | 'inlay' | 'sculpted';

/** Shared by the website and every downloadable print kit. */
export function printingNotes(model: CaseProfile, kind: PrintKind) {
  const notes = [
    {
      title: 'Material and scale',
      body: 'Import the STL in millimetres at 100% scale. Use flexible TPU and the settings recommended for your printer, filament and build plate. Rigid materials may not flex enough to fit around the retaining lip. STL does not store colour; choose your filament colour yourself.',
    },
    {
      title: 'Orientation and supports',
      body:
        kind === 'plain'
          ? 'Place the flat outside back on the bed, with the cavity facing up. Check the layer preview and retaining lip before printing.'
          : kind === 'inlay'
            ? 'Print the inserts flat. Inspect the case orientation, bridging and supports in your slicer: the recessed artwork can create unsupported pocket ceilings when the back faces the bed. Use the assembled preview as your placement guide.'
            : 'The sculpted back is uneven and rises up to 0.9 mm. Inspect orientation, bridging and supports in your slicer; the textured face may need to point up. The plain shell’s support-free reference slice does not apply to this texture.',
    },
    {
      title: 'Shell and fit',
      body: `The base is ${CASE.base} mm thick, with nominal ${CASE.wall} mm walls and ${CASE.clearance} mm clearance per side. Walls can be thicker around the inner rear contour. The lower edge stays open for ${model.port} and power-button access. This is an untested physical prototype: print a fit test before a final case. Mesh checks do not guarantee fit or surface quality.`,
    },
  ];
  if (model.id === 'paperwhite-2018') {
    notes.splice(2, 0, {
      title: 'Paperwhite 10 · soft edges',
      body: `Straight exterior walls replace the deep rear taper. Smooth rounded corners meet a ${PAPERWHITE_10_EDGES.bedChamfer} mm, 45° bed-facing chamfer and a ${PAPERWHITE_10_EDGES.rimRadius} mm rounded upper rim. The inner device contour is preserved. Both ends remain open; the low access rims have no retaining hooks.`,
    });
    if (kind === 'plain')
      notes.push({
        title: 'Reference slice · a starting point',
        body: 'The plain shell sliced into 56 layers without supports in Bambu Studio using a Bambu P1S reference profile, Generic TPU, a 0.4 mm nozzle, 0.20 mm layers, four walls and 20% infill. Estimated use: 57 g and 4 h 9 min. The reference profile flagged a bed-temperature warning; choose temperatures for your actual filament and plate. This is not a validated printer preset or a completed physical print.',
      });
  }
  if (kind === 'inlay')
    notes.push({
      title: 'Assemble the inlays',
      body: 'Pockets are 0.8 mm deep, leaving 1.6 mm of backing. Inserts are 0.6 mm thick, with 0.2 mm side clearance and 0.05 mm glue allowance. Their faces sit 0.15 mm below the case surface. These are glue-in pieces, not tested press-fit parts. Test the fit and adhesive compatibility first.',
    });
  return notes;
}

export function printingNotesText(model: CaseProfile, kind: PrintKind) {
  return (
    `KASSEUS — ${model.name}, ${model.generation}\nPrinting notes · ${kind}\n\n` +
    printingNotes(model, kind)
      .map(({ title, body }) => `${title}\n${body}`)
      .join('\n\n') +
    '\n'
  );
}
