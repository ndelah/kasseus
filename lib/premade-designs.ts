import catalog from './premade-designs.json';

export type PremadeDesign = {
  id: string;
  name: string;
  artwork: string;
  featured: boolean;
  previews: Record<string, { url: string; colors: string[] }>;
};

export const premadeDesigns: PremadeDesign[] = catalog;
export const defaultDesign = premadeDesigns[0];
