import profileData from './case-profiles.json';
import { parseCaseProfile, type CaseProfile } from './case-profile';

export const catalogSource = 'https://comparisontabl.es/kindle-e-readers/';
export const supportedModels = profileData.map((input) => ({
  ...parseCaseProfile(input),
  enabled: true as const,
}));
export type SupportedModel = CaseProfile & { enabled: true };
export const supportedModel = supportedModels[0];
// One sourced registry drives the selector, generator and downloadable catalogue.
export const models = supportedModels;
