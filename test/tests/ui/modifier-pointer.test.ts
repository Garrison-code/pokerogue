import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { ShopCursorTarget } from "#enums/shop-cursor-target";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { SelectModifierPhase } from "#phases/select-modifier-phase";
import { GameManager } from "#test/framework/game-manager";
import { initSceneWithoutEncounterPhase } from "#test/utils/game-manager-utils";
import type { ModifierSelectUiHandler } from "#ui/modifier-select-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - modifier pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: ModifierSelectUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    initSceneWithoutEncounterPhase(game.scene, [SpeciesId.ABRA, SpeciesId.VOLCARONA]);
    settings.update("display", "shopCursorTarget", ShopCursorTarget.REWARDS);
    game.scene.phaseManager.unshiftPhase(new SelectModifierPhase());
    await game.phaseInterceptor.to("SelectModifierPhase");
    handler = game.scene.ui.handlers[UiMode.MODIFIER_SELECT] as ModifierSelectUiHandler;
    await vi.waitFor(() => expect(handler["awaitingActionInput"]).toBe(true));
    for (const button of handler["getButtons"]()) {
      button.setAlpha(1);
    }
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
    handler.tutorialActive = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function click(name = "modifier-1-0") {
    const target = handler["pointerTargets"]!.zones.find(z => z.name === name)!;
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects different rewards and confirms the selected reward exactly once", () => {
    const callback = vi.fn(() => true);
    handler["onActionInput"] = callback;
    click("modifier-1-1");
    expect(handler.getCursor()).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    click("modifier-1-1");
    click("modifier-1-1");
    expect(callback).toHaveBeenCalledExactlyOnceWith(1, 1);
  });
  it("allows the initial selection and restores readiness after failure", () => {
    const callback = vi.fn(() => false);
    handler["onActionInput"] = callback;
    click();
    click();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(handler["awaitingActionInput"]).toBe(true);
  });
  it("selects the actual shop row and column rather than remapping the cursor", () => {
    const callback = vi.fn(() => false);
    handler["onActionInput"] = callback;
    const row = handler.shopOptionsRows.length + 1;
    expect(row).toBeGreaterThan(1);
    click(`modifier-${row}-0`);
    expect(handler["rowCursor"]).toBe(row);
    expect(callback).not.toHaveBeenCalled();
    click(`modifier-${row}-0`);
    expect(callback).toHaveBeenCalledExactlyOnceWith(row, 0);
  });
  it("uses two stages for the team button and ignores hidden buttons", () => {
    const callback = vi.fn(() => false);
    handler["onActionInput"] = callback;
    handler["transferButtonContainer"].visible = false;
    click("modifier-button-1");
    expect(handler["rowCursor"]).toBe(1);
    click("modifier-button-2");
    expect(handler["rowCursor"]).toBe(0);
    expect(handler.getCursor()).toBe(2);
    expect(callback).not.toHaveBeenCalled();
    click("modifier-button-2");
    expect(callback).toHaveBeenCalledExactlyOnceWith(0, 2);
  });
  it("does not select or confirm while reveal input is locked or the info overlay covers products", () => {
    const callback = vi.fn(() => false);
    handler["onActionInput"] = callback;
    handler["awaitingActionInput"] = false;
    click("modifier-1-1");
    expect(handler.getCursor()).toBe(0);
    handler["awaitingActionInput"] = true;
    handler["moveInfoOverlay"].visible = true;
    click("modifier-1-1");
    expect(handler.getCursor()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });
  it.each([true, false])("right click matches player=%s keyboard CANCEL", player => {
    const callback = vi.fn(() => false);
    handler["onActionInput"] = callback;
    handler["player"] = player;
    pointer.buttons = 2;
    click("modifier-page");
    expect(callback.mock.calls).toEqual(player ? [[-1, -1]] : []);
    handler["awaitingActionInput"] = true;
    handler["onActionInput"] = callback;
    handler.processInput(Button.CANCEL);
    expect(callback).toHaveBeenCalledTimes(player ? 2 : 0);
  });
  it.each(["upper", "transition", "tutorial", "touch", "middle"])("blocks %s input", kind => {
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.PARTY]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "tutorial") {
      handler.tutorialActive = true;
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click("modifier-1-1");
    expect(handler.getCursor()).toBe(0);
  });
  it("ignores wheel events and reuses targets on an active return", () => {
    const targets = handler["pointerTargets"]!;
    targets.zones[0].emit("wheel", pointer, 0, 999, 0, { stopPropagation: vi.fn() });
    expect(handler.getCursor()).toBe(0);
    handler.show([true, handler.options.map(o => o.modifierTypeOption), vi.fn(), 250]);
    expect(handler["pointerTargets"]).toBe(targets);
  });
  it("maps both shop rows after rebuilding and retains only the new targets", async () => {
    const options = handler.options.map(o => o.modifierTypeOption);
    const oldTargets = handler["pointerTargets"]!;
    handler.clear();
    game.scene.currentBattle.waveIndex = 121;
    const callback = vi.fn(() => false);
    handler.show([true, options, callback, 250]);
    await vi.waitFor(() => expect(handler["awaitingActionInput"]).toBe(true));
    expect(oldTargets.zones).toHaveLength(0);
    expect(handler.shopOptionsRows).toHaveLength(2);
    click("modifier-3-0");
    click("modifier-3-0");
    click("modifier-2-1");
    click("modifier-2-1");
    expect(callback.mock.calls).toEqual([
      [3, 0],
      [2, 1],
    ]);
  });
  it("confirms Continue without rewards or shop and invalidates old reveal callbacks", async () => {
    handler.clear();
    game.scene.currentBattle.waveIndex = 10;
    const delayed = vi.spyOn(game.scene.time, "delayedCall");
    handler.show([true, [], vi.fn(), -1]);
    const oldReveal = delayed.mock.calls[0]![1];
    handler.clear();
    const callback = vi.fn(() => false);
    handler.show([true, [], callback, -1]);
    await vi.waitFor(() => expect(handler["awaitingActionInput"]).toBe(true));
    oldReveal();
    handler["continueButtonContainer"].setAlpha(1);
    click("modifier-button-4");
    expect(callback).toHaveBeenCalledExactlyOnceWith(1, 0);
  });
  it("removes targets and timers on clear and destroy", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    expect(handler["displayTimers"]).toHaveLength(0);
    expect(handler["awaitingActionInput"]).toBe(false);
    handler.destroy();
  });
});
