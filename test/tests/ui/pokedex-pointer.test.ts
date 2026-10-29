/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PokedexUiHandler } from "#ui/pokedex-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - pokedex pointer controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PokedexUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.POKEDEX);
    handler = game.scene.ui.getHandler() as PokedexUiHandler;
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
    return handler["pointerTargets"]!.zones.find(z => z.name === `dex-${name}`)!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(name: string, dy: number) {
    zone(name).emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  it("selects a species before confirming and allows preselected confirmation", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("cell-3");
    expect(input).not.toHaveBeenCalled();
    click("cell-3");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("preserves species during wheel browsing and reveals it for keyboard", () => {
    click("cell-2");
    const id = handler["pointerSpecies"];
    wheel("grid", 120);
    expect(handler["pointerSpecies"]).toBe(id);
    expect(handler["cursorObj"].visible).toBe(false);
    handler.processInput(Button.RIGHT);
    expect(handler["scrollCursor"]).toBe(0);
    expect(handler.getCursor()).toBe(3);
  });
  it("does not confirm a different species in a recycled cell", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("cell-2");
    wheel("grid", 120);
    click("cell-2");
    expect(input).not.toHaveBeenCalled();
  });
  it("opens dropdowns directly and blocks grid wheel behind them", () => {
    click("filter-0");
    expect(handler["filterBar"].openDropDown).toBe(true);
    wheel("grid", 120);
    expect(handler["scrollCursor"]).toBe(0);
    click("cell-3");
    expect(handler["filterBar"].openDropDown).toBe(false);
    expect(handler["filterMode"]).toBe(true);
  });
  it("selects dropdown entries before executing ACTION", () => {
    click("filter-0");
    const drop = handler["filterBar"].getPointerTargets()[0].dropDown;
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("dropdown-0-2");
    expect(drop.cursor).toBe(2);
    expect(input).not.toHaveBeenCalled();
    click("dropdown-0-2");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("selects a text filter before opening search", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("search-2");
    expect(input).not.toHaveBeenCalled();
    click("search-2");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("clears selection when its species is filtered out", () => {
    click("cell-2");
    handler["pointerSpecies"] = null;
    handler.updateStarters();
    expect(handler["pointerSpecies"]).toBeNull();
    expect(handler["cursorObj"].visible).toBe(false);
  });
  it.each(["touch", "middle", "upper", "tutorial", "transition"])("blocks %s", kind => {
    const original = handler["pointerSpecies"];
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
    expect(handler["pointerSpecies"]).toBe(original);
  });
  it("routes right click unchanged and removes listeners on reopening", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const old = zone("page");
    handler.clear();
    handler.show([]);
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
});
