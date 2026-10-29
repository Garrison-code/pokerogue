/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { RenameRunFormUiHandler } from "#ui/rename-run-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - rename run pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: RenameRunFormUiHandler;
  let pointer: Phaser.Input.Pointer;
  let node: HTMLInputElement;
  const submit = vi.fn();
  const cancel = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.RENAME_RUN] as RenameRunFormUiHandler;
    node = document.createElement("input");
    node.maxLength = 20;
    document.body.append(node);
    Object.assign(handler["inputs"][0]!, { node, setFocus: vi.fn(() => node.focus()) });
    Object.defineProperty(handler["inputs"][0]!, "text", {
      configurable: true,
      get: () => node.value,
      set: value => {
        node.value = value;
      },
    });
    await game.scene.ui.setModeWithoutClear(UiMode.RENAME_RUN, { buttonActions: [submit, cancel] }, "Old name");
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    node.remove();
    submit.mockReset();
    cancel.mockReset();
  });
  function click(index = 0) {
    const event = { stopPropagation: vi.fn() };
    handler["onButtonPointer"](index, pointer, event as unknown as Phaser.Types.Input.EventData);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  }
  function bodyClick() {
    handler["pointerTargets"]!.zones[0]!.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
  }
  it.each(["  中文 Évoli  ", "", "   "])(
    "submits trimmed Unicode/empty name %s once with the original encoding",
    name => {
      expect(node.value).toBe("");
      node.value = name;
      click();
      click();
      expect(submit).toHaveBeenCalledExactlyOnceWith(btoa(encodeURIComponent(name.trim())));
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it.each(["button", "body", "input", "keyboard"])("shares cancellation from %s without submitting", source => {
    node.value = "Unsaved";
    if (source === "button") {
      click(1);
    }
    if (source === "body") {
      pointer.buttons = 2;
      bodyClick();
    }
    if (source === "input") {
      node.dispatchEvent(new MouseEvent("pointerdown", { button: 2, bubbles: true, cancelable: true }));
    }
    if (source === "keyboard") {
      game.scene.ui.processInput(Button.CANCEL);
    }
    game.scene.ui.processInput(Button.CANCEL);
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it("right click on Submit cancels without submitting", () => {
    pointer.buttons = 2;
    click();
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it("consumes outside clicks and wheel without closing", () => {
    const stop = vi.fn();
    handler["backdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation: stop });
    handler["backdrop"]!.emit("wheel", pointer, 0, 100, 0, { stopPropagation: stop });
    bodyClick();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each(["upper", "transition", "tween", "touch", "middle"])("blocks %s pointer input", kind => {
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.PARTY]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "tween") {
      vi.spyOn(game.scene.tweens, "getTweensOf").mockReturnValue([handler["tween"]!]);
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click();
    click(1);
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it("keeps text-editing keys inside the input and does not submit during IME composition", () => {
    const parent = vi.fn();
    document.body.addEventListener("keydown", parent);
    for (const key of ["x", "z", "Backspace", "ArrowLeft"]) {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    expect(parent).not.toHaveBeenCalled();
    node.dispatchEvent(new CompositionEvent("compositionstart"));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(submit).not.toHaveBeenCalled();
    node.dispatchEvent(new CompositionEvent("compositionend"));
    node.value = "中文";
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(submit).toHaveBeenCalledExactlyOnceWith(btoa(encodeURIComponent("中文")));
    document.body.removeEventListener("keydown", parent);
  });
  it("Escape uses CANCEL while left input clicks preserve native editing", () => {
    node.dispatchEvent(new MouseEvent("pointerdown", { button: 0, cancelable: true }));
    expect(cancel).not.toHaveBeenCalled();
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects touch input right clicks and keyboard submission during transitions", () => {
    const event = new MouseEvent("pointerdown", { button: 2 });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    node.dispatchEvent(event);
    game.scene.ui["overlayActive"] = true;
    expect(game.scene.ui.processInput(Button.SUBMIT)).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it("does not send text-field Enter or Escape to an upper handler", () => {
    vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    const action = vi.spyOn(game.scene.ui, "processInput");
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(action).not.toHaveBeenCalled();
  });
  it("removes old DOM listeners, focus timer and targets on clear/reopen/destroy", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(submit).not.toHaveBeenCalled();
    handler.show([{ buttonActions: [submit, cancel] }, "New name"]);
    expect(handler["domCleanups"]).toHaveLength(5);
    expect(node.value).toBe("");
    click();
    expect(submit).toHaveBeenCalledOnce();
    handler.destroy();
    expect(handler["domCleanups"]).toHaveLength(0);
    expect(handler["focusTimer"]).toBeUndefined();
  });
});
