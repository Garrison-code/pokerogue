/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Gender } from "#data/gender";
import { PokeballType } from "#enums/pokeball";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import type { EnemyPokemon } from "#field/pokemon";
import { catchPokemon } from "#mystery-encounters/encounter-pokemon-utils";
import { GameManager } from "#test/framework/game-manager";
import type { OptionSelectUiHandler } from "#ui/option-select-ui-handler";
import i18next from "i18next";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Mystery Encounter - catchPokemon pokedex option", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.DEOXYS);
  });

  it("opens the pokedex for the caught pokemon and rebuilds the release prompt", async () => {
    await game.classicMode.startBattle(
      SpeciesId.BULBASAUR,
      SpeciesId.CHARMANDER,
      SpeciesId.SQUIRTLE,
      SpeciesId.CHIKORITA,
      SpeciesId.CYNDAQUIL,
      SpeciesId.TOTODILE,
    );

    const pokemon = game.scene.getEnemyPokemon();
    expect(pokemon).toBeDefined();
    const caught = pokemon as EnemyPokemon;
    caught.formIndex = 1;
    expect(game.scene.getPlayerParty()).toHaveLength(6);

    const deoxys = speciesDataRegistry.getSpecies(SpeciesId.DEOXYS);
    game.scene.gameData.dexData[SpeciesId.DEOXYS].caughtAttr = deoxys.getFullUnlocksData();

    const pendingCatch = catchPokemon(caught, null, PokeballType.POKEBALL, false);
    pendingCatch.catch(() => undefined);
    const releasePrompt = i18next.t("battle:partyFull", { pokemonName: caught.getNameToRender() });
    await vi.waitUntil(() => game.scene.ui.mode === UiMode.OPTION_SELECT, { timeout: 10000 });

    const menu = game.scene.ui.getHandler() as OptionSelectUiHandler;
    const pokedexOption = menu["options"].find(option => option.label === i18next.t("menuUiHandler:pokedex"));
    expect(pokedexOption).toBeDefined();

    const setOverlayMode = vi.spyOn(game.scene.ui, "setOverlayMode").mockImplementation(() => Promise.resolve());
    expect(pokedexOption!.handler()).toBe(true);

    const call = setOverlayMode.mock.calls[0];
    expect(call).toBeDefined();
    const rebuildPrompt = call[5] as () => void;
    expect(rebuildPrompt).toEqual(expect.any(Function));
    rebuildPrompt();
    await vi.waitUntil(
      () =>
        game.textInterceptor.logs.filter(log => log === releasePrompt).length >= 2
        && game.scene.ui.mode === UiMode.OPTION_SELECT,
      { timeout: 10000 },
    );

    expect(call).toEqual([
      UiMode.POKEDEX_PAGE,
      caught.species,
      { shiny: caught.shiny, variant: caught.variant, form: caught.formIndex, female: caught.gender === Gender.FEMALE },
      null,
      null,
      rebuildPrompt,
    ]);
  });
});
