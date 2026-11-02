/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { AutoCompleteUiHandler } from "#ui/autocomplete-ui-handler";
import type { TestDialogueUiHandler } from "#ui/test-dialogue-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - autocomplete pointer confirmation", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: AutoCompleteUiHandler;
  let pointer: Phaser.Input.Pointer;
  const callbacks = Array.from({ length: 12 }, () => vi.fn(() => true));
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.AUTO_COMPLETE, {
      options: callbacks.map((handler, i) => ({ label: `Candidate ${i}`, handler })),
      maxOptions: 5,
      modalContainer: game.scene.add.container(10, 20),
    });
    handler = game.scene.ui.getHandler() as AutoCompleteUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
    for (const cb of callbacks) {
      cb.mockClear();
    }
  });
  function click(row: number) {
    const stopPropagation = vi.fn();
    handler["pointerRows"][row].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects a candidate first and dispatches SUBMIT on the second click", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    click(2);
    expect(callbacks[2]).not.toHaveBeenCalled();
    click(2);
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.SUBMIT);
    expect(callbacks[2]).toHaveBeenCalledOnce();
  });
  it("accepts the preselected candidate once", () => {
    click(0);
    expect(callbacks[0]).toHaveBeenCalledOnce();
  });
  it("preserves CANCEL and ACTION as no-ops", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    pointer.buttons = 2;
    click(1);
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.processInput(Button.ACTION)).toBe(false);
    expect(callbacks.every(cb => cb.mock.calls.length === 0)).toBe(true);
  });
  it("keeps a failed candidate open with the original error sound", () => {
    callbacks[0].mockReturnValueOnce(false);
    const error = vi.spyOn(game.scene.ui, "playError");
    click(0);
    expect(handler.active).toBe(true);
    expect(error).toHaveBeenCalledOnce();
  });
  it("wheels to actual candidate indices without confirming", () => {
    for (let i = 0; i < 20; i++) {
      handler["pointerRows"][0].emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    }
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(11);
    expect(callbacks.every(cb => cb.mock.calls.length === 0)).toBe(true);
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
    click(0);
    expect(callbacks[0]).not.toHaveBeenCalled();
  });
  it("fills a candidate in the existing dialogue test host without submitting it", async () => {
    await game.scene.ui.revertMode();
    const submit = vi.fn();
    await game.scene.ui.setOverlayMode(UiMode.TEST_DIALOGUE, { buttonActions: [submit, vi.fn()] }, "");
    const host = game.scene.ui.getHandler() as TestDialogueUiHandler;
    const input = host["inputs"][0];
    const key = host.keys[0];
    input.text = key;
    input.emit("textchange", input, { data: "x", inputType: "insertText" });
    await Promise.resolve();
    expect(game.scene.ui.mode).toBe(UiMode.AUTO_COMPLETE);
    handler = game.scene.ui.getHandler() as AutoCompleteUiHandler;
    click(0);
    expect(input.text).toBe(key);
    expect(submit).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.TEST_DIALOGUE);
    host.clear();
  });
  it("only consumes backdrop events and clears parent ownership", () => {
    const stopPropagation = vi.fn();
    const input = vi.spyOn(game.scene.ui, "processInput");
    handler["backdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(input).not.toHaveBeenCalled();
    const old = handler["pointerRows"][0];
    handler.clear();
    expect(handler.parentModal).toBeUndefined();
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
});
