export type CaseEdge = 'bottom' | 'top' | 'left' | 'right';
export type BackOpening = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};
/** Dimensions are millimetres. A profile records assumptions; it does not certify fit. */
export type CaseProfile = {
  id: string;
  name: string;
  generation: string;
  width: number;
  height: number;
  depth: number;
  display: number;
  port: string;
  shortName: string;
  exportName: string;
  source: string;
  template: 'rounded-back-open-bottom' | 'envelope-tray';
  cornerRadius: number;
  openEdges?: CaseEdge[];
  /** Material retained along a straight edge near corners, before access begins. */
  accessCornerGuard?: number;
  /** Per-side cavity allowance; independent of the standard outside. */
  clearance?: number;
  /** Per-side front overlap. Zero makes an envelope tray without a snap lip. */
  retainingLip?: number;
  backOpenings?: BackOpening[];
  measurements?: {
    checkedAt: string;
    evidence: 'manufacturer' | 'reference';
    citation: string;
    controlsSource: string;
    contour: 'scan-informed' | 'estimated' | 'envelope';
  };
  /** Outlines from front (0) to rear (depth), in mm; insets are per side. */
  backSections?: {
    depth: number;
    insetX: number;
    insetY: number;
    radius: number;
  }[];
  fitStatus: 'prototype';
  notes: string;
};

export function parseCaseProfile(input: unknown): CaseProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('A case profile must be a JSON object.');
  const p = input as Record<string, unknown>;
  for (const key of [
    'id',
    'name',
    'generation',
    'port',
    'shortName',
    'exportName',
    'source',
    'notes',
  ]) {
    if (typeof p[key] !== 'string' || !p[key].trim())
      throw new Error(`Profile ${key} must be a non-empty string.`);
  }
  for (const key of ['id', 'exportName']) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(p[key])))
      throw new Error(`Profile ${key} must be a lowercase slug.`);
  }
  for (const [key, min, max] of [
    ['width', 40, 300],
    ['height', 50, 400],
    ['depth', 3, 30],
    ['display', 1, 20],
    ['cornerRadius', 1, 30],
  ] as const) {
    if (
      typeof p[key] !== 'number' ||
      !Number.isFinite(p[key]) ||
      p[key] < min ||
      p[key] > max
    )
      throw new Error(`Profile ${key} must be between ${min} and ${max}.`);
  }
  if (
    Number(p.cornerRadius) >=
    Math.min(Number(p.width), Number(p.height)) / 2 - 2
  )
    throw new Error('Corner radius is too large for the device.');
  if (p.backSections !== undefined) {
    if (!Array.isArray(p.backSections) || p.backSections.length < 2)
      throw new Error(
        'Back sections require at least front and rear outlines.',
      );
    let previousDepth = -1,
      previousX = 0,
      previousY = 0;
    for (const section of p.backSections) {
      if (!section || typeof section !== 'object')
        throw new Error('Invalid back section.');
      const { depth, insetX, insetY, radius } = section;
      if (
        ![depth, insetX, insetY, radius].every(
          (v) => typeof v === 'number' && Number.isFinite(v),
        ) ||
        depth <= previousDepth ||
        depth < 0 ||
        depth > Number(p.depth) ||
        insetX < previousX ||
        insetY < previousY ||
        radius < 1 ||
        radius >=
          Math.min(
            Number(p.width) / 2 - insetX,
            Number(p.height) / 2 - insetY,
          ) -
            2
      )
        throw new Error('Invalid back section dimensions or ordering.');
      previousDepth = depth;
      previousX = insetX;
      previousY = insetY;
    }
    const first = p.backSections[0],
      last = p.backSections.at(-1);
    if (
      first.depth !== 0 ||
      first.insetX !== 0 ||
      first.insetY !== 0 ||
      first.radius !== p.cornerRadius ||
      last.depth !== p.depth
    )
      throw new Error(
        'Back sections must span the device depth and start at its full outline.',
      );
  }
  if (
    p.template !== 'rounded-back-open-bottom' &&
    p.template !== 'envelope-tray'
  )
    throw new Error('Unsupported body template.');
  for (const [key, max] of [
    ['clearance', 2],
    ['retainingLip', 0.6],
  ] as const) {
    if (
      p[key] !== undefined &&
      (typeof p[key] !== 'number' ||
        !Number.isFinite(p[key]) ||
        p[key] < 0 ||
        p[key] > max)
    )
      throw new Error(`Invalid ${key}.`);
  }
  if (
    p.accessCornerGuard !== undefined &&
    (typeof p.accessCornerGuard !== 'number' ||
      !Number.isFinite(p.accessCornerGuard) ||
      p.accessCornerGuard < 4 ||
      p.accessCornerGuard > 30)
  )
    throw new Error('Invalid access corner guard.');
  if (
    p.openEdges !== undefined &&
    (!Array.isArray(p.openEdges) ||
      !p.openEdges.length ||
      new Set(p.openEdges).size !== p.openEdges.length ||
      p.openEdges.some(
        (edge) => !['bottom', 'top', 'left', 'right'].includes(edge),
      ))
  )
    throw new Error('Invalid open edges.');
  if (
    p.template === 'envelope-tray' &&
    (p.backSections !== undefined || p.retainingLip !== 0)
  )
    throw new Error(
      'Envelope trays require an untapered cavity and no retaining lip.',
    );
  if (p.backOpenings !== undefined) {
    if (!Array.isArray(p.backOpenings))
      throw new Error('Invalid back openings.');
    for (const opening of p.backOpenings) {
      if (!opening || typeof opening !== 'object')
        throw new Error('Invalid back opening.');
      const { x, y, width, height, label } = opening;
      if (
        ![x, y, width, height].every(
          (v) => typeof v === 'number' && Number.isFinite(v),
        ) ||
        width < 2 ||
        height < 2 ||
        typeof label !== 'string' ||
        !label.trim() ||
        Math.abs(x) + width / 2 >
          Number(p.width) / 2 - Number(p.cornerRadius) - 2 ||
        Math.abs(y) + height / 2 >
          Number(p.height) / 2 - Number(p.cornerRadius) - 2
      )
        throw new Error('Back opening must stay inside the flat cavity floor.');
    }
    for (let i = 0; i < p.backOpenings.length; i++)
      for (let j = i + 1; j < p.backOpenings.length; j++) {
        const a = p.backOpenings[i],
          b = p.backOpenings[j];
        if (
          Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 2 &&
          Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 2
        )
          throw new Error(
            'Back openings need at least 2 mm of material between them.',
          );
      }
    if (p.backOpenings.length && p.backSections !== undefined)
      throw new Error('Back openings require an untapered floor.');
  }
  if (p.measurements !== undefined) {
    const m = p.measurements as Record<string, unknown>;
    if (
      !m ||
      typeof m !== 'object' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(m.checkedAt)) ||
      !['manufacturer', 'reference'].includes(String(m.evidence)) ||
      !['scan-informed', 'estimated', 'envelope'].includes(String(m.contour)) ||
      typeof m.citation !== 'string' ||
      !m.citation.trim() ||
      !/^https?:\/\//.test(String(m.controlsSource))
    )
      throw new Error('Invalid measurement provenance.');
  }
  if (p.fitStatus !== 'prototype')
    throw new Error(
      'Generated cases must be marked as prototype until physical fit is validated.',
    );
  if (!/^https?:\/\//.test(String(p.source)))
    throw new Error('Profile source must be an HTTP(S) URL.');
  return p as CaseProfile;
}

