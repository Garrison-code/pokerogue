import { LoadingScene } from "#app/loading-scene";
import { BattleType } from "#enums/battle-type";
import { PokeballType } from "#enums/pokeball";
import { SpeciesId } from "#enums/species-id";
import { TrainerType } from "#enums/trainer-type";
import { GameManager } from "#test/framework/game-manager";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("BattleScene", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
  });

  it("should remove LoadingScene on create", () => {
    // `BattleScene.create()` is called during the `new GameManager()` call
    expect(game.scene.scene.remove).toHaveBeenCalledWith(LoadingScene.KEY);
  });

  it("starts each new adventure with 9999 Master Balls and keeps other starting balls", () => {
    game.scene.pokeballCounts[PokeballType.MASTER_BALL] = 2;
    game.scene.reset();
    expect(game.scene.pokeballCounts).toEqual({
      [PokeballType.POKEBALL]: 5,
      [PokeballType.GREAT_BALL]: 0,
      [PokeballType.ULTRA_BALL]: 0,
      [PokeballType.ROGUE_BALL]: 0,
      [PokeballType.MASTER_BALL]: 9999,
    });
  });

  it("should also reset RNG on reset", () => {
    vi.spyOn(game.scene, "resetSeed");

    game.scene.reset();

    expect(game.scene.resetSeed).toHaveBeenCalled();
  });

  it("should remove the current battle's trainer on reset", async () => {
    game.override.battleType(BattleType.TRAINER).randomTrainer({ trainerType: TrainerType.ACE_TRAINER });
    await game.classicMode.startBattle(SpeciesId.MAGIKARP);

    const trainer = game.scene.currentBattle.trainer!;
    vi.spyOn(trainer, "destroy");

    game.scene.reset();

    expect(trainer.destroy).toHaveBeenCalled();
  });

  it("should remove the previous wave's trainer on reset", async () => {
    game.override.battleType(BattleType.TRAINER).randomTrainer({ trainerType: TrainerType.ACE_TRAINER });
    await game.classicMode.startBattle(SpeciesId.MAGIKARP);

    // A run can end before the previous wave's trainer has left the field
    const trainer = game.scene.currentBattle.trainer!;
    game.scene.lastEnemyTrainer = trainer;
    vi.spyOn(trainer, "destroy");

    game.scene.reset();

    expect(trainer.destroy).toHaveBeenCalled();
    expect(game.scene.lastEnemyTrainer).toBeNull();
  });
});
