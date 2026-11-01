import { BattleType } from "#enums/battle-type";
import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { FightUiHandler } from "#ui/fight-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - fight pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: FightUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("single").moveset([MoveId.TACKLE, MoveId.GROWL]);
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    await game.scene.ui.setMode(UiMode.FIGHT, 0);
    handler = game.scene.ui.handlers[UiMode.FIGHT] as FightUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function click(name: string) {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === name)!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("updates move information without confirming, then uses ACTION with the tera source intact", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    handler["fromCommand"] = Command.TERA;
    click("fight-1");
    expect(handler.getCursor()).toBe(1);
    expect(handler["fromCommand"]).toBe(Command.TERA);
    expect(action).not.toHaveBeenCalled();
    click("fight-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("confirms the preselected move through the real command validation and retains failures", () => {
    const phase = game.scene.phaseManager.getCurrentPhase();
    if (!phase.is("CommandPhase")) {
      throw new Error("Expected CommandPhase");
    }
    const command = vi.spyOn(phase, "handleCommand").mockReturnValue(false);
    const error = vi.spyOn(game.scene.ui, "playError");
    click("fight-0");
    expect(command).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    expect(handler.active).toBe(true);
  });
  it("consumes empty slots and hidden move rows without selecting or confirming", () => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("fight-3");
    handler["movesContainer"].visible = false;
    click("fight-1");
    expect(handler.getCursor()).toBe(0);
    expect(action).not.toHaveBeenCalled();
  });
  it("right click reuses the mystery encounter cancellation restriction", () => {
    game.scene.currentBattle.battleType = BattleType.MYSTERY_ENCOUNTER;
    const encounter = { skipToFightInput: true };
    game.scene.currentBattle.mysteryEncounter = encounter as never;
    pointer.buttons = 2;
    click("fight-panel");
    expect(game.scene.ui.mode).toBe(UiMode.FIGHT);
    encounter.skipToFightInput = false;
    click("fight-panel");
    expect(game.scene.ui.mode).toBe(UiMode.COMMAND);
  });
  it.each(["transition", "upper", "touch", "middle"])("blocks %s input", kind => {
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.MENU]);
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click("fight-1");
    expect(handler.getCursor()).toBe(0);
  });
  it("removes hit areas and frame listener on clear", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    handler.show([0]);
    expect(handler["pointerTargets"]!.zones).toHaveLength(5);
    handler.destroy();
    expect(handler["pointerTargets"]).toBeNull();
  });
});
