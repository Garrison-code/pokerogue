import { Button } from "#enums/buttons";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { BallUiHandler } from "#ui/ball-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - ball pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: BallUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("single");
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    await game.scene.ui.setModeWithoutClear(UiMode.BALL);
    handler = game.scene.ui.handlers[UiMode.BALL] as BallUiHandler;
    handler.setCursor(0);
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function zone(index = 0) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `ball-${index}`)!;
  }
  function click(index = 0) {
    const stopPropagation = vi.fn();
    zone(index).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(dy: number) {
    zone().emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  it("selects a row without confirming and confirms the selected row once", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(1);
    expect(handler.getCursor()).toBe(1);
    expect(action).not.toHaveBeenCalled();
    click(1);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("retains zero-count errors and unsuccessful command results", () => {
    const error = vi.spyOn(game.scene.ui, "playError");
    game.scene.pokeballCounts[0] = 0;
    click();
    expect(error).toHaveBeenCalledOnce();
    const phase = game.scene.phaseManager.getCurrentPhase();
    if (!phase.is("CommandPhase")) {
      throw new Error("Expected CommandPhase");
    }
    const command = vi.spyOn(phase, "handleCommand").mockReturnValue(false);
    game.scene.pokeballCounts[0] = 1;
    click();
    expect(command).toHaveBeenCalledOnce();
    expect(game.scene.ui.mode).toBe(UiMode.BALL);
  });
  it("moves one row per wheel event including empty rows and cancel without wrapping", () => {
    const count = Object.keys(game.scene.pokeballCounts).length;
    wheel(-999);
    expect(handler.getCursor()).toBe(0);
    wheel(999);
    expect(handler.getCursor()).toBe(1);
    for (let i = 0; i < 20; i++) {
      wheel(1);
    }
    expect(handler.getCursor()).toBe(count);
    wheel(0);
    expect(handler.getCursor()).toBe(count);
    handler.processInput(Button.DOWN);
    expect(handler.getCursor()).toBe(0);
  });
  it("right click cancels without selecting, including the selected cancel row", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click(2);
    expect(handler.getCursor()).toBe(0);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it.each(["transition", "upper", "touch", "middle"])("blocks %s input", kind => {
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.COMMAND]);
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click(1);
    if (kind !== "middle") {
      wheel(120);
    }
    expect(handler.getCursor()).toBe(0);
  });
  it("cleans targets and ball animation across reopen", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    handler.show([]);
    expect(handler["pointerTargets"]!.zones).toHaveLength(Object.keys(game.scene.pokeballCounts).length + 2);
    handler.destroy();
    expect(handler["pokeballWiggleTween"]).toBeNull();
  });
});
