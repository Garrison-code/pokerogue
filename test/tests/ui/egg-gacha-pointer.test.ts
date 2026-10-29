/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EggGachaUiHandler } from "#ui/egg-gacha-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - egg gacha pointer controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggGachaUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    game.scene.gameData.eggs = [];
    await game.scene.ui.setOverlayMode(UiMode.EGG_GACHA);
    handler = game.scene.ui.getHandler() as EggGachaUiHandler;
    handler.setTransitioning(false);
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
  });
  function target(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `gacha-${name}`)!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    target(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects before confirming the existing pull count", () => {
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    click("option-3");
    expect(pull).not.toHaveBeenCalled();
    click("option-3");
    expect(pull).toHaveBeenCalledExactlyOnceWith(10);
  });
  it("confirms a preselected option and keeps capacity restrictions", () => {
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    game.scene.gameData.eggs.length = 99;
    click("option-0");
    expect(pull).not.toHaveBeenCalled();
    game.scene.gameData.eggs = [];
    click("option-0");
    expect(pull).toHaveBeenCalledExactlyOnceWith(1);
  });
  it("wheels through options without pulling or switching machines", () => {
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    const machine = handler["gachaCursor"];
    for (let i = 0; i < 10; i++) {
      target("option-0").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    }
    expect(handler.getCursor()).toBe(5);
    expect(handler["gachaCursor"]).toBe(machine);
    expect(pull).not.toHaveBeenCalled();
  });
  it("uses ACTION only to speed a transition or close a completed result", () => {
    handler.setTransitioning(true);
    click("page");
    expect(handler["transitionCancelled"]).toBe(true);
    click("page");
    expect(handler["transitionCancelled"]).toBe(true);
    handler.setTransitioning(false);
    handler["eggGachaSummaryContainer"].visible = true;
    const hide = vi.spyOn(handler, "hideSummary").mockImplementation(() => {});
    click("page");
    expect(hide).not.toHaveBeenCalled();
    handler["summaryFinished"] = true;
    click("page");
    expect(hide).toHaveBeenCalledOnce();
  });
  it("routes right click through CANCEL", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("option-2");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it.each(["touch", "middle", "upper", "tutorial", "transition"])("blocks %s", kind => {
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
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
    click("option-0");
    expect(pull).not.toHaveBeenCalled();
  });
  it("ignores a save completion from an old display", async () => {
    const save = Promise.withResolvers<boolean>();
    vi.spyOn(game.scene.gameData, "saveSystem").mockReturnValue(save.promise);
    const summary = vi.spyOn(handler, "showSummary");
    const pending = handler.pull(1);
    const old = target("page");
    handler.clear();
    handler.show([]);
    save.resolve(true);
    await pending;
    expect(summary).not.toHaveBeenCalled();
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
});
