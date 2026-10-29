import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { MenuButton } from "#ui/menu-button";
import type { MenuUiHandler } from "#ui/menu-ui-handler";
import { MessageUiHandler } from "#ui/message-ui-handler";
import i18next from "i18next";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - game menu mouse controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: MenuUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.MENU] as MenuUiHandler;
    await game.scene.ui.setOverlayMode(UiMode.MENU);
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
    handler.tutorialActive = false;
    game.scene.disableMenu = false;
    game.scene.ui["_mode"] = UiMode.TITLE;
  });
  function click(row: number) {
    const stopPropagation = vi.fn();
    handler["pointerRows"][row].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects a menu row before opening its existing destination", () => {
    const action = vi.spyOn(handler, "processInput");
    click(1);
    expect(handler.getCursor()).toBe(1);
    expect(action).not.toHaveBeenCalled();
    click(1);
    expect(action).toHaveBeenCalledWith(Button.ACTION);
    expect(game.scene.ui.mode).toBe(UiMode.ACHIEVEMENTS);
  });
  it("confirms the preselected settings entry", () => {
    click(0);
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_GENERAL);
  });
  it("consumes outside clicks and routes page right clicks to CANCEL", () => {
    const target = handler["pointerTargets"]!.zones[0];
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    pointer.buttons = 2;
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it("locks left selection and wheel while menu warning text is displayed", () => {
    handler.showText("Wait", 0);
    click(1);
    handler["pointerRows"][0].emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(handler.getCursor()).toBe(0);
    pointer.buttons = 2;
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(1);
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it.each(["upper", "transition", "tutorial", "touch", "middle"])("blocks %s input", kind => {
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
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
    click(1);
    expect(handler.getCursor()).toBe(0);
  });
  it("moves one row per wheel and stops at both boundaries", () => {
    const wheel = (dy: number) =>
      handler["pointerRows"][0].emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
    wheel(-120);
    expect(handler.getCursor()).toBe(0);
    for (let i = 0; i < 20; i++) {
      wheel(120);
    }
    expect(handler.getCursor()).toBe(handler["options"].length - 1);
    pointer.wasTouch = true;
    wheel(-120);
    expect(handler.getCursor()).toBe(handler["options"].length - 1);
  });
  it("locks the first frame of a warning before any characters are displayed", () => {
    handler.showText("Warning", 10);
    expect(handler.message.text).toBe("");
    click(1);
    expect(handler.getCursor()).toBe(0);
  });
  it.each([false, true])("ignores an export result after its submenu closes (reopen=%s)", async reopen => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof game.scene.gameData.getSession>>>();
    vi.spyOn(game.scene.gameData, "getSession").mockReturnValue(pending.promise);
    await game.scene.ui.setOverlayMode(UiMode.MENU_OPTION_SELECT, handler["manageDataConfig"]);
    const option = handler["manageDataConfig"].options.find(
      item => item.label === i18next.t("menuUiHandler:exportSession"),
    )!;
    option.handler();
    await game.scene.ui.revertMode();
    if (reopen) {
      await game.scene.ui.setOverlayMode(UiMode.MENU_OPTION_SELECT, handler["manageDataConfig"]);
    }
    pending.resolve(undefined);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(game.scene.ui.mode).toBe(reopen ? UiMode.MENU_OPTION_SELECT : UiMode.MENU);
    expect(handler.message.text).toBe("");
    game.scene.ui.handlers[UiMode.MENU_OPTION_SELECT].clear();
  });
  it("removes old page zones and prevents delayed messages updating a reopened menu", () => {
    const callback = vi.fn();
    let late: (() => void) | null | undefined;
    vi.spyOn(MessageUiHandler.prototype, "showText").mockImplementation((_text, _delay, cb) => {
      late = cb;
    });
    handler.showText("Wait", 0, callback, 1000);
    const oldCallback = late;
    const old = handler["pointerTargets"]!.zones[0];
    handler.clear();
    handler.show();
    expect(old.listenerCount("pointerdown")).toBe(0);
    expect(handler["canSelectWithPointer"]).toBe(true);
    oldCallback?.();
    expect(callback).not.toHaveBeenCalled();
  });
  it("guards the canvas entry and uses the same MENU and CANCEL paths", () => {
    game.scene.ui["_mode"] = UiMode.TITLE;
    game.scene.ui.handlers[UiMode.TITLE].active = true;
    const reserve = vi.spyOn(game.scene, "reserveMenuButtonSpace");
    const entry = new MenuButton();
    const zone = entry.getByName("mouse-menu-entry")!;
    const menu = vi.spyOn(game.scene.uiInputs, "buttonMenu").mockImplementation(() => {});
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(menu).toHaveBeenCalledOnce();
    pointer.buttons = 2;
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    game.scene.disableMenu = true;
    pointer.buttons = 1;
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(menu).toHaveBeenCalledOnce();
    entry.destroy();
    expect(reserve).toHaveBeenLastCalledWith(false);
  });
  it("shares MENU opening restrictions with the mouse entry", () => {
    const inputs = game.scene.uiInputs;
    game.scene.ui["_mode"] = UiMode.TITLE;
    expect(inputs.canOpenMenu()).toBe(true);
    game.scene.disableMenu = true;
    expect(inputs.canOpenMenu()).toBe(false);
    game.scene.disableMenu = false;
    game.scene.ui["_mode"] = UiMode.FIGHT;
    expect(inputs.canOpenMenu()).toBe(false);
    game.scene.ui["_mode"] = UiMode.MESSAGE;
    const message = game.scene.ui.getMessageHandler();
    message.pendingPrompt = true;
    vi.spyOn(message, "isTextAnimationInProgress").mockReturnValue(false);
    expect(inputs.canOpenMenu()).toBe(true);
    message.pendingPrompt = false;
    expect(inputs.canOpenMenu()).toBe(false);
  });
});
