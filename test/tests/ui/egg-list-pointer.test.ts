/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Egg } from "#data/egg";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EggListUiHandler } from "#ui/egg-list-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - egg list pointer browsing", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggListUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    game.scene.gameData.eggs = Array.from({ length: 120 }, () => new Egg());
    await game.scene.ui.setOverlayMode(UiMode.EGG_LIST);
    handler = game.scene.ui.getHandler() as EggListUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
  });
  function target(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `egg-list-${name}`)!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    target(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(dy: number) {
    target("grid").emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  it("selects cells without confirming and synchronizes keyboard movement", () => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    click("cell-3");
    click("cell-3");
    expect(handler.getCursor()).toBe(3);
    expect(action).not.toHaveBeenCalled();
    handler.processInput(Button.RIGHT);
    expect(handler.getCursor()).toBe(4);
  });
  it("preserves egg identity across wheel browsing", () => {
    click("cell-3");
    wheel(120);
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(11);
    expect(handler["cursorObj"].visible).toBe(false);
    wheel(-120);
    expect(handler.getCursor()).toBe(3);
    expect(handler["cursorObj"].visible).toBe(true);
  });
  it("updates details when a recycled cell has the same local index", () => {
    click("cell-3");
    wheel(120);
    const details = vi.spyOn(handler as unknown as { setEggDetails(index: number): void }, "setEggDetails");
    click("cell-3");
    expect(details).toHaveBeenCalledExactlyOnceWith(14);
  });
  it("selects the actual scrolled egg and stops at boundaries", () => {
    for (let i = 0; i < 10; i++) {
      wheel(120);
    }
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(22);
    click("cell-3");
    expect(handler.getCursor()).toBe(3);
    wheel(0);
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(22);
  });
  it("reveals an offscreen selection before applying a keyboard direction", () => {
    click("cell-3");
    wheel(120);
    wheel(120);
    handler.processInput(Button.RIGHT);
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(0);
    expect(handler.getCursor()).toBe(4);
  });
  it.each(["touch", "middle", "upper", "tutorial", "transition"])("ignores %s input", kind => {
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
    click("cell-3");
    expect(handler.getCursor()).toBe(0);
  });
  it("routes right click through CANCEL and removes old targets", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const old = target("grid");
    handler.clear();
    handler.show([]);
    expect(old.listenerCount("wheel")).toBe(0);
  });
  it("handles an empty list", () => {
    handler.clear();
    game.scene.gameData.eggs = [];
    handler.show([]);
    expect(handler["cursorObj"].visible).toBe(false);
    expect(handler["pointerTargets"]!.zones).toHaveLength(2);
    expect(handler.processInput(Button.DOWN)).toBe(false);
  });
});
