import { Button } from "#enums/buttons";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { TargetSelectUiHandler } from "#ui/target-select-ui-handler";
import * as pointerUtils from "#ui/ui-pointer-targets";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - battle target pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: TargetSelectUiHandler;
  let pointer: Phaser.Input.Pointer;
  let callback: ReturnType<typeof vi.fn<(targets: number[]) => void>>;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("double");
    await game.classicMode.startBattle(SpeciesId.BULBASAUR, SpeciesId.CHARMANDER);
    // Headless object mocks omit world transforms; browser tests cover actual geometry.
    vi.spyOn(pointerUtils, "getPointerBounds").mockReturnValue({ x: 0, y: 0, width: 20, height: 20 });
    callback = vi.fn();
    await game.scene.ui.setMode(UiMode.TARGET_SELECT, 0, MoveId.TACKLE, callback);
    handler = game.scene.ui.handlers[UiMode.TARGET_SELECT] as TargetSelectUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function click(name = "target-info-3") {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === name)!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects an enemy from its info box then confirms once", () => {
    handler.setCursor(2);
    click();
    expect(handler.getCursor()).toBe(3);
    expect(callback).not.toHaveBeenCalled();
    click();
    expect(callback).toHaveBeenCalledExactlyOnceWith([3]);
  });
  it("confirms a preselected sprite and rejects invalid targets", () => {
    handler["targets"] = [2, 3];
    handler.setCursor(2);
    click("target-sprite-0");
    expect(callback).not.toHaveBeenCalled();
    expect(handler.getCursor()).toBe(2);
    click("target-sprite-2");
    expect(callback).toHaveBeenCalledExactlyOnceWith([2]);
  });
  it("confirms the entire highlighted group rather than a clicked member", () => {
    handler["isMultipleTargets"] = true;
    handler["targets"] = [2, 3];
    handler.setCursor(2);
    click();
    expect(callback).toHaveBeenCalledExactlyOnceWith([2, 3]);
    expect(handler.getCursor()).toBe(2);
  });
  it("right click forwards CANCEL and preserves its empty target callback", () => {
    pointer.buttons = 2;
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("target-field");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(callback).toHaveBeenCalledExactlyOnceWith([]);
  });
  it.each(["transition", "upper", "touch", "middle"])("blocks %s input", kind => {
    handler.setCursor(2);
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
    click();
    expect(handler.getCursor()).toBe(2);
    expect(callback).not.toHaveBeenCalled();
  });
  it("cleans regions and highlight tweens on clear and destroy", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    expect(handler["targetFlashTween"]).toBeFalsy();
    expect(handler["targetBattleInfoMoveTween"]).toHaveLength(0);
    handler.show([0, MoveId.TACKLE, callback, [3]]);
    expect(handler.getCursor()).toBe(3);
    expect(handler["pointerTargets"]!.zones).toHaveLength(9);
    handler.destroy();
    expect(handler["pointerTargets"]).toBeNull();
  });
});
