import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { models, supportedModels } from '../lib/models';
import { parseCaseProfile } from '../lib/case-profile';
import { generateCase } from '../lib/case-generator';

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: 'string', multiple: true },
      profile: { type: 'string' },
      all: { type: 'boolean' },
      list: { type: 'boolean' },
      'out-dir': { type: 'string', default: 'outputs/cases' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`Generate validated prototype Kindle back cases (plain binary STL, mm).

npm run case:generate -- --list
npm run case:generate -- --model paperwhite-2018
npm run case:generate -- --all --out-dir outputs/cases
npm run case:generate -- --profile path/to/profile.json

Repeat --model to generate a subset. --all uses every registered case profile.
Each model gets an STL, JSON validation report, and printing notes.
Custom profiles use the same schema as entries in lib/case-profiles.json.
Only rounded-back-open-bottom bodies are implemented; other body shapes need a new template.
Files at the same output path are replaced on a repeat run. Fit requires a physical test.`);
    return;
  }
  const modes = [
    Boolean(values.model?.length),
    Boolean(values.profile),
    Boolean(values.all),
    Boolean(values.list),
  ].filter(Boolean).length;
  if (modes !== 1)
    throw new Error(
      'Choose one of --model, --profile, --all or --list. Use --help for examples.',
    );
  if (values.list) {
    for (const model of models)
      console.log(
        `${model.id.padEnd(22)} ${model.enabled ? 'prototype ready' : 'profile needed '}  ${model.name} ${model.generation}`,
      );
    return;
  }
  const selected = values.profile
    ? [
        parseCaseProfile(
          JSON.parse(await readFile(resolve(values.profile), 'utf8')),
        ),
      ]
    : values.all
      ? supportedModels
      : [...new Set(values.model)].map((id) => {
          const model = supportedModels.find((m) => m.id === id);
          if (!model)
            throw new Error(
              `No case profile for '${id}'. Use --list, or supply a sourced --profile JSON. Catalog dimensions alone do not define a case.`,
            );
          return model;
        });
  // Generate and validate the entire selection before writing any output.
  const generated = selected.map(generateCase);
  for (const result of generated) {
    const { profile } = result.report;
    const directory = resolve(values['out-dir']!, profile.id);
    await mkdir(directory, { recursive: true });
    const path = join(directory, result.filename);
    const sha256 = createHash('sha256').update(result.stl).digest('hex');
    await writeFile(path, result.stl);
    await writeFile(
      join(directory, 'report.json'),
      JSON.stringify(
        {
          ...result.report,
          stl: {
            filename: result.filename,
            bytes: result.stl.byteLength,
            sha256,
          },
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      join(directory, 'PRINT-NOTES.txt'),
      `${profile.name} — ${profile.generation}
Device: ${profile.height} × ${profile.width} × ${profile.depth} mm (height × width × depth).
Source: ${profile.source}

${profile.notes}

This is an untested physical prototype. Use flexible TPU and print a fit test.
Import ${result.filename} in millimetres at 100% scale. STL does not encode units.
This plain shell has no artwork or inserts. The open side faces +Z; the flat outside back is at Z=0.
Start with the flat back on the bed and inspect the retaining lip/overhangs in your slicer.
Exterior: ${result.report.shell.exterior}.
Backing ${result.report.shell.backing} mm; walls ${result.report.shell.wall} mm; clearance ${result.report.shell.clearancePerSide} mm per side.
Lower edge (-Y) is open for ${profile.port} and bottom power-button access.
Corner radius ${profile.cornerRadius} mm. ${profile.backSections ? 'Scan-informed inner rear taper; depths normalized to published thickness and final outline held for clearance.' : 'Corner radius is a prototype assumption; no measured rear taper available.'} Physical fit needs testing.

Passed: binary STL structure, dimensions, connected shell, paired edges, winding,
nondegenerate triangles, positive volume and lower-edge opening.
These checks do not certify fit or exclude every possible surface intersection.
SHA-256: ${sha256}
`,
    );
    console.log(
      `${profile.id}: ${path}\n  ${result.report.validation.triangles} triangles; closed shell; ${result.stl.byteLength} bytes; physical fit untested`,
    );
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
