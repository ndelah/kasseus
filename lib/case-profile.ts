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
  template: 'rounded-back-open-bottom';
  cornerRadius: number;
  fitStatus: 'prototype';
  notes: string;
};

export function parseCaseProfile(input: unknown): CaseProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('A case profile must be a JSON object.');
  const p = input as Record<string, unknown>;
  for (const key of ['id', 'name', 'generation', 'port', 'shortName', 'exportName', 'source', 'notes']) {
    if (typeof p[key] !== 'string' || !p[key].trim())
      throw new Error(`Profile ${key} must be a non-empty string.`);
  }
  for (const key of ['id', 'exportName']) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(p[key])))
      throw new Error(`Profile ${key} must be a lowercase slug.`);
  }
  for (const [key, min, max] of [
    ['width', 40, 300], ['height', 50, 400], ['depth', 3, 30],
    ['display', 1, 20], ['cornerRadius', 1, 30],
  ] as const) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      throw new Error(`Profile ${key} must be between ${min} and ${max}.`);
  }
  if (Number(p.cornerRadius) >= Math.min(Number(p.width), Number(p.height)) / 2 - 2)
    throw new Error('Corner radius is too large for the device.');
  if (p.template !== 'rounded-back-open-bottom')
    throw new Error('Unsupported body template. This generator requires rounded-back-open-bottom.');
  if (p.fitStatus !== 'prototype')
    throw new Error('Generated cases must be marked as prototype until physical fit is validated.');
  if (!/^https?:\/\//.test(String(p.source)))
    throw new Error('Profile source must be an HTTP(S) URL.');
  return p as CaseProfile;
}
