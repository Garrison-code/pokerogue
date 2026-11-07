import { globalScene } from "#app/global-scene";
import { AnimConfig, loadMoveAnimAssets, moveAnims } from "#data/battle-anims";
import { MoveId } from "#enums/move-id";
import { GameManager } from "#test/framework/game-manager";
import fs from "node:fs";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Battle animation asset loading", () => {
  let phaserGame: Phaser.Game;
  const originalAnimations = new Map<MoveId, ReturnType<typeof moveAnims.get>>();

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    const game = new GameManager(phaserGame);
    await game.scene.preload();
    vi.spyOn(globalScene, "loadImage").mockReturnValue(globalScene);
    vi.spyOn(globalScene, "loadSpritesheet").mockReturnValue(globalScene);
    vi.spyOn(globalScene, "loadSe").mockReturnValue(globalScene);
  });

  afterEach(() => {
    for (const [move, animation] of originalAnimations) {
      if (animation === undefined) {
        moveAnims.delete(move);
      } else {
        moveAnims.set(move, animation);
      }
    }
    originalAnimations.clear();
  });

  function useAnimation(move: MoveId, filename: string): void {
    originalAnimations.set(move, moveAnims.get(move));
    // Read the real assets directly: the shared fetch mock replaces animations with Tackle.
    const source = JSON.parse(fs.readFileSync(`assets/battle-anims/${filename}.json`, "utf8"));
    moveAnims.set(
      move,
      Array.isArray(source) ? [new AnimConfig(source[0]), new AnimConfig(source[1])] : new AnimConfig(source),
    );
  }

  it.each([
    [MoveId.PSYCHIC, "psychic", "PRAS- Psychic BG"],
    [MoveId.LICK, "lick", "PRAS- Sketch + Lick"],
  ] as const)("queues the shared graphic and background once for %s", async (move, filename, name) => {
    useAnimation(move, filename);

    await loadMoveAnimAssets([move]);

    expect(vi.mocked(globalScene.loadSpritesheet).mock.calls.filter(([key]) => key === name)).toEqual([
      [name, "battle_anims", 96],
    ]);
    expect(globalScene.loadImage).not.toHaveBeenCalledWith(name, "battle_anims");
  });

  it("still queues a background with a different name", async () => {
    useAnimation(MoveId.AGILITY, "agility");

    await loadMoveAnimAssets([MoveId.AGILITY]);

    expect(globalScene.loadSpritesheet).toHaveBeenCalledExactlyOnceWith("mixed", "battle_anims", 96);
    expect(globalScene.loadImage).toHaveBeenCalledExactlyOnceWith("PRAS- Speed BG", "battle_anims");
  });
});
