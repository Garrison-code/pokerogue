/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { pokerogueApi } from "#api/api";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { LoginFormUiHandler } from "#ui/login-form-ui-handler";
import { UiHandler } from "#ui/ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - login form pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: LoginFormUiHandler;
  let pointer: Phaser.Input.Pointer;
  const success = vi.fn();
  const cancel = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    vi.spyOn(UiHandler.prototype as any, "setMouseCursorStyle").mockImplementation(() => {});
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.LOGIN_FORM] as LoginFormUiHandler;
    vi.spyOn(handler as any, "processExternalProvider").mockImplementation(() => {});
    await game.scene.ui.setMode(UiMode.LOGIN_FORM, { buttonActions: [success, cancel] });
    handler = game.scene.ui.getHandler() as LoginFormUiHandler;
    handler["inputs"][0].text = "  Test user  ";
    handler["inputs"][1].text = " secret ";
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
    vi.spyOn(pokerogueApi.account, "login").mockResolvedValue(null);
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    success.mockReset();
    cancel.mockReset();
  });
  function click(index = 0) {
    handler["onButtonPointer"](index, pointer, { stopPropagation: vi.fn() } as unknown as Phaser.Types.Input.EventData);
  }
  it("captures trimmed fields and submits once across mouse and Enter", async () => {
    click();
    game.scene.ui.processInput(Button.SUBMIT);
    click();
    await vi.waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(pokerogueApi.account.login).toHaveBeenCalledExactlyOnceWith({ username: "Test user", password: "secret" });
  });
  it.each(["button", "body", "password", "keyboard"])("shares cancellation from %s", source => {
    if (source === "button") {
      click(1);
    }
    if (source === "body") {
      pointer.buttons = 2;
      handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    }
    if (source === "password") {
      (handler["inputs"][1].node as HTMLInputElement).dispatchEvent(
        new MouseEvent("pointerdown", { button: 2, bubbles: true, cancelable: true }),
      );
    }
    if (source === "keyboard") {
      game.scene.ui.processInput(Button.CANCEL);
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(pokerogueApi.account.login).not.toHaveBeenCalled();
  });
  it("blocks Enter from a composing password, then accepts it after composition", async () => {
    const node = handler["inputs"][1].node;
    node.dispatchEvent(new CompositionEvent("compositionstart"));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(pokerogueApi.account.login).not.toHaveBeenCalled();
    node.dispatchEvent(new CompositionEvent("compositionend"));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(success).toHaveBeenCalledOnce());
  });
  it.each(["touch", "middle", "upper", "transition", "tween"])("blocks %s", kind => {
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "tween") {
      vi.spyOn(game.scene.tweens, "getTweensOf").mockReturnValue([{} as Phaser.Tweens.Tween]);
    }
    click();
    expect(pokerogueApi.account.login).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
  it("reopens after a failed request and allows another submission", async () => {
    vi.mocked(pokerogueApi.account.login).mockResolvedValueOnce("invalid password");
    click();
    await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.LOGIN_FORM));
    expect(handler["errorMessage"].text).not.toBe("");
    click();
    await vi.waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(pokerogueApi.account.login).toHaveBeenCalledTimes(2);
  });
  it("rejects an empty username without an API call", async () => {
    handler["inputs"][0].text = " ";
    click();
    await vi.waitFor(() => expect(handler["errorMessage"].text).not.toBe(""));
    expect(pokerogueApi.account.login).not.toHaveBeenCalled();
  });
  it.each(["leave", "new loading", "destroy"])("ignores late results after %s", async kind => {
    let resolve!: (error: string | null) => void;
    vi.mocked(pokerogueApi.account.login).mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );
    click();
    await vi.waitFor(() => expect(pokerogueApi.account.login).toHaveBeenCalledOnce());
    if (kind === "destroy") {
      handler.destroy();
    } else {
      await game.scene.ui.setMode(UiMode.MESSAGE);
      if (kind === "new loading") {
        await game.scene.ui.setMode(UiMode.LOADING, { buttonActions: [] });
      }
    }
    resolve(null);
    await new Promise(r => setTimeout(r, 0));
    expect(success).not.toHaveBeenCalled();
  });
  it("removes events from every input on clear", () => {
    const nodes = handler["inputs"].map(i => i.node);
    handler.clear();
    for (const node of nodes) {
      node.dispatchEvent(new MouseEvent("pointerdown", { button: 2 }));
    }
    expect(cancel).not.toHaveBeenCalled();
  });
});
