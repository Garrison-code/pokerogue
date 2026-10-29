/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { LoginOrRegisterUiHandler } from "#ui/login-or-register-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - login entry pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: LoginOrRegisterUiHandler;
  let pointer: Phaser.Input.Pointer;
  const login = vi.fn();
  const register = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setMode(UiMode.LOGIN_OR_REGISTER, { buttonActions: [login, register] });
    handler = game.scene.ui.getHandler() as LoginOrRegisterUiHandler;
    vi.spyOn(handler as any, "setMouseCursorStyle").mockImplementation(() => {});
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    login.mockReset();
    register.mockReset();
  });
  function click(index: number) {
    const stopPropagation = vi.fn();
    handler["onButtonPointer"](index, pointer, { stopPropagation } as unknown as Phaser.Types.Input.EventData);
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it.each([0, 1])("single-clicks button %i once", index => {
    click(index);
    click(index);
    expect(index ? register : login).toHaveBeenCalledOnce();
    expect(index ? login : register).not.toHaveBeenCalled();
  });
  it("keeps SUBMIT as login and CANCEL as a no-op", () => {
    expect(game.scene.ui.processInput(Button.CANCEL)).toBe(false);
    expect(game.scene.ui.processInput(Button.SUBMIT)).toBe(true);
    expect(login).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
  });
  it("does not register from right click on either button or body", () => {
    pointer.buttons = 2;
    click(0);
    click(1);
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
  it.each(["middle", "touch", "transition", "upper", "tween"])("blocks %s", kind => {
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
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
    click(0);
    click(1);
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
  it("consumes outside input, clears old targets and reopens unlocked", () => {
    const old = handler["pointerTargets"]!.zones[0];
    const stopPropagation = vi.fn();
    handler["backdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    handler["backdrop"]!.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(login).not.toHaveBeenCalled();
    click(0);
    handler.clear();
    handler.show([{ buttonActions: [login, register] }]);
    expect(old.listenerCount("pointerdown")).toBe(0);
    click(1);
    expect(register).toHaveBeenCalledOnce();
  });
});
