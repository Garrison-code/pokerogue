/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { modifierTypes } from "#data/data-lists";
import { getPokeballCapacity } from "#data/pokeball";
import { MoveId } from "#enums/move-id";
import { PokeballType } from "#enums/pokeball";
import { SpeciesId } from "#enums/species-id";
import { AddPokeballModifier } from "#modifiers/modifier";
import { GameManager } from "#test/framework/game-manager";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("Items - Master Ball supply", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(() => {
    game = new GameManager(phaserGame);
  });

  it.each([9999, 9998, 100])("never reduces a stock of %s Master Balls when receiving more", count => {
    game.scene.pokeballCounts[PokeballType.MASTER_BALL] = count;
    new AddPokeballModifier(modifierTypes.MASTER_BALL(), PokeballType.MASTER_BALL, 1).apply();
    expect(game.scene.pokeballCounts[PokeballType.MASTER_BALL]).toBe(Math.min(count + 1, 9999));
  });

  it("consumes one Master Ball when it is thrown during an adventure", async () => {
    game.override.enemySpecies(SpeciesId.MAGIKARP).enemyMoveset(MoveId.SPLASH);
    await game.classicMode.startBattle(SpeciesId.MAGIKARP);
    expect(game.scene.pokeballCounts[PokeballType.MASTER_BALL]).toBe(9999);
    game.doThrowPokeball(PokeballType.MASTER_BALL);
    await game.phaseInterceptor.to("AttemptCapturePhase");
    expect(game.scene.pokeballCounts[PokeballType.MASTER_BALL]).toBe(9998);
  });

  it("keeps the capacity of other ball types at 99", () => {
    game.scene.pokeballCounts[PokeballType.POKEBALL] = 98;
    new AddPokeballModifier(modifierTypes.POKEBALL(), PokeballType.POKEBALL, 5).apply();
    expect(game.scene.pokeballCounts[PokeballType.POKEBALL]).toBe(99);
    expect(getPokeballCapacity(PokeballType.MASTER_BALL)).toBe(9999);
    for (const type of [
      PokeballType.POKEBALL,
      PokeballType.GREAT_BALL,
      PokeballType.ULTRA_BALL,
      PokeballType.ROGUE_BALL,
    ]) {
      expect(getPokeballCapacity(type)).toBe(99);
    }
  });
});
