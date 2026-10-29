/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PokedexScanUiHandler } from "#ui/pokedex-scan-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - pokedex search form", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PokedexScanUiHandler;
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
    await game.scene.ui.setOverlayMode(UiMode.POKEDEX_SCAN, { buttonActions: [submit, cancel] }, "", 0);
    handler = game.scene.ui.getHandler() as PokedexScanUiHandler;
    handler["stopPointerInput"]();
    node = document.createElement("input");
    document.body.append(node);
    const input = handler["inputs"][0];
    Object.assign(input, { node, setFocus: () => node.focus() });
    Object.defineProperty(input, "text", {
      configurable: true,
      get: () => node.value,
      set: v => {
        node.value = v;
      },
    });
    vi.spyOn(input, "setText").mockImplementation(value => {
      node.value = value;
      input.emit("textchange", input, { data: null, inputType: "insertFromPaste" });
      return input;
    });
    handler["createPointerTargets"]();
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    node?.remove();
    game.scene.ui.handlers[UiMode.AUTO_COMPLETE].clear();
    game.scene.ui["overlayActive"] = false;
    submit.mockReset();
    cancel.mockReset();
  });
  function button(index: number) {
    handler["onButtonPointer"](index, pointer, { stopPropagation: vi.fn() } as unknown as Phaser.Types.Input.EventData);
  }
  it("submits a valid trimmed name exactly once with its original encoding", () => {
    node.value = `  ${handler.nameKeys[0]}  `;
    button(0);
    button(0);
    expect(submit).toHaveBeenCalledExactlyOnceWith(btoa(unescape(encodeURIComponent(handler.nameKeys[0]))));
  });
  it("retains invalid text as the existing empty-filter result", () => {
    node.value = "not a real species";
    button(0);
    expect(submit).toHaveBeenCalledExactlyOnceWith("");
  });
  it.each(["button", "keyboard", "right"])("shares cancellation from %s", source => {
    if (source === "button") {
      button(1);
    }
    if (source === "keyboard") {
      game.scene.ui.processInput(Button.CANCEL);
    }
    if (source === "right") {
      pointer.buttons = 2;
      button(0);
    }
    game.scene.ui.processInput(Button.CANCEL);
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it("accepts paste candidates without submitting the form", async () => {
    node.value = handler.nameKeys[0].slice(0, 3);
    handler["inputs"][0].emit("textchange");
    await Promise.resolve();
    expect(game.scene.ui.mode).toBe(UiMode.AUTO_COMPLETE);
    const candidate = game.scene.ui.getHandler();
    candidate.processInput(Button.SUBMIT);
    await Promise.resolve();
    expect(node.value).toBe(handler.nameKeys[0]);
    expect(submit).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.POKEDEX_SCAN);
  });
  it("blocks parent buttons while a candidate is open and leaves right CANCEL unchanged", async () => {
    node.value = handler.nameKeys[0].slice(0, 3);
    handler["inputs"][0].emit("textchange");
    await Promise.resolve();
    button(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(game.scene.ui.processInput(Button.CANCEL)).toBe(false);
  });
  it("waits for composition before generating candidates or submitting", () => {
    node.dispatchEvent(new CompositionEvent("compositionstart"));
    node.value = "test";
    handler["inputs"][0].emit("textchange");
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(submit).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.POKEDEX_SCAN);
  });
  it("clears old textchange and DOM listeners", () => {
    const input = handler["inputs"][0];
    const before = input.listenerCount("textchange");
    handler.clear();
    expect(input.listenerCount("textchange")).toBe(before - 1);
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each(["touch", "middle", "upper", "transition"])("blocks %s", kind => {
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
    button(0);
    expect(submit).not.toHaveBeenCalled();
  });
});
