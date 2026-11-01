/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { LoadingModalUiHandler } from "#ui/loading-modal-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - loading pointer shielding", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: LoadingModalUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.LOADING, { buttonActions: [] });
    handler = game.scene.ui.getHandler() as LoadingModalUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  it("consumes body and outside inputs without closing", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    handler["backdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    handler["backdrop"]!.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(3);
    expect(input).not.toHaveBeenCalled();
    expect(handler.active).toBe(true);
  });
  it("forwards only right body clicks to the original no-op CANCEL", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    pointer.buttons = 2;
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.processInput(Button.CANCEL)).toBe(false);
    expect(handler.active).toBe(true);
  });
  it.each(["touch", "middle", "upper", "transition"])("ignores %s", kind => {
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    const input = vi.spyOn(game.scene.ui, "processInput");
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
  });
  it.each(["clear", "reopen", "destroy"])("cancels operation timers on %s and ignores obsolete callbacks", kind => {
    let fire!: () => void;
    const remove = vi.fn();
    vi.spyOn(game.scene.time, "delayedCall").mockImplementation((_delay, callback) => {
      fire = () => callback?.();
      return { remove } as unknown as Phaser.Time.TimerEvent;
    });
    const done = vi.fn();
    const generation = handler.displayId;
    handler.addOperationTimer(2000, done);
    if (kind === "clear") {
      handler.clear();
    }
    if (kind === "reopen") {
      handler.show([{ buttonActions: [] }]);
    }
    if (kind === "destroy") {
      handler.destroy();
    }
    expect(remove).toHaveBeenCalledOnce();
    expect(handler.displayId).not.toBe(generation);
    fire();
    expect(done).not.toHaveBeenCalled();
  });
  it("completes an owned timer while its display is current", () => {
    let fire!: () => void;
    vi.spyOn(game.scene.time, "delayedCall").mockImplementation((_delay, callback) => {
      fire = () => callback?.();
      return { remove: vi.fn() } as unknown as Phaser.Time.TimerEvent;
    });
    const done = vi.fn();
    handler.addOperationTimer(2000, done);
    fire();
    expect(done).toHaveBeenCalledOnce();
  });
  it("cleans old zones when reopened", () => {
    const old = handler["pointerTargets"]!.zones[0];
    handler.show([{ buttonActions: [] }]);
    expect(old.listenerCount("pointerdown")).toBe(0);
    expect(handler["pointerTargets"]!.zones).toHaveLength(1);
  });
  it("invalidates old fade callbacks and completes the current operation once", () => {
    let complete!: () => void;
    vi.spyOn(game.scene.tweens, "add").mockImplementation(config => {
      complete = () => (config as Phaser.Types.Tweens.TweenBuilderConfig).onComplete?.({} as Phaser.Tweens.Tween, []);
      return { remove: vi.fn(), destroy: vi.fn() } as unknown as Phaser.Tweens.Tween;
    });
    const done = vi.fn();
    handler.show([{ buttonActions: [], fadeOut: done }]);
    const old = complete;
    handler.clear();
    old();
    expect(done).not.toHaveBeenCalled();
    handler.show([{ buttonActions: [], fadeOut: done }]);
    complete();
    complete();
    expect(done).toHaveBeenCalledOnce();
  });
});
