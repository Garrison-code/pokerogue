/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PokedexPageUiHandler } from "#ui/pokedex-page-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - pokedex detail form sprite", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PokedexPageUiHandler;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    const dexEntry = game.scene.gameData.dexData[SpeciesId.VENUSAUR];
    dexEntry.seenAttr = 1n;
    dexEntry.caughtAttr = 0n;
    handler = game.scene.ui.handlers[UiMode.POKEDEX_PAGE] as PokedexPageUiHandler;
  });
  afterEach(() => {
    handler?.clear();
    if (handler) {
      handler.tutorialActive = false;
    }
    game.scene.ui["overlayActive"] = false;
  });

  it.each([undefined, "mega", "gigantamax"])("loads the selected uncaught form: %s", async formKey => {
    const species = speciesDataRegistry.getSpecies(SpeciesId.VENUSAUR);
    const formIndex = formKey === undefined ? 0 : species.forms.findIndex(form => form.formKey === formKey);
    expect(formIndex).toBeGreaterThanOrEqual(0);
    const load = vi.spyOn(species, "loadAssets").mockResolvedValue(undefined);
    const tint = vi.spyOn(handler["pokemonSprite"], "setTint");

    await game.scene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, formKey === undefined ? undefined : { formIndex });
    handler = game.scene.ui.getHandler() as PokedexPageUiHandler;

    expect(load).toHaveBeenCalledWith(expect.any(Boolean), formIndex, false, 0, true, false);
    expect(tint).toHaveBeenLastCalledWith(0x808080);
  });

  it("keeps an unseen species in its default form with a black silhouette", async () => {
    const species = speciesDataRegistry.getSpecies(SpeciesId.VENUSAUR);
    const formIndex = species.forms.findIndex(form => form.formKey === "mega");
    expect(formIndex).toBeGreaterThan(0);
    game.scene.gameData.dexData[SpeciesId.VENUSAUR].seenAttr = 0n;
    // A caught starter also makes its evolutions count as seen.
    game.scene.gameData.dexData[SpeciesId.BULBASAUR].caughtAttr = 0n;
    const load = vi.spyOn(species, "loadAssets").mockResolvedValue(undefined);
    const tint = vi.spyOn(handler["pokemonSprite"], "setTint");

    await game.scene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, { formIndex });

    expect(load).toHaveBeenCalledWith(false, 0, false, 0, true, false);
    expect(tint).toHaveBeenLastCalledWith(0x000000);
    expect(handler["pokemonNameText"].text).toBe("???");
  });
});
