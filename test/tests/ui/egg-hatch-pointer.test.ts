/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EggHatchSceneUiHandler } from "#ui/egg-hatch-scene-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - egg hatch scene pointer", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggHatchSceneUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.EGG_HATCH_SCENE);
    handler = game.scene.ui.getHandler() as EggHatchSceneUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
  });
  function click() {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("dispatches ACTION once and preserves the original skip flow", () => {
    const skip = vi.fn(() => true);
    const phase = game.scene.phaseManager.getCurrentPhase();
    vi.spyOn(phase, "is").mockReturnValue(true);
    Object.assign(phase, { trySkip: skip });
    click();
    expect(skip).toHaveBeenCalledOnce();
  });
  it("uses the message flow when skipping is unavailable", () => {
    const message = vi.spyOn(game.scene.ui.getMessageHandler(), "processInput").mockReturnValue(true);
    click();
    expect(message).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("checks phase skip only once before revealing or confirming a message", () => {
    const skip = vi.fn(() => false);
    const phase = game.scene.phaseManager.getCurrentPhase();
    vi.spyOn(phase, "is").mockReturnValue(true);
    Object.assign(phase, { trySkip: skip });
    const done = vi.fn();
    game.scene.ui.getMessageHandler().showText("Typing", 20, done, null, true);
    click();
    expect(skip).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    click();
    expect(skip).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledOnce();
  });
  it("dispatches the same CANCEL on right click", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it.each(["touch", "middle", "upper", "transition"])("blocks %s", kind => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    click();
    expect(input).not.toHaveBeenCalled();
  });
  it("does not use wheel and removes old listeners on reopening", () => {
    const old = handler["pointerTargets"]!.zones[0];
    const input = vi.spyOn(game.scene.ui, "processInput");
    old.emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    handler.clear();
    handler.show([]);
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
});
