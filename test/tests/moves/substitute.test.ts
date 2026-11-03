import { settings } from "#app/global-settings-manager";
import { MoveAnim } from "#data/battle-anims";
import { SubstituteTag } from "#data/battler-tags";
import { allMoves } from "#data/data-lists";
import { AbilityId } from "#enums/ability-id";
import { ArenaTagSide } from "#enums/arena-tag-side";
import { ArenaTagType } from "#enums/arena-tag-type";
import { BattlerIndex } from "#enums/battler-index";
import { BattlerTagType } from "#enums/battler-tag-type";
import { BerryType } from "#enums/berry-type";
import { Command } from "#enums/command";
import { AnimBlendType, AnimFocus, AnimFrameTarget } from "#enums/move-anims-common";
import { MoveId } from "#enums/move-id";
import { MoveResult } from "#enums/move-result";
import { SpeciesId } from "#enums/species-id";
import { Stat } from "#enums/stat";
import { StatusEffect } from "#enums/status-effect";
import { UiMode } from "#enums/ui-mode";
import type { Pokemon } from "#field/pokemon";
import { StealHeldItemChanceAttr } from "#moves/move";
import type { CommandPhase } from "#phases/command-phase";
import type { MoveEffectPhase } from "#phases/move-effect-phase";
import { GameManager } from "#test/framework/game-manager";
import type { MockSprite } from "#test/mocks/mocks-container/mock-sprite";
import { toDmgValue } from "#utils/common";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Moves - Substitute", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);

    game.override
      .battleStyle("single")
      .moveset([MoveId.SUBSTITUTE, MoveId.SWORDS_DANCE, MoveId.TACKLE, MoveId.SPLASH])
      .enemySpecies(SpeciesId.SNORLAX)
      .enemyAbility(AbilityId.INSOMNIA)
      .enemyMoveset(MoveId.SPLASH)
      .startingLevel(100)
      .enemyLevel(100);
  });

  it("should cause the user to take damage", async () => {
    await game.classicMode.startBattle(SpeciesId.MAGIKARP);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase", false);

    expect(leadPokemon).toHaveHp(Math.ceil((leadPokemon.getMaxHp() * 3) / 4));
  });

  it("should redirect enemy attack damage to the Substitute doll", async () => {
    game.override.enemyMoveset(MoveId.TACKLE);

    await game.classicMode.startBattle(SpeciesId.SKARMORY);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase", false);

    expect(leadPokemon).toHaveHp(Math.ceil((leadPokemon.getMaxHp() * 3) / 4));
    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    const postSubHp = leadPokemon.hp;

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveHp(postSubHp);
    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
  });

  it("should fade after redirecting more damage than its remaining HP", async () => {
    // Giga Impact OHKOs Magikarp if substitute isn't up
    game.override.enemyMoveset(MoveId.GIGA_IMPACT);
    vi.spyOn(allMoves[MoveId.GIGA_IMPACT], "accuracy", "get").mockReturnValue(100);

    await game.classicMode.startBattle(SpeciesId.MAGIKARP);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase", false);

    expect(leadPokemon).toHaveHp(Math.ceil((leadPokemon.getMaxHp() * 3) / 4));
    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    const postSubHp = leadPokemon.hp;

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveHp(postSubHp);
    expect(leadPokemon).not.toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
  });

  it("should block stat changes from status moves", async () => {
    game.override.enemyMoveset(MoveId.CHARM);

    await game.classicMode.startBattle(SpeciesId.MAGIKARP);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveStatStage(Stat.ATK, 0);
    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
  });

  it("should be bypassed by sound-based moves", async () => {
    game.override.enemyMoveset(MoveId.ECHOED_VOICE);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase");

    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    const postSubHp = leadPokemon.hp;

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    expect(leadPokemon.hp).toBeLessThan(postSubHp);
  });

  it("should be bypassed by attackers with Infiltrator", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).enemyAbility(AbilityId.INFILTRATOR);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase");

    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    const postSubHp = leadPokemon.hp;

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    expect(leadPokemon.hp).toBeLessThan(postSubHp);
  });

  it("shouldn't block the user's own status moves", async () => {
    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("MoveEndPhase");
    await game.toNextTurn();

    game.move.select(MoveId.SWORDS_DANCE);

    await game.phaseInterceptor.to("MoveEndPhase", false);

    expect(leadPokemon).toHaveStatStage(Stat.ATK, 2);
  });

  it("shouldn't block moves that target the user's side of the field", async () => {
    game.override.moveset(MoveId.LIGHT_SCREEN);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();
    vi.spyOn(leadPokemon, "getMoveEffectiveness");

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.LIGHT_SCREEN);

    await game.toNextTurn();

    expect(leadPokemon.getMoveEffectiveness).not.toHaveReturnedWith(0);
    expect(game).toHaveArenaTag(ArenaTagType.LIGHT_SCREEN, ArenaTagSide.PLAYER);
  });

  it("shouldn't block the opponent from setting hazards", async () => {
    game.override.enemyMoveset(MoveId.STEALTH_ROCK);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();
    vi.spyOn(leadPokemon, "getMoveEffectiveness");

    game.move.select(MoveId.SUBSTITUTE);

    await game.toNextTurn();

    expect(leadPokemon.getMoveEffectiveness).not.toHaveReturnedWith(0);
    expect(game).toHaveArenaTag(ArenaTagType.STEALTH_ROCK, ArenaTagSide.PLAYER);
  });

  it("shouldn't block moves that target both sides of the field", async () => {
    game.override.moveset(MoveId.TRICK_ROOM).enemyMoveset(MoveId.GRAVITY);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const pokemon = game.scene.getField(true);
    pokemon.forEach(p => {
      vi.spyOn(p, "getMoveEffectiveness");
      p.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, p.id);
    });

    game.move.select(MoveId.TRICK_ROOM);

    await game.toNextTurn();

    pokemon.forEach(p => expect(p.getMoveEffectiveness).not.toHaveReturnedWith(0));
    expect(game).toHaveArenaTag(ArenaTagType.TRICK_ROOM);
    expect(game).toHaveArenaTag(ArenaTagType.GRAVITY);
  });

  it("should protect the user from flinching", async () => {
    game.override.enemyMoveset(MoveId.FAKE_OUT).startingLevel(1); // Ensures the Substitute will break

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();
    const enemyPokemon = game.field.getEnemyPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.TACKLE);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(enemyPokemon).not.toHaveFullHp();
  });

  it("should protect the user from being trapped", async () => {
    vi.spyOn(allMoves[MoveId.SAND_TOMB], "accuracy", "get").mockReturnValue(100);
    game.override.enemyMoveset(MoveId.SAND_TOMB);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SPLASH);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).not.toHaveBattlerTag(BattlerTagType.SAND_TOMB);
  });

  it("should prevent the user's stats from being lowered", async () => {
    vi.spyOn(allMoves[MoveId.LIQUIDATION], "chance", "get").mockReturnValue(100);
    game.override.enemyMoveset(MoveId.LIQUIDATION);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SPLASH);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveStatStage(Stat.DEF, 0);
  });

  it("should protect the user from being afflicted with status effects", async () => {
    game.override.enemyMoveset(MoveId.NUZZLE);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SPLASH);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).not.toHaveStatusEffect(StatusEffect.PARALYSIS);
  });

  it("should prevent the user's items from being stolen", async () => {
    game.override.enemyMoveset(MoveId.THIEF).startingHeldItems([{ name: "BERRY", type: BerryType.SITRUS }]);
    vi.spyOn(allMoves[MoveId.THIEF], "attrs", "get").mockReturnValue([new StealHeldItemChanceAttr(1.0)]); // give Thief 100% steal rate

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SPLASH);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon.getHeldItems().length).toBe(1);
  });

  it("should prevent the user's items from being removed", async () => {
    game.override.moveset([MoveId.KNOCK_OFF]).enemyHeldItems([{ name: "BERRY", type: BerryType.SITRUS }]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const enemyPokemon = game.field.getEnemyPokemon();

    enemyPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, enemyPokemon.id);
    const enemyNumItems = enemyPokemon.getHeldItems().length;

    game.move.select(MoveId.KNOCK_OFF);

    await game.phaseInterceptor.to("MoveEndPhase", false);

    expect(enemyPokemon.getHeldItems().length).toBe(enemyNumItems);
  });

  it("move effect should prevent the user's berries from being stolen and eaten", async () => {
    game.override.enemyMoveset(MoveId.BUG_BITE).startingHeldItems([{ name: "BERRY", type: BerryType.SITRUS }]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();
    const enemyPokemon = game.field.getEnemyPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.TACKLE);

    await game.phaseInterceptor.to("MoveEndPhase", false);
    const enemyPostAttackHp = enemyPokemon.hp;

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon.getHeldItems().length).toBe(1);
    expect(enemyPokemon).toHaveHp(enemyPostAttackHp);
  });

  it("should prevent the user's stats from being reset by Clear Smog", async () => {
    game.override.enemyMoveset(MoveId.CLEAR_SMOG);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SWORDS_DANCE);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).toHaveStatStage(Stat.ATK, 2);
  });

  it("should prevent the user from becoming confused", async () => {
    game.override.enemyMoveset(MoveId.MAGICAL_TORQUE);
    vi.spyOn(allMoves[MoveId.MAGICAL_TORQUE], "chance", "get").mockReturnValue(100);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    game.move.select(MoveId.SWORDS_DANCE);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(leadPokemon).not.toHaveBattlerTag(BattlerTagType.CONFUSED);
    expect(leadPokemon).toHaveStatStage(Stat.ATK, 2);
  });

  it("should transfer to the switched in Pokemon when the source uses Baton Pass", async () => {
    game.override.moveset([MoveId.SUBSTITUTE, MoveId.BATON_PASS]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE, SpeciesId.CHARIZARD);

    const leadPokemon = game.field.getPlayerPokemon();

    leadPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, leadPokemon.id);

    // Simulate a Baton switch for the player this turn
    game.onNextPrompt("CommandPhase", UiMode.COMMAND, () => {
      (game.scene.phaseManager.getCurrentPhase() as CommandPhase).handleCommand(Command.POKEMON, 1, true);
    });

    await game.phaseInterceptor.to("MovePhase", false);

    const player = game.field.getPlayerPokemon();
    expect(player).toHaveBattlerTag({ tagType: BattlerTagType.SUBSTITUTE, hp: toDmgValue(leadPokemon.getMaxHp() / 4) });
  });

  it("should prevent the source's Rough Skin from activating when hit", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).ability(AbilityId.ROUGH_SKIN);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const enemyPokemon = game.field.getEnemyPokemon();

    game.move.select(MoveId.SUBSTITUTE);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(enemyPokemon).toHaveFullHp();
  });

  it("should prevent the source's Focus Punch from failing when hit", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).moveset([MoveId.FOCUS_PUNCH]);

    // Make Focus Punch 40 power to avoid a KO
    vi.spyOn(allMoves[MoveId.FOCUS_PUNCH], "calculateBattlePower").mockReturnValue(40);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const playerPokemon = game.field.getPlayerPokemon();
    const enemyPokemon = game.field.getEnemyPokemon();

    playerPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, playerPokemon.id);

    game.move.select(MoveId.FOCUS_PUNCH);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(playerPokemon).toHaveUsedMove({ move: MoveId.FOCUS_PUNCH, result: MoveResult.SUCCESS });
    expect(enemyPokemon).not.toHaveFullHp();
  });

  it("should not allow Shell Trap to activate when attacked", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).moveset([MoveId.SHELL_TRAP]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const playerPokemon = game.field.getPlayerPokemon();

    playerPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, playerPokemon.id);

    game.move.select(MoveId.SHELL_TRAP);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(playerPokemon).toHaveUsedMove({ move: MoveId.SHELL_TRAP, result: MoveResult.FAIL });
  });

  it("should not allow Beak Blast to burn opponents when hit", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).moveset([MoveId.BEAK_BLAST]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const playerPokemon = game.field.getPlayerPokemon();
    const enemyPokemon = game.field.getEnemyPokemon();

    playerPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, playerPokemon.id);

    game.move.select(MoveId.BEAK_BLAST);

    await game.phaseInterceptor.to("MoveEndPhase");

    expect(enemyPokemon).not.toHaveStatusEffect(StatusEffect.BURN);
  });

  it("should cause incoming attacks to not activate Counter", async () => {
    game.override.enemyMoveset(MoveId.TACKLE).moveset([MoveId.COUNTER]);

    await game.classicMode.startBattle(SpeciesId.BLASTOISE);

    const playerPokemon = game.field.getPlayerPokemon();
    const enemyPokemon = game.field.getEnemyPokemon();

    playerPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, playerPokemon.id);

    game.move.select(MoveId.COUNTER);

    await game.phaseInterceptor.to("BerryPhase", false);

    expect(playerPokemon).toHaveUsedMove({ move: MoveId.COUNTER, result: MoveResult.FAIL });
    expect(enemyPokemon).toHaveFullHp();
  });

  it("should prevent Sappy Seed from applying its Leech Seed effect to the user", async () => {
    game.override.enemyMoveset(MoveId.SAPPY_SEED);

    await game.classicMode.startBattle(SpeciesId.CHARIZARD);

    const playerPokemon = game.field.getPlayerPokemon();

    playerPokemon.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, playerPokemon.id);

    game.move.select(MoveId.SPLASH);

    game.setTurnOrder([BattlerIndex.ENEMY, BattlerIndex.PLAYER]); // enemy uses Sappy Seed first
    await game.move.forceHit(); // forces Sappy Seed to hit
    await game.phaseInterceptor.to("MoveEndPhase");

    expect(playerPokemon).not.toHaveBattlerTag(BattlerTagType.SEEDED);
  });

  describe("MockSprite render node data", () => {
    function createSprite(): MockSprite {
      return game.scene.add.sprite(0, 0, "sub") as unknown as MockSprite;
    }

    it("should raise a TypeError when writing render data for a render node the sprite was not assigned", () => {
      const sprite = createSprite();
      const writeTone = () => sprite.setRenderNodeData("SpriteSubmitter", "tone", [1, 0, 0, 0]);

      expect(writeTone).toThrow(TypeError);
      expect(writeTone).toThrow(/Cannot set properties of undefined/);
    });

    it("should store render data assigned through setRenderNodeRole and delete the key when the value is undefined", () => {
      const sprite = createSprite();
      const renderNode = game.scene.spriteSubmitter;

      sprite.setRenderNodeRole("Submitter", renderNode);
      sprite.setRenderNodeData(renderNode, "tone", [1, 2, 3, 4]);

      expect(sprite.renderNodeData[renderNode.name].tone).toEqual([1, 2, 3, 4]);

      sprite.setRenderNodeData(renderNode, "tone", undefined);

      expect(sprite.renderNodeData[renderNode.name]).not.toHaveProperty("tone");
    });
  });

  it("should fail if the user has 1 max HP", async () => {
    await game.classicMode.startBattle(SpeciesId.SHEDINJA);

    const player = game.field.getPlayerPokemon();

    game.move.use(MoveId.SUBSTITUTE);
    await game.toEndOfTurn();

    expect(player).toHaveUsedMove({ move: MoveId.SUBSTITUTE, result: MoveResult.FAIL });
    expect(player).not.toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
    expect(player).toHaveFullHp();
    expect(player).toHaveHp(1);
  });

  describe("hitting a Substitute doll", () => {
    /**
     * The doll absorbed the hit when its HP dropped, or it broke and was removed.
     * The protected Pokemon's HP must be the same as it was before that hit.
     */
    function expectDollAbsorbedHit(pokemon: Pokemon, hpBeforeHit: number, dollHpBeforeHit: number): void {
      expect(pokemon.hp).toBe(hpBeforeHit);
      const doll = pokemon.getTag(SubstituteTag);
      if (doll) {
        expect(doll.hp).toBeLessThan(dollHpBeforeHit);
      } else {
        expect(pokemon).not.toHaveBattlerTag(BattlerTagType.SUBSTITUTE);
      }
    }

    it("should finish the turn when Heat Wave hits a Passimian Substitute and the other enemy has fainted", async () => {
      vi.spyOn(allMoves[MoveId.HEAT_WAVE], "chance", "get").mockReturnValue(0);
      game.override
        .battleStyle("double")
        .enemySpecies(SpeciesId.PASSIMIAN)
        .enemyMoveset(MoveId.SPLASH)
        .criticalHits(false);

      await game.classicMode.startBattle(SpeciesId.CHARIZARD, SpeciesId.MAGIKARP);

      const otherEnemy = game.scene.getEnemyField()[1];
      otherEnemy.hp = 1;

      game.move.use(MoveId.TACKLE, BattlerIndex.PLAYER, BattlerIndex.ENEMY_2);
      game.move.use(MoveId.SPLASH, BattlerIndex.PLAYER_2);
      await game.move.selectEnemyMove(MoveId.SPLASH);
      await game.move.selectEnemyMove(MoveId.SPLASH);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.PLAYER_2, BattlerIndex.ENEMY, BattlerIndex.ENEMY_2]);
      await game.move.forceHit();
      await game.toNextTurn();

      expect(otherEnemy.isFainted()).toBe(true);

      const passimian = game.field.getEnemyPokemon();
      passimian.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, passimian.id);
      const hpBeforeHit = passimian.hp;
      const dollHpBeforeHit = passimian.getTag(SubstituteTag)!.hp;

      game.move.use(MoveId.HEAT_WAVE, BattlerIndex.PLAYER);
      game.move.use(MoveId.SPLASH, BattlerIndex.PLAYER_2);
      await game.move.selectEnemyMove(MoveId.SPLASH);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.PLAYER_2, BattlerIndex.ENEMY]);
      await game.move.forceHit();
      await game.toEndOfTurn();

      expectDollAbsorbedHit(passimian, hpBeforeHit, dollHpBeforeHit);
    });

    it("should finish the turn when Heat Wave hits a Substitute while both enemies are alive", async () => {
      vi.spyOn(allMoves[MoveId.HEAT_WAVE], "chance", "get").mockReturnValue(0);
      game.override
        .battleStyle("double")
        .enemySpecies(SpeciesId.PASSIMIAN)
        .enemyMoveset(MoveId.SPLASH)
        .criticalHits(false);

      await game.classicMode.startBattle(SpeciesId.CHARIZARD, SpeciesId.MAGIKARP);

      const passimian = game.field.getEnemyPokemon();
      passimian.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, passimian.id);
      const hpBeforeHit = passimian.hp;
      const dollHpBeforeHit = passimian.getTag(SubstituteTag)!.hp;

      game.move.use(MoveId.HEAT_WAVE, BattlerIndex.PLAYER);
      game.move.use(MoveId.SPLASH, BattlerIndex.PLAYER_2);
      await game.move.selectEnemyMove(MoveId.SPLASH);
      await game.move.selectEnemyMove(MoveId.SPLASH);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.PLAYER_2, BattlerIndex.ENEMY, BattlerIndex.ENEMY_2]);
      await game.move.forceHit();
      await game.toEndOfTurn();

      expectDollAbsorbedHit(passimian, hpBeforeHit, dollHpBeforeHit);
    });

    it("should finish the turn when Tackle hits an enemy Snorlax's Substitute", async () => {
      game.override.criticalHits(false);

      await game.classicMode.startBattle(SpeciesId.MACHAMP);

      const snorlax = game.field.getEnemyPokemon();
      snorlax.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, snorlax.id);
      const hpBeforeHit = snorlax.hp;
      const dollHpBeforeHit = snorlax.getTag(SubstituteTag)!.hp;

      game.move.use(MoveId.TACKLE);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.ENEMY]);
      await game.move.forceHit();
      await game.toEndOfTurn();

      expectDollAbsorbedHit(snorlax, hpBeforeHit, dollHpBeforeHit);
    });

    it("should finish the turn when an enemy Tackle hits the player's Substitute", async () => {
      game.override.enemyMoveset(MoveId.TACKLE).criticalHits(false);

      await game.classicMode.startBattle(SpeciesId.SNORLAX);

      const player = game.field.getPlayerPokemon();
      player.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, player.id);
      const hpBeforeHit = player.hp;
      const dollHpBeforeHit = player.getTag(SubstituteTag)!.hp;

      game.move.use(MoveId.SPLASH);
      game.setTurnOrder([BattlerIndex.ENEMY, BattlerIndex.PLAYER]);
      await game.move.forceHit();
      await game.toEndOfTurn();

      expectDollAbsorbedHit(player, hpBeforeHit, dollHpBeforeHit);
    });

    it("should play a target frame against a Substitute doll without writing spriteSubmitter data", async () => {
      game.override.criticalHits(false);
      await game.classicMode.startBattle(SpeciesId.MACHAMP);

      const snorlax = game.field.getEnemyPokemon();
      snorlax.addTag(BattlerTagType.SUBSTITUTE, 0, MoveId.NONE, snorlax.id);

      game.move.use(MoveId.TACKLE);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.ENEMY]);
      await game.move.forceHit();

      const doll = snorlax.getTag(SubstituteTag)?.sprite as MockSprite | undefined;
      expect(doll).toBeDefined();

      settings.update("display", "enableMoveAnimations", true);
      vi.spyOn(MoveAnim.prototype, "getAnim").mockReturnValue({
        frames: [
          [
            {
              x: 0,
              y: 0,
              zoomX: 100,
              zoomY: 100,
              angle: 0,
              mirror: false,
              visible: true,
              blendType: AnimBlendType.NORMAL,
              target: AnimFrameTarget.TARGET,
              opacity: 255,
              tone: [1, 0, 0, 0],
              locked: false,
              priority: 0,
              focus: AnimFocus.TARGET,
            },
          ],
        ],
        frameTimedEvents: new Map(),
      } as unknown as ReturnType<MoveAnim["getAnim"]>);

      const counters: Phaser.Types.Tweens.NumberTweenBuilderConfig[] = [];
      const tween = undefined as unknown as Phaser.Tweens.Tween;
      vi.spyOn(game.scene.tweens, "addCounter").mockImplementation(config => {
        if (typeof config.onRepeat === "function" && (config.repeat ?? 0) > 0) {
          counters.push(config);
        } else {
          config.onComplete?.(tween, []);
        }
        return { remove: vi.fn() } as unknown as Phaser.Tweens.Tween;
      });

      const copies: MockSprite[] = [];
      const addFieldSprite = game.scene.addFieldSprite.bind(game.scene);
      vi.spyOn(game.scene, "addFieldSprite").mockImplementation((...args) => {
        const sprite = addFieldSprite(...args);
        copies.push(sprite as unknown as MockSprite);
        return sprite;
      });

      let completed = false;
      const originalPlay = MoveAnim.prototype.play;
      vi.spyOn(MoveAnim.prototype, "play").mockImplementation(function (
        this: MoveAnim,
        onSubstitute?: boolean,
        callback?: () => void,
      ) {
        return originalPlay.call(this, onSubstitute, () => {
          completed = true;
          callback?.();
        });
      });

      const phase = game.scene.phaseManager.getCurrentPhase() as MoveEffectPhase;
      phase.start();

      expect(counters).toHaveLength(1);
      counters[0].onRepeat?.(tween, undefined, "", 0, 0);
      counters[0].onComplete?.(tween, []);

      expect(completed).toBe(true);
      expect(doll!.renderNodeData[game.scene.spriteSubmitter.name]).toBeUndefined();
      expect(copies.length).toBeGreaterThan(0);
      for (const copy of copies) {
        expect(copy.renderNodeData[game.scene.spriteSubmitter.name]).toBeUndefined();
      }
    });

    it("should reset tone on a Pokemon sprite after a move animation when it has no Substitute", async () => {
      game.override.criticalHits(false);
      await game.classicMode.startBattle(SpeciesId.MACHAMP);

      const snorlax = game.field.getEnemyPokemon();
      const sprite = snorlax.getSprite() as unknown as MockSprite;
      sprite.setRenderNodeData(game.scene.spriteSubmitter, "tone", [1, 2, 3, 4]);

      game.move.use(MoveId.TACKLE);
      game.setTurnOrder([BattlerIndex.PLAYER, BattlerIndex.ENEMY]);
      await game.move.forceHit();
      await game.toEndOfTurn();

      expect(sprite.renderNodeData[game.scene.spriteSubmitter.name].tone).toEqual([0, 0, 0, 0]);
    });
  });
});
