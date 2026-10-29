/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as account from "#app/account";
import { audioManager } from "#app/global-audio-manager";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { UnavailableModalUiHandler } from "#ui/unavailable-modal-ui-handler";
import * as cookies from "#utils/cookies";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - unavailable status pointer and reconnect", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: UnavailableModalUiHandler;
  let pointer: Phaser.Input.Pointer;
  const done = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(account, "updateUserInfo").mockResolvedValue([false, 500]);
    vi.spyOn(Math, "random").mockReturnValue(0);
    await game.scene.ui.setMode(UiMode.UNAVAILABLE, done);
    handler = game.scene.ui.getHandler() as UnavailableModalUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    vi.useRealTimers();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    done.mockReset();
  });
  it("keeps body, outside and keyboard input inert", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    handler["backdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    handler["backdrop"]!.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
    pointer.buttons = 2;
    handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.processInput(Button.CANCEL)).toBe(false);
    expect(done).not.toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalledTimes(4);
  });
  it.each(["touch", "middle", "upper", "transition"])("blocks %s", kind => {
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
  it("waits five seconds, doubles failures and caps the delay", async () => {
    await vi.advanceTimersByTimeAsync(4999);
    expect(account.updateUserInfo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
    expect(handler["reconnectDuration"]).toBe(10000);
    await vi.advanceTimersByTimeAsync(9999);
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(account.updateUserInfo).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(handler["reconnectDuration"]);
    }
    expect(handler["reconnectDuration"]).toBe(300000);
  });
  it("adds the original random variance", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(14999);
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(account.updateUserInfo).toHaveBeenCalledTimes(2);
  });
  it.each([
    [true, 200],
    [false, 200],
    [false, 400],
  ] as const)("finishes once for success %s status %s", async (success, status) => {
    vi.mocked(account.updateUserInfo).mockResolvedValue([success, status]);
    const sound = vi.spyOn(audioManager, "playSound");
    await vi.advanceTimersByTimeAsync(5000);
    await handler.tryReconnect();
    await vi.advanceTimersByTimeAsync(600000);
    expect(done).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledExactlyOnceWith("se/pb_bounce_1");
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
  });
  it("preserves the unauthorized session reset once", async () => {
    vi.mocked(account.updateUserInfo).mockResolvedValue([false, 401]);
    const reset = vi.spyOn(game.scene, "reset").mockImplementation(() => {});
    const remove = vi.spyOn(cookies, "removeCookie");
    await vi.advanceTimersByTimeAsync(5000);
    await handler.tryReconnect();
    expect(reset).toHaveBeenCalledExactlyOnceWith(true, true);
    expect(remove).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  });
  it("does not overlap pending reconnect requests", async () => {
    let resolve!: (value: [boolean, number]) => void;
    vi.mocked(account.updateUserInfo).mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    void handler.tryReconnect();
    await vi.advanceTimersByTimeAsync(600000);
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
    resolve([false, 500]);
    await Promise.resolve();
    expect(handler["reconnectTimer"]).toBeDefined();
  });
  it.each(["clear", "reopen", "destroy"])("ignores pending responses and removes the old timer on %s", async kind => {
    let resolve!: (value: [boolean, number]) => void;
    vi.mocked(account.updateUserInfo).mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    const reset = vi.spyOn(game.scene, "reset").mockImplementation(() => {});
    if (kind === "clear") {
      handler.clear();
    }
    if (kind === "reopen") {
      handler.show([done]);
    }
    if (kind === "destroy") {
      handler.destroy();
    }
    resolve([false, 401]);
    await Promise.resolve();
    expect(reset).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    if (kind !== "reopen") {
      expect(vi.getTimerCount()).toBe(0);
    }
  });
  it("removes a scheduled retry on clear", async () => {
    await vi.advanceTimersByTimeAsync(5000);
    handler.clear();
    await vi.advanceTimersByTimeAsync(600000);
    expect(account.updateUserInfo).toHaveBeenCalledOnce();
  });
  it("retries after an unexpected request rejection", async () => {
    vi.mocked(account.updateUserInfo).mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(handler["reconnectDuration"]).toBe(10000);
    expect(handler["reconnectTimer"]).toBeDefined();
  });
});
