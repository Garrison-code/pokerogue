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

describe("UI - dialogue testing pointer form", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: TestDialogueUiHandler;
  let pointer: Phaser.Input.Pointer;
  const submit = vi.fn();
  const cancel = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.TEST_DIALOGUE, { buttonActions: [submit, cancel] }, "Old command");
    handler = game.scene.ui.getHandler() as TestDialogueUiHandler;
    handler.keys = ["menu:login", "menu:register", "menu:cancel"];
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    if (game.scene.ui.mode === UiMode.AUTO_COMPLETE) {
      game.scene.ui.getHandler().clear();
    }
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    submit.mockReset();
    cancel.mockReset();
  });
  function click(index = 0) {
    handler["onButtonPointer"](index, pointer, { stopPropagation: vi.fn() } as unknown as Phaser.Types.Input.EventData);
  }
  async function type(text: string) {
    handler["inputs"][0].text = text;
    handler["inputs"][0].emit("textchange", handler["inputs"][0], {});
    await Promise.resolve();
  }
  function key(key: string, code = key) {
    handler["inputs"][0].node.dispatchEvent(
      new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
    );
  }
  it("submits trimmed Unicode and parameters once with the original codec", () => {
    handler["inputs"][0].text = "  menu:login 中文 Évoli  ";
    click();
    key("Enter");
    click();
    expect(submit).toHaveBeenCalledExactlyOnceWith(btoa(unescape(encodeURIComponent("menu:login 中文 Évoli"))));
  });
  it.each(["button", "body", "input", "keyboard"])("shares cancellation from %s", source => {
    if (source === "button") {
      click(1);
    }
    if (source === "body") {
      pointer.buttons = 2;
      handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    }
    if (source === "input") {
      handler["inputs"][0].node.dispatchEvent(new MouseEvent("pointerdown", { button: 2 }));
    }
    if (source === "keyboard") {
      game.scene.ui.processInput(Button.CANCEL);
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it.each(["touch", "middle", "upper", "transition", "tween"])("blocks %s", kind => {
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
    if (kind === "tween") {
      vi.spyOn(game.scene.tweens, "getTweensOf").mockReturnValue([{} as Phaser.Tweens.Tween]);
    }
    click();
    expect(submit).not.toHaveBeenCalled();
  });
  it.each(["insertFromPaste", "deleteContentBackward", "insertText"])(
    "accepts a candidate after %s without submitting Check",
    async inputType => {
      handler["inputs"][0].text = "prefix menu:lo";
      handler["inputs"][0].emit("textchange", handler["inputs"][0], { inputType, data: null });
      await Promise.resolve();
      const candidate = game.scene.ui.getHandler() as AutoCompleteUiHandler;
      candidate["pointerRows"][0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
      await Promise.resolve();
      expect(handler["inputs"][0].text).toBe("prefix menu:login");
      expect(game.scene.ui.mode).toBe(UiMode.TEST_DIALOGUE);
      expect(submit).not.toHaveBeenCalled();
    },
  );
  it("selects another candidate before confirming through SUBMIT", async () => {
    await type("menu:");
    const candidate = game.scene.ui.getHandler() as AutoCompleteUiHandler;
    candidate["pointerRows"][1].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(handler["inputs"][0].text).toBe("menu:");
    const input = vi.spyOn(game.scene.ui, "processInput");
    candidate["pointerRows"][1].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.SUBMIT);
    expect(handler["inputs"][0].text).toBe("menu:register");
  });
  it("blocks parent buttons and keeps candidate CANCEL inert", async () => {
    await type("menu:");
    click();
    click(1);
    pointer.buttons = 2;
    const candidate = game.scene.ui.getHandler() as AutoCompleteUiHandler;
    candidate["pointerRows"][0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(game.scene.ui.mode).toBe(UiMode.AUTO_COMPLETE);
    expect(cancel).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it("uses Enter only to accept a candidate", async () => {
    await type("menu:lo");
    key("Enter");
    await Promise.resolve();
    expect(handler["inputs"][0].text).toBe("menu:login");
    expect(submit).not.toHaveBeenCalled();
    key("Enter");
    expect(submit).toHaveBeenCalledOnce();
  });
  it("closes candidates with Escape before cancelling the form", async () => {
    await type("menu:");
    key("Escape");
    await Promise.resolve();
    expect(game.scene.ui.mode).toBe(UiMode.TEST_DIALOGUE);
    expect(cancel).not.toHaveBeenCalled();
    key("Escape");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("closes candidates on Space without reopening for the inserted separator", async () => {
    await type("menu:lo");
    key(" ", "Space");
    await type("menu:lo ");
    expect(game.scene.ui.mode).toBe(UiMode.TEST_DIALOGUE);
    expect(submit).not.toHaveBeenCalled();
  });
  it("waits for composition to finish before suggesting and does not submit Enter", async () => {
    const node = handler["inputs"][0].node;
    node.dispatchEvent(new CompositionEvent("compositionstart"));
    await type("menu:lo");
    key("Enter");
    expect(game.scene.ui.mode).toBe(UiMode.TEST_DIALOGUE);
    expect(submit).not.toHaveBeenCalled();
    node.dispatchEvent(new CompositionEvent("compositionend"));
    expect(game.scene.ui.mode).toBe(UiMode.AUTO_COMPLETE);
  });
  it("keeps only the newest candidates after editing while a list is open", async () => {
    await type("menu:lo");
    await type("menu:reg");
    await Promise.resolve();
    expect((game.scene.ui.getHandler() as AutoCompleteUiHandler)["currentOption"]?.label).toBe("menu:register");
  });
  it("cleans listeners and rejects old candidate callbacks after reopen", async () => {
    await type("menu:lo");
    const candidate = game.scene.ui.getHandler() as AutoCompleteUiHandler;
    const accept = candidate["currentOption"]!.handler;
    await game.scene.ui.revertMode();
    const oldInput = handler["inputs"][0];
    handler.clear();
    handler.show([{ buttonActions: [submit, cancel] }, "New command"]);
    expect(accept()).toBe(false);
    expect(handler["inputs"][0].text).toBe("New command");
    expect(oldInput.listenerCount("textchange")).toBe(0);
  });
  it("does not make preview tutorial messages pointer-accessible", () => {
    const message = game.scene.ui.handlers[
      UiMode.MESSAGE
    ] as import("#ui/battle-message-ui-handler").BattleMessageUiHandler;
    message.active = true;
    message.tutorialActive = true;
    vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(message);
    expect(game.scene.ui.canProcessPointerInput(message)).toBe(false);
    message.tutorialActive = false;
  });
  it("blocks native editing beneath an unrelated upper modal", async () => {
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    const event = new InputEvent("beforeinput", { inputType: "insertText", data: "x", cancelable: true });
    handler["inputs"][0].node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("allows native editing while its own candidate is open", async () => {
    await type("menu:");
    const event = new InputEvent("beforeinput", { inputType: "insertText", data: "x", cancelable: true });
    handler["inputs"][0].node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
