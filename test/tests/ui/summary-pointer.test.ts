import { allMoves } from "#data/data-lists";
import { Button } from "#enums/buttons";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { type SummaryUiHandler, SummaryUiMode } from "#ui/summary-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - summary pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: SummaryUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("single").moveset([MoveId.TACKLE, MoveId.GROWL]);
    await game.classicMode.startBattle(SpeciesId.BULBASAUR, SpeciesId.CHARMANDER);
    await game.scene.ui.setMode(UiMode.SUMMARY, game.scene.getPlayerParty()[0]);
    handler = game.scene.ui.handlers[UiMode.SUMMARY] as SummaryUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function zone(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === name)!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(dy: number) {
    zone("summary-page").emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  function moves() {
    handler["moveSelect"] = false;
    handler.setCursor(2);
    handler["transitioning"] = false;
    handler.showMoveSelect();
  }
  it("routes page arrows through LEFT and RIGHT, without adding unavailable directions", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("summary-page--1");
    expect(action).not.toHaveBeenCalled();
    click("summary-page-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.RIGHT);
  });
  it("routes each wheel event to the existing UP or DOWN", () => {
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    wheel(-999);
    wheel(999);
    wheel(0);
    expect(action.mock.calls).toEqual([[Button.UP], [Button.DOWN]]);
  });
  it("switches party members only when the keyboard flow permits it", () => {
    game.scene.ui.handlers[UiMode.PARTY].active = true;
    wheel(120);
    expect(handler["pokemon"]).toBe(game.scene.getPlayerParty()[1]);
    wheel(120);
    expect(handler["pokemon"]).toBe(game.scene.getPlayerParty()[1]);
    wheel(-120);
    expect(handler["pokemon"]).toBe(game.scene.getPlayerParty()[0]);
    game.scene.ui.handlers[UiMode.PARTY].active = false;
  });
  it("selects moves separately from ACTION, consumes empty rows, and allows keyboard-selected confirmation", () => {
    moves();
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("summary-move-1");
    expect(handler["moveCursor"]).toBe(1);
    expect(action).not.toHaveBeenCalled();
    click("summary-move-3");
    expect(handler["moveCursor"]).toBe(1);
    click("summary-move-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("enters move selection on the first click without confirming the newly selected row", () => {
    moves();
    handler.hideMoveSelect();
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("summary-move-1");
    expect(handler["moveSelect"]).toBe(true);
    expect(handler["moveCursor"]).toBe(1);
    expect(action).not.toHaveBeenCalled();
  });
  it("wheel in move selection keeps the original five-row keyboard cycle", () => {
    moves();
    wheel(-120);
    expect(handler["moveCursor"]).toBe(4);
    wheel(120);
    expect(handler["moveCursor"]).toBe(0);
  });
  it("retains learn move indexes and the original decline callback", () => {
    const callback = vi.fn();
    handler.clear();
    handler.show([game.scene.getPlayerParty()[0], SummaryUiMode.LEARN_MOVE, allMoves[MoveId.SPLASH], callback]);
    click("summary-move-0");
    expect(callback).not.toHaveBeenCalled();
    click("summary-move-0");
    expect(callback).toHaveBeenLastCalledWith(0);
    handler.setCursor(4);
    click("summary-move-4");
    expect(callback).toHaveBeenLastCalledWith(4);
  });
  it("reorders moves only after selecting and confirming the destination", () => {
    moves();
    handler["selectedMoveIndex"] = 0;
    const pokemon = game.scene.getPlayerParty()[0];
    const before = pokemon.moveset.slice();
    click("summary-move-1");
    expect(pokemon.moveset).toEqual(before);
    click("summary-move-1");
    expect(pokemon.moveset[0]).toBe(before[1]);
    expect(pokemon.moveset[1]).toBe(before[0]);
    expect(handler["selectedMoveIndex"]).toBe(-1);
  });
  it("opens the original move options once and blocks the background while they are shown", () => {
    moves();
    click("summary-move-0");
    expect(game.scene.ui.mode).toBe(UiMode.OPTION_SELECT);
    const before = handler["moveCursor"];
    click("summary-move-1");
    expect(handler["moveCursor"]).toBe(before);
  });
  it("right click forwards CANCEL without selecting and exits move selection before leaving", () => {
    moves();
    pointer.buttons = 2;
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("summary-move-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler["moveSelect"]).toBe(false);
    expect(handler.active).toBe(true);
  });
  it("uses ACTION for the IV toggle", () => {
    handler.setCursor(1);
    handler["transitioning"] = false;
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("summary-info-toggle");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it.each(["transition", "page transition", "upper", "touch", "middle"])("blocks %s input", kind => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "page transition") {
      handler["transitioning"] = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click("summary-page-1");
    if (kind !== "middle") {
      wheel(120);
    }
    expect(action).not.toHaveBeenCalled();
  });
  it("removes hit areas, arrows and timers on clear and allows clean reopen", () => {
    moves();
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    expect(handler["pointerArrows"]).toHaveLength(0);
    expect(handler["moveCursorBlinkTimer"]).toBeNull();
    expect(handler["transitioning"]).toBe(false);
    handler.show([game.scene.getPlayerParty()[0]]);
    expect(handler["pointerTargets"]!.zones).toHaveLength(9);
    handler.destroy();
    expect(handler["pointerTargets"]).toBeNull();
  });
});
