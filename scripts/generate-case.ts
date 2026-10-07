import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { models, supportedModels } from '../lib/models';
import { parseCaseProfile } from '../lib/case-profile';
import { generateCase } from '../lib/case-generator';
import { printingNotesText } from '../lib/printing-notes';
import { strToU8, zipSync, type Zippable } from 'fflate';

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
Standard rounded shells and conservative envelope trays share the printable exterior. Asymmetric trays need physical support and retention checks.
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
  const archive: Record<string, Uint8Array> = {};
  const catalogue: unknown[] = [];
  for (const result of generated) {
    const { profile } = result.report;
    const directory = resolve(values['out-dir']!, profile.id);
    await mkdir(directory, { recursive: true });
    const path = join(directory, result.filename);
    const sha256 = createHash('sha256').update(result.stl).digest('hex');
    await writeFile(path, result.stl);
    const report = {
      ...result.report,
      stl: { filename: result.filename, bytes: result.stl.byteLength, sha256 },
    };
    const reportText = JSON.stringify(report, null, 2) + '\n';
    const notes =
      printingNotesText(profile, 'plain') +
      `\nMeasurement source: ${profile.source}\n${profile.notes}\n\nGenerator: ${result.report.generator}\nSHA-256: ${sha256}\nPassed serialized mesh checks: dimensions, closed connected shell, winding, paired edges, nondegenerate faces, configured access openings and above-bed overhangs within 45 degrees.\nMesh checks do not certify physical fit or exclude every possible surface intersection.\n`;
    await writeFile(join(directory, 'report.json'), reportText);
    await writeFile(join(directory, 'PRINT-NOTES.txt'), notes);
    archive[`${profile.id}/${result.filename}`] = result.stl;
    archive[`${profile.id}/report.json`] = strToU8(reportText);
    archive[`${profile.id}/PRINT-NOTES.txt`] = strToU8(notes);
    catalogue.push({
      id: profile.id,
      name: profile.name,
      generation: profile.generation,
      dimensionsMm: {
        height: profile.height,
        width: profile.width,
        depth: profile.depth,
      },
      measurements: profile.measurements ?? null,
      source: profile.source,
      fitStatus: profile.fitStatus,
      template: profile.template,
      stl: `${profile.id}/${result.filename}`,
      sha256,
      report: `${profile.id}/report.json`,
      printNotes: `${profile.id}/PRINT-NOTES.txt`,
    });
    console.log(
      `${profile.id}: ${path}\n  ${result.report.validation.triangles} triangles; closed shell; ${result.stl.byteLength} bytes; physical fit untested`,
    );
  }
  const manifest =
    JSON.stringify(
      {
        schemaVersion: 2,
        generator: 'kasseus-case-generator-v3',
        units: 'mm',
        physicalFitValidated: false,
        models: catalogue,
      },
      null,
      2,
    ) + '\n';
  archive['catalog.json'] = strToU8(manifest);
  const output = resolve(values['out-dir']!);
  await writeFile(join(output, 'catalog.json'), manifest);
  // Fix archive timestamps so identical profiles produce an identical download.
  const zipEntries: Zippable = Object.fromEntries(
    Object.entries(archive).map(([path, bytes]) => [
      path,
      [bytes, { mtime: new Date('2026-01-01T00:00:00Z') }] as [
        Uint8Array,
        { mtime: Date },
      ],
    ]),
  );
  await writeFile(
    join(output, 'all-cases.zip'),
    zipSync(zipEntries, { level: 6 }),
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
