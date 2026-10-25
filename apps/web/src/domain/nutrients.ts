// The eight nutrients of packages/contracts/log-schema.md, in its order and `_g` naming.
export const NUTRIENTS = [
  'kcal',
  'protein_g',
  'fat_g',
  'sat_fat_g',
  'carbs_g',
  'sugars_g',
  'fibre_g',
  'salt_g',
] as const;

export type Nutrient = (typeof NUTRIENTS)[number];
