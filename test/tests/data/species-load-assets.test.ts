import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { SpeciesId } from "#enums/species-id";
import * as pokemonSprite from "#sprites/pokemon-sprite";
import { GameManager } from "#test/framework/game-manager";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Species asset loading", () => {
  let phaserGame: Phaser.Game;
  const species = () => speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR);

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(() => {
    new GameManager(phaserGame);
    vi.spyOn(globalScene, "loadPokemonAtlas").mockImplementation(() => {});
    vi.spyOn(globalScene.textures, "exists").mockReturnValue(true);
    vi.spyOn(globalScene.anims, "generateFrameNames").mockReturnValue([{ key: "pkmn__1", frame: "0001.png" }]);
    vi.spyOn(globalScene.anims, "exists").mockReturnValue(false);
    vi.spyOn(globalScene.anims, "create").mockReturnValue(false);
  });

  it("resolves after loading without a variant", async () => {
    await expect(species().loadAssets(false, 0, false, undefined, true)).resolves.toBeUndefined();
  }, 1000);

  it("waits for variant colors and variant assets when a variant is defined", async () => {
    const colors = Promise.withResolvers<void>();
    const assets = Promise.withResolvers<void>();
    const loadColors = vi.spyOn(species(), "loadVariantColors").mockReturnValue(colors.promise);
    const loadAssets = vi.spyOn(pokemonSprite, "loadPokemonVariantAssets").mockReturnValue(assets.promise);
    const settled = vi.fn();
    const result = species().loadAssets(false, 0, false, 0, true).then(settled);
    expect(loadColors).toHaveBeenCalled();
    expect(loadAssets).not.toHaveBeenCalled();
    colors.resolve();
    await Promise.resolve();
    expect(loadAssets).toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    assets.resolve();
    await result;
    expect(settled).toHaveBeenCalledOnce();
  });

  it("resolves without creating an animation when the texture is missing", async () => {
    vi.mocked(globalScene.textures.exists).mockReturnValue(false);
    await species().loadAssets(false, 0, false, undefined, true);
    expect(globalScene.anims.generateFrameNames).not.toHaveBeenCalled();
    expect(globalScene.anims.create).not.toHaveBeenCalled();
  });

  it("does not create an empty animation, allowing a later successful load", async () => {
    vi.mocked(globalScene.anims.generateFrameNames).mockReturnValueOnce([]);
    await species().loadAssets(false, 0, false, undefined, true);
    expect(globalScene.anims.create).not.toHaveBeenCalled();
    await species().loadAssets(false, 0, false, undefined, true);
    expect(globalScene.anims.create).toHaveBeenCalledOnce();
  });

  it("creates the loaded animation at frame rate 10", async () => {
    vi.mocked(globalScene.anims.create).mockRestore();
    await species().loadAssets(false, 0, false, undefined, true);
    const animation = globalScene.anims.get(species().getSpriteKey(false, 0));
    expect(animation).toBeDefined();
    expect(animation?.frameRate).toBe(10);
  });
});
