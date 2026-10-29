/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { AchvsUiHandler } from "#ui/achvs-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - achievements pointer browsing", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: AchvsUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    Object.defineProperty(
      (game.scene.ui.handlers[UiMode.ACHIEVEMENTS] as AchvsUiHandler)["headerActionButton"],
      "displayWidth",
      { configurable: true, value: 16 },
    );
    Object.assign((game.scene.ui.handlers[UiMode.ACHIEVEMENTS] as AchvsUiHandler)["mainContainer"], {
      update: vi.fn(),
    });
    await game.scene.ui.setOverlayMode(UiMode.ACHIEVEMENTS);
    handler = game.scene.ui.getHandler() as AchvsUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    if (handler) {
      handler.tutorialActive = false;
    }
    game.scene.ui["overlayActive"] = false;
  });
  function zone(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `achievements-${name}`)!;
  }
  function click(name: string) {
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
  }
  it("only selects icons, including repeated clicks", () => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("cell-3");
    click("cell-3");
    expect(handler.getCursor()).toBe(3);
    expect(action).not.toHaveBeenCalled();
  });
  it("preserves selection when browsing and restores keyboard navigation", () => {
    click("cell-2");
    zone("grid").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(handler["pointerSelected"]).toBe(2);
    expect(handler["cursorObj"]!.visible).toBe(false);
    handler.processInput(Button.RIGHT);
    expect(handler["pointerSelected"]).toBe(3);
    expect(handler["scrollCursor"]).toBe(0);
  });
  it("can switch or close while its selected icon is offscreen", () => {
    click("cell-2");
    zone("grid").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(() => click("switch")).not.toThrow();
    expect(() => handler.clear()).not.toThrow();
  });
  it("uses the header ACTION to switch pages and reset selection", () => {
    click("cell-3");
    click("switch");
    expect(handler["currentPage"]).toBe(1);
    expect(handler.getCursor()).toBe(0);
    expect(handler["pointerSelected"]).toBe(0);
    click("switch");
    expect(handler["currentPage"]).toBe(0);
  });
  it("routes right click through CANCEL and removes old targets", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const old = zone("grid");
    handler.clear();
    handler.show([]);
    expect(old.listenerCount("wheel")).toBe(0);
  });
  it.each(["touch", "middle", "upper", "tutorial", "transition"])("blocks %s", kind => {
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
    }
    if (kind === "tutorial") {
      handler.tutorialActive = true;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    click("cell-2");
    expect(handler.getCursor()).toBe(0);
  });
});
