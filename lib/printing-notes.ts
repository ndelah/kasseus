import { CASE, PAPERWHITE_10_EDGES } from './case-geometry';
import type { CaseProfile } from './case-profile';

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
        `The base is ${CASE.base} mm thick, with nominal ${CASE.wall} mm walls and ${CASE.clearance} mm clearance per side. Walls can be thicker around the inner rear contour. The lower edge stays open for ${model.port} and power-button access.`,
      ],
      [
        'This is an untested physical prototype: ',
        { strong: 'print a fit test before a final case' },
        '. Mesh checks do not guarantee fit or surface quality.',
      ],
    ),
  ];
  if (model.id === 'paperwhite-2018') {
    notes.splice(
      2,
      0,
      note(
        'Paperwhite 10 · soft edges',
        [
          `Straight exterior walls replace the deep rear taper. Smooth rounded corners meet a ${PAPERWHITE_10_EDGES.bedChamfer} mm, 45° bed-facing chamfer and a ${PAPERWHITE_10_EDGES.rimRadius} mm rounded upper rim. The inner device contour is preserved.`,
        ],
        [
          { strong: 'Both ends remain open' },
          '; the low access rims have no retaining hooks.',
        ],
      ),
    );
    if (kind === 'plain')
      notes.push(
        note(
          'Reference slice · a starting point',
          [
            'The plain shell sliced into 56 layers without supports in Bambu Studio using a Bambu P1S reference profile, Generic TPU, a 0.4 mm nozzle, 0.20 mm layers, four walls and 20% infill.',
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
