import { getTypeChartMultiplier } from "#data/type";
import { chartMultipliers, queryTypeChart, regularTypes } from "#data/type-chart";
import { type RegularPokemonType, PokemonType as T } from "#enums/pokemon-type";
import { describe, expect, it } from "vitest";

// Independent standard chart: attack -> [super effective, resisted, immune].
const chart: Record<RegularPokemonType, [RegularPokemonType[], RegularPokemonType[], RegularPokemonType[]]> = {
  [T.NORMAL]: [[], [T.ROCK, T.STEEL], [T.GHOST]],
  [T.FIGHTING]: [
    [T.NORMAL, T.ROCK, T.STEEL, T.ICE, T.DARK],
    [T.FLYING, T.POISON, T.BUG, T.PSYCHIC, T.FAIRY],
    [T.GHOST],
  ],
  [T.FLYING]: [[T.FIGHTING, T.BUG, T.GRASS], [T.ROCK, T.STEEL, T.ELECTRIC], []],
  [T.POISON]: [[T.GRASS, T.FAIRY], [T.POISON, T.GROUND, T.ROCK, T.GHOST], [T.STEEL]],
  [T.GROUND]: [[T.POISON, T.ROCK, T.STEEL, T.FIRE, T.ELECTRIC], [T.BUG, T.GRASS], [T.FLYING]],
  [T.ROCK]: [[T.FLYING, T.BUG, T.FIRE, T.ICE], [T.FIGHTING, T.GROUND, T.STEEL], []],
  [T.BUG]: [[T.GRASS, T.PSYCHIC, T.DARK], [T.FIGHTING, T.FLYING, T.POISON, T.GHOST, T.STEEL, T.FIRE, T.FAIRY], []],
  [T.GHOST]: [[T.GHOST, T.PSYCHIC], [T.DARK], [T.NORMAL]],
  [T.STEEL]: [[T.ROCK, T.ICE, T.FAIRY], [T.STEEL, T.FIRE, T.WATER, T.ELECTRIC], []],
  [T.FIRE]: [[T.BUG, T.STEEL, T.GRASS, T.ICE], [T.ROCK, T.FIRE, T.WATER, T.DRAGON], []],
  [T.WATER]: [[T.GROUND, T.ROCK, T.FIRE], [T.WATER, T.GRASS, T.DRAGON], []],
  [T.GRASS]: [[T.GROUND, T.ROCK, T.WATER], [T.FLYING, T.POISON, T.BUG, T.STEEL, T.FIRE, T.GRASS, T.DRAGON], []],
  [T.ELECTRIC]: [[T.FLYING, T.WATER], [T.GRASS, T.ELECTRIC, T.DRAGON], [T.GROUND]],
  [T.PSYCHIC]: [[T.FIGHTING, T.POISON], [T.STEEL, T.PSYCHIC], [T.DARK]],
  [T.ICE]: [[T.FLYING, T.GROUND, T.GRASS, T.DRAGON], [T.STEEL, T.FIRE, T.WATER, T.ICE], []],
  [T.DRAGON]: [[T.DRAGON], [T.STEEL], [T.FAIRY]],
  [T.DARK]: [[T.GHOST, T.PSYCHIC], [T.FIGHTING, T.DARK, T.FAIRY], []],
  [T.FAIRY]: [[T.FIGHTING, T.DRAGON, T.DARK], [T.POISON, T.STEEL, T.FIRE], []],
};
const expected = (attack: RegularPokemonType, defense: RegularPokemonType): number => {
  const [superEffective, resisted, immune] = chart[attack];
  if (immune.includes(defense)) {
    return 0;
  }
  if (superEffective.includes(defense)) {
    return 2;
  }
  return resisted.includes(defense) ? 0.5 : 1;
};

describe("Basic type chart query", () => {
  it("matches all 324 standard type matchups", () => {
    expect(regularTypes).toHaveLength(18);
    for (const defense of regularTypes) {
      const result = queryTypeChart([defense]);
      for (const attack of regularTypes) {
        expect(getTypeChartMultiplier(attack, defense), `${T[attack]} -> ${T[defense]}`).toBe(
          expected(attack, defense),
        );
        expect(result.effectiveness.get(attack)).toBe(expected(attack, defense));
      }
    }
  });

  it("combines every pair with immunity precedence and stable non-neutral grouping", () => {
    for (const first of regularTypes) {
      for (const second of regularTypes) {
        const result = queryTypeChart([first, second]);
        for (const attack of regularTypes) {
          const multiplier = expected(attack, first) * (first === second ? 1 : expected(attack, second));
          expect(result.effectiveness.get(attack)).toBe(multiplier);
          expect([...result.groups.values()].flat().includes(attack)).toBe(multiplier !== 1);
        }
        expect([...result.groups.keys()]).toEqual(chartMultipliers.filter(value => result.groups.has(value)));
        expect([...result.groups.values()].every(types => types.length)).toBe(true);
      }
    }
  });

  it("covers the requested single and dual type examples", () => {
    expect(queryTypeChart([T.ELECTRIC]).effectiveness.get(T.GROUND)).toBe(2);
    expect(queryTypeChart([T.NORMAL]).effectiveness.get(T.GHOST)).toBe(0);
    expect(queryTypeChart([T.WATER, T.FLYING]).effectiveness.get(T.ELECTRIC)).toBe(4);
    expect(queryTypeChart([T.GRASS, T.STEEL]).effectiveness.get(T.GRASS)).toBe(0.25);
    expect(queryTypeChart([T.NORMAL, T.GHOST]).effectiveness.get(T.FIGHTING)).toBe(0);
  });

  it("handles no selection, duplicate types and invalid inputs", () => {
    expect(queryTypeChart([]).effectiveness.size).toBe(0);
    expect(queryTypeChart([T.WATER, T.WATER])).toEqual(queryTypeChart([T.WATER]));
    expect(() => queryTypeChart([T.WATER, T.FIRE, T.GRASS])).toThrow(RangeError);
    expect(() => queryTypeChart([T.STELLAR as RegularPokemonType])).toThrow(RangeError);
  });
});
