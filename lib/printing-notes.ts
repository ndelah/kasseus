import { CASE, CASE_EDGES } from './case-geometry';
import {
  caseClearance,
  caseOpenEdges,
  caseRetainingLip,
  type CaseProfile,
} from './case-profile';

export type PrintKind = 'plain' | 'inlay' | 'sculpted';
type PrintParagraph = (string | { strong: string })[];

function note(title: string, ...paragraphs: PrintParagraph[]) {
  return {
    title,
    paragraphs,
    body: paragraphs
      .map((paragraph) =>
        paragraph
          .map((part) => (typeof part === 'string' ? part : part.strong))
          .join(''),
      )
      .join(' '),
  };
}

/** Shared by the website and every downloadable print kit. */
export function printingNotes(model: CaseProfile, kind: PrintKind) {
  const notes = [
    note(
      'Material and scale',
      [
        'Import the STL in ',
        { strong: 'millimetres at 100% scale' },
        '. Use ',
        { strong: 'flexible TPU' },
        ' and the settings recommended for your printer, filament and build plate.',
      ],
      [
        'Rigid materials may not flex enough to fit around the retaining lip. STL does not store colour; choose your filament colour yourself.',
      ],
    ),
    note(
      'Orientation and supports',
      ...(kind === 'plain'
        ? [
            [
              'Place the ',
              { strong: 'flat outside back on the bed' },
              ', with the ',
              { strong: 'cavity facing up' },
              '. Check the layer preview and retaining lip before printing.',
            ],
          ]
        : kind === 'inlay'
          ? [
              [{ strong: 'Print the inserts flat.' }],
              [
                'Inspect the case ',
                { strong: 'orientation, bridging and supports' },
                ' in your slicer: the recessed artwork can create unsupported pocket ceilings when the back faces the bed. Use the assembled preview as your placement guide.',
              ],
            ]
          : [
              ['The sculpted back is uneven and rises up to 0.9 mm.'],
              [
                'Inspect ',
                { strong: 'orientation, bridging and supports' },
                ' in your slicer; the textured face may need to point up. The plain shell’s support-free reference slice does not apply to this texture.',
              ],
            ]),
    ),
    note(
      'Shell and fit',
      [
        `The base is ${CASE.base} mm thick, with nominal ${CASE.wall} mm walls and ${caseClearance(model)} mm clearance per side. Walls can be thicker around the inner rear contour. Open edges: ${caseOpenEdges(model).join(', ')}. These broad openings preserve controls and ${model.port} access without assuming precise port offsets.`,
      ],
      [
        'This is an untested physical prototype: ',
        { strong: 'print a fit test before a final case' },
        '. Mesh checks do not guarantee fit or surface quality.',
      ],
    ),
  ];
  notes.splice(
    2,
    0,
    note(
      'Printable shell',
      [
        `Vertical exterior walls, smooth plan-view corners, a ${CASE_EDGES.bedChamfer} mm 45° bed-facing chamfer and a ${CASE_EDGES.rimRadius} mm rounded upper rim. Rear contours affect the cavity only. Open edges have no retaining hooks.`,
      ],
      [
        `Retaining lip: ${caseRetainingLip(model)} mm per side. This lip is intended for flexible TPU; use a physical fit test.`,
      ],
    ),
    note(
      'Device fit',
      [
        `Device envelope: ${model.height} × ${model.width} × ${model.depth} mm (height × width × maximum thickness). ${model.template === 'envelope-tray' ? 'This is an envelope tray: the asymmetric back is not reproduced, there is no snap lip, and a measured insert or padding may be needed for support and retention.' : model.backSections ? 'The scan-informed inner rear contour is preserved.' : `The ${model.cornerRadius} mm corner radius is a conservative estimate; the rear contour has not been measured.`}`,
      ],
      [
        model.measurements?.evidence === 'reference'
          ? 'Dimensions are reference values; confirm them with calipers before printing a final case.'
          : 'Published dimensions do not certify physical fit.',
      ],
      ...(model.backOpenings?.length
        ? [
            [
              `Rear access windows: ${model.backOpenings.map((o) => o.label).join('; ')}. Their placement is estimated and needs checking against the device.`,
            ],
          ]
        : []),
    ),
  );
  if (model.id === 'paperwhite-2018') {
    if (kind === 'plain')
      notes.push(
        note(
          'Earlier Paperwhite 10 reference slice',
          [
            'An earlier plain Paperwhite 10 shell sliced into 56 layers without supports in Bambu Studio using a Bambu P1S reference profile, Generic TPU, a 0.4 mm nozzle, 0.20 mm layers, four walls and 20% infill.',
          ],
          ['Estimated use: ', { strong: '57 g and 4 h 9 min' }, '.'],
          [
            'The reference profile flagged a bed-temperature warning; ',
            {
              strong: 'choose temperatures for your actual filament and plate',
            },
            '. This is not a validated printer preset or a completed physical print.',
          ],
        ),
      );
  }
  if (kind === 'inlay')
    notes.push(
      note(
        'Assemble the inlays',
        [
          'Pockets are 0.8 mm deep, leaving 1.6 mm of backing. Inserts are 0.6 mm thick, with 0.2 mm side clearance and 0.05 mm glue allowance. Their faces sit 0.15 mm below the case surface.',
        ],
        [
          'These are ',
          { strong: 'glue-in pieces' },
          ', not tested press-fit parts. ',
          { strong: 'Test the fit and adhesive compatibility first.' },
        ],
      ),
    );
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
