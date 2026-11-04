import { settings } from "#app/global-settings-manager";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PokedexUiHandler } from "#ui/pokedex-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - pokedex list sprite", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PokedexUiHandler;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.POKEDEX);
    handler = game.scene.ui.getHandler() as PokedexUiHandler;
    vi.spyOn(settings.general, "dexForDevs", "get").mockReturnValue(false);
    for (const id of [SpeciesId.BULBASAUR, SpeciesId.CHARMANDER]) {
      game.scene.gameData.dexData[id].caughtAttr = 0n;
      game.scene.gameData.dexData[id].seenAttr = 0n;
    }
  }, 30_000);

  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
  });

  it.each([
    ["seen but not caught", 1n, 0x808080],
    ["unseen", 0n, 0x000000],
  ] as const)("shows the %s species after its assets load", async (_label, seenAttr, tint) => {
    const species = speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR);
    game.scene.gameData.dexData[SpeciesId.BULBASAUR].seenAttr = seenAttr;
    const assets = Promise.withResolvers<void>();
    const load = vi.spyOn(species, "loadAssets").mockReturnValue(assets.promise);
    const sprite = handler["pokemonSprite"];
    const play = vi.spyOn(sprite, "play");
    const visible = vi.spyOn(sprite, "setVisible");
    const setTint = vi.spyOn(sprite, "setTint");
    handler.setSpeciesDetails(species);
    expect(load).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, true);
    expect(visible).toHaveBeenLastCalledWith(false);
    assets.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledWith(species.getSpriteKey(false));
    expect(visible).toHaveBeenLastCalledWith(true);
    expect(setTint).toHaveBeenLastCalledWith(tint);
  });

  it("ignores an earlier load that finishes after the new selection", async () => {
    const first = speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR);
    const second = speciesDataRegistry.getSpecies(SpeciesId.CHARMANDER);
    const earlier = Promise.withResolvers<void>();
    const later = Promise.withResolvers<void>();
    vi.spyOn(first, "loadAssets").mockReturnValue(earlier.promise);
    vi.spyOn(second, "loadAssets").mockReturnValue(later.promise);
    const sprite = handler["pokemonSprite"];
    const play = vi.spyOn(sprite, "play");
    const visible = vi.spyOn(sprite, "setVisible");
    const setTint = vi.spyOn(sprite, "setTint");
    handler.setSpeciesDetails(first);
    handler.setSpeciesDetails(second);
    later.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledExactlyOnceWith(second.getSpriteKey(false));
    earlier.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledExactlyOnceWith(second.getSpriteKey(false));
    expect(visible).toHaveBeenLastCalledWith(true);
    expect(setTint).toHaveBeenLastCalledWith(0);
  });
});
