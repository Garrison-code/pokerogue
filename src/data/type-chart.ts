import { getTypeChartMultiplier } from "#data/type";
import { MAX_REGULAR_POKEMON_TYPE, MIN_REGULAR_POKEMON_TYPE, type RegularPokemonType } from "#enums/pokemon-type";

export type ChartMultiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4;
export const chartMultipliers = [4, 2, 0.5, 0.25, 0] as const;
export const regularTypes: readonly RegularPokemonType[] = Array.from(
  { length: MAX_REGULAR_POKEMON_TYPE - MIN_REGULAR_POKEMON_TYPE + 1 },
  (_, index) => index + MIN_REGULAR_POKEMON_TYPE,
);

/** Basic type matchups only: independent of the active battle and its challenge rules. */
export function queryTypeChart(defenders: readonly RegularPokemonType[]): {
  effectiveness: Map<RegularPokemonType, ChartMultiplier>;
  groups: Map<(typeof chartMultipliers)[number], RegularPokemonType[]>;
} {
  const unique = [...new Set(defenders)];
  if (unique.length > 2 || unique.some(type => !regularTypes.includes(type))) {
    throw new RangeError("Select at most two regular defending types");
  }
  const effectiveness = new Map<RegularPokemonType, ChartMultiplier>();
  const groups = new Map<(typeof chartMultipliers)[number], RegularPokemonType[]>();
  if (unique.length === 0) {
    return { effectiveness, groups };
  }
  for (const attack of regularTypes) {
    const multiplier = unique.reduce<number>((value, defense) => value * getTypeChartMultiplier(attack, defense), 1);
    effectiveness.set(attack, multiplier as ChartMultiplier);
  }
  for (const multiplier of chartMultipliers) {
    const types = regularTypes.filter(type => effectiveness.get(type) === multiplier);
    if (types.length > 0) {
      groups.set(multiplier, types);
    }
  }
  return { effectiveness, groups };
}
