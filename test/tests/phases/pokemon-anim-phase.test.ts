import { AbilityId } from "#enums/ability-id";
import { BattlerIndex } from "#enums/battler-index";
import { BattlerTagType } from "#enums/battler-tag-type";
import { MoveId } from "#enums/move-id";
import { PokemonAnimType } from "#enums/pokemon-anim-type";
import { SpeciesId } from "#enums/species-id";
import { PokemonAnimPhase } from "#phases/pokemon-anim-phase";
import { GameManager } from "#test/framework/game-manager";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Phases - Pokemon Anim Phase", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    applyOverrides(game);
  });

  it("should finish when Tatsugiri and Dondozo enter a double battle together", async () => {
    const endSpy = vi.spyOn(PokemonAnimPhase.prototype, "end");

    await game.classicMode.startBattle(SpeciesId.TATSUGIRI, SpeciesId.DONDOZO);

    const [tatsugiri, dondozo] = game.scene.getPlayerField();
    expect(endSpy).toHaveBeenCalled();
    expect(dondozo).toHaveBattlerTag(BattlerTagType.COMMANDED);
    expect(tatsugiri.visible).toBe(false);
  });

  it("should finish when Dondozo switches in beside Tatsugiri", async () => {
    await game.classicMode.startBattle(SpeciesId.TATSUGIRI, SpeciesId.MAGIKARP, SpeciesId.DONDOZO);

    const [tatsugiri, , dondozo] = game.scene.getPlayerParty();
    const endSpy = vi.spyOn(PokemonAnimPhase.prototype, "end");

    game.move.select(MoveId.LIQUIDATION, 0, BattlerIndex.ENEMY);
    game.doSwitchPokemon(2);

    await game.phaseInterceptor.to("MovePhase", false);

    expect(endSpy).toHaveBeenCalled();
    expect(dondozo).toHaveBattlerTag(BattlerTagType.COMMANDED);
    expect(tatsugiri.visible).toBe(false);
  });

  it("should end immediately when the ally is not a Dondozo", async () => {
    await game.classicMode.startBattle(SpeciesId.TATSUGIRI, SpeciesId.MAGIKARP);
    expectCommanderApplyToEndImmediately(game);
  });

  it("should end immediately in a single battle", async () => {
    game.override.battleStyle("single");
    await game.classicMode.startBattle(SpeciesId.TATSUGIRI);
    expectCommanderApplyToEndImmediately(game);
  });

  it("should show Tatsugiri again when Dondozo loses the COMMANDED tag", async () => {
    const endSpy = vi.spyOn(PokemonAnimPhase.prototype, "end");

    await game.classicMode.startBattle(SpeciesId.TATSUGIRI, SpeciesId.DONDOZO);

    const [tatsugiri, dondozo] = game.scene.getPlayerField();
    expect(dondozo).toHaveBattlerTag(BattlerTagType.COMMANDED);
    expect(tatsugiri.visible).toBe(false);

    endSpy.mockClear();
    dondozo.removeTag(BattlerTagType.COMMANDED);

    // startBattle stops on CommandPhase. Skip it so the unshifted exit animation runs.
    game.phaseInterceptor.shiftPhase();
    await game.phaseInterceptor.to("PokemonAnimPhase");

    expect(endSpy).toHaveBeenCalled();
    expect(tatsugiri.visible).toBe(true);
  });
});

function applyOverrides(manager: GameManager): void {
  manager.override
    .startingLevel(100)
    .enemyLevel(100)
    .moveset([MoveId.LIQUIDATION, MoveId.SPLASH])
    .ability(AbilityId.COMMANDER)
    .battleStyle("double")
    .criticalHits(false)
    .enemySpecies(SpeciesId.SNORLAX)
    .enemyAbility(AbilityId.BALL_FETCH)
    .enemyMoveset(MoveId.SPLASH);
}

/**
 * Requests COMMANDER_APPLY directly. Both early-return paths finish the phase without playing the animation.
 * The test tween mock completes synchronously, so "no animation" is asserted by checking that no tween
 * and no copy of the Tatsugiri sprite was created, not just that `end` was called.
 */
function expectCommanderApplyToEndImmediately(manager: GameManager): void {
  const tatsugiri = manager.scene.getPlayerField()[0];
  const endSpy = vi.spyOn(PokemonAnimPhase.prototype, "end");
  const tweenSpy = vi.spyOn(manager.scene.tweens, "add");
  const spriteSpy = vi.spyOn(manager.scene, "addPokemonSprite");
  endSpy.mockClear();
  tweenSpy.mockClear();
  spriteSpy.mockClear();

  const phase = manager.scene.phaseManager.create("PokemonAnimPhase", PokemonAnimType.COMMANDER_APPLY, tatsugiri);
  expect(() => phase.start()).not.toThrow();
  expect(endSpy).toHaveBeenCalled();
  expect(tweenSpy).not.toHaveBeenCalled();
  expect(spriteSpy).not.toHaveBeenCalled();
}
