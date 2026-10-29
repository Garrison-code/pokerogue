import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { CommandUiHandler } from "#ui/command-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - command pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: CommandUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("single");
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    handler = game.scene.ui.handlers[UiMode.COMMAND] as CommandUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  function click(name: string) {
    const zone = handler["pointerTargets"]!.zones.find(z => z.name === name)!;
    const stopPropagation = vi.fn();
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects without confirming, then confirms through the existing ACTION", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("command-1");
    expect(handler.getCursor()).toBe(Command.BALL);
    expect(action).not.toHaveBeenCalled();
    click("command-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("confirms the preselected command and reuses keyboard selection", () => {
    handler.setCursor(Command.RUN);
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("command-3");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("right click uses CANCEL without selecting the clicked command", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("command-3");
    expect(handler.getCursor()).toBe(Command.FIGHT);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
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
    click("command-3");
    expect(handler.getCursor()).toBe(Command.FIGHT);
  });
  it("ignores hidden tera and preserves per-battler cursors", () => {
    click("command-tera");
    expect(handler.getCursor()).toBe(Command.FIGHT);
    const first = game.scene.getPlayerParty()[0];
    vi.spyOn(game.scene, "getField").mockReturnValue([first, first, null!, null!]);
    handler["fieldIndex"] = 1;
    click("command-3");
    handler["fieldIndex"] = 0;
    expect(handler.getCursor()).toBe(Command.FIGHT);
    handler["fieldIndex"] = 1;
    expect(handler.getCursor()).toBe(Command.RUN);
  });
  it("cleans regions and the frame listener on clear and reopen", () => {
    const targets = handler["pointerTargets"]!;
    const listeners = game.scene.events.listenerCount("preupdate");
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    expect(game.scene.events.listenerCount("preupdate")).toBe(listeners - 1);
    handler.show([0]);
    expect(handler["pointerTargets"]!.zones).toHaveLength(6);
    handler.destroy();
    expect(handler["pointerTargets"]).toBeNull();
  });
});