export function caseOpenEdges(model: CaseProfile): CaseEdge[] {
  return model.openEdges ?? ['bottom'];
}

export function caseClearance(model: CaseProfile) {
  return model.clearance ?? 0.35;
}

export function caseRetainingLip(model: CaseProfile) {
  return model.retainingLip ?? 0.5;
}

/** Conservative openings span each straight edge, leaving material at its corners. */
export function isAccessOpening(model: CaseProfile, x: number, y: number) {
  const iw = model.width + 2 * caseClearance(model);
  const ih = model.height + 2 * caseClearance(model);
  const guard = Math.max(model.accessCornerGuard ?? 10, model.cornerRadius + 2);
  return caseOpenEdges(model).some((edge) => {
    if (edge === 'bottom')
      return y < -ih / 2 + 5 && Math.abs(x) < iw / 2 - guard;
    if (edge === 'top') return y > ih / 2 - 5 && Math.abs(x) < iw / 2 - guard;
    if (edge === 'left') return x < -iw / 2 + 5 && Math.abs(y) < ih / 2 - guard;
    return x > iw / 2 - 5 && Math.abs(y) < ih / 2 - guard;
  });
}

export function backOpeningOutline(
  opening: BackOpening,
): Array<[number, number]> {
  const { x, y, width, height } = opening;
  return [
    [x - width / 2, y - height / 2],
    [x + width / 2, y - height / 2],
    [x + width / 2, y + height / 2],
    [x - width / 2, y + height / 2],
  ];
}
