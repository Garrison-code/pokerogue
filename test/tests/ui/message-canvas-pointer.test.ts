/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { audioManager } from "#app/global-audio-manager";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { BattleMessageUiHandler } from "#ui/battle-message-ui-handler";
import { MessagePointerController } from "#ui/utils/message-pointer-controller";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - canvas message reveal", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: BattleMessageUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setMode(UiMode.MESSAGE);
    handler = game.scene.ui.getMessageHandler();
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function click() {
    const stopPropagation = vi.fn();
    game.scene.ui["messagePointer"]!.zone.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("covers the canvas and reveals before confirming through ACTION once", () => {
    const done = vi.fn();
    const input = vi.spyOn(game.scene.ui, "processInput");
    const sound = vi.spyOn(game.scene.ui, "playSelect");
    handler.showText("Typing", 20, done, null, true);
    const zone = game.scene.ui["messagePointer"]!.zone;
    const position = vi.spyOn(zone, "setPosition");
    const size = vi.spyOn(zone, "setSize");
    game.scene.ui.updateMessagePointer();
    expect(position).toHaveBeenCalledWith(0, -180);
    expect(size).toHaveBeenCalledWith(320, 180);
    click();
    expect(handler.message.text).toBe("Typing");
    expect(done).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
    expect(sound).not.toHaveBeenCalled();
    click();
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    expect(done).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledOnce();
  });
  it("keeps prompt and callback delays even after repeated reveal clicks", () => {
    const done = vi.fn();
    handler.showText("Delayed", 20, done, 200, true, 500);
    click();
    const prompt = handler["promptTimer"]!;
    click();
    click();
    expect(done).not.toHaveBeenCalled();
    expect(handler.pendingPrompt).toBe(true);
    prompt.callback();
    click();
    click();
    expect(done).not.toHaveBeenCalled();
    handler["textCallbackTimer"]!.callback();
    expect(done).toHaveBeenCalledOnce();
  });
  it("does not turn automatic text or persistent descriptions into confirmations", () => {
    const done = vi.fn();
    handler.showText("Automatic", 20, done, 200, false);
    const timer = handler["textTimer"];
    click();
    expect(handler.message.text).toBe("");
    expect(handler["textTimer"]).toBe(timer);
    expect(done).not.toHaveBeenCalled();
    handler.showText("Description", 0);
    const input = vi.spyOn(game.scene.ui, "processInput");
    click();
    expect(input).not.toHaveBeenCalled();
  });
  it("applies remaining inline effects once and skips a text pause", () => {
    const variant = vi.spyOn(game.scene.charSprite, "setVariant");
    const sound = vi.spyOn(audioManager, "playSound");
    const done = vi.fn();
    handler.showText("@c{smile}A@d{60}@s{se/buy}B", 20, done, null, true);
    vi.spyOn(game.scene.tweens, "addCounter").mockReturnValue({ remove: vi.fn() } as unknown as Phaser.Tweens.Tween);
    const timer = handler["textTimer"]!;
    timer.callback();
    timer.repeatCount--;
    timer.callback();
    expect(timer.paused).toBe(true);
    click();
    expect(handler.message.text).toBe("AB");
    expect(variant).toHaveBeenCalledExactlyOnceWith("smile");
    expect(sound).toHaveBeenCalledExactlyOnceWith("se/buy");
    expect(done).not.toHaveBeenCalled();
    click();
    expect(done).toHaveBeenCalledOnce();
  });
  it("preserves effect order when several markers occupy the same position", () => {
    const order: string[] = [];
    vi.spyOn(game.scene.charSprite, "setVariant").mockImplementation(async value => {
      order.push(value);
    });
    vi.spyOn(audioManager, "playSound").mockImplementation(value => {
      order.push(String(value));
      return null as never;
    });
    handler.showText("@s{one}@c{smile}@s{two}Text", 20, vi.fn(), null, true);
    click();
    expect(order).toEqual(["one", "smile", "two"]);
  });
  it("waits for inline fades and invalidates their late callbacks when replaced", async () => {
    const done = vi.fn();
    let finishFade!: () => void;
    const fadeOut = vi.spyOn(game.scene.ui, "fadeOut").mockImplementation(
      () =>
        new Promise(resolve => {
          finishFade = resolve;
        }),
    );
    const fadeIn = vi.spyOn(game.scene.ui, "fadeIn").mockResolvedValue();
    handler.showText("A@f{30}B", 20, done, null, true);
    click();
    expect(handler.message.text).toBe("A");
    const wait = [...handler["messageTimers"]][0];
    wait.callback();
    expect(fadeOut).toHaveBeenCalledExactlyOnceWith(750);
    click();
    expect(done).not.toHaveBeenCalled();
    handler.showText("Replacement", 0, vi.fn(), null, true);
    finishFade();
    await Promise.resolve();
    expect(fadeIn).not.toHaveBeenCalled();
    expect(handler.message.text).toBe("Replacement");
    expect(done).not.toHaveBeenCalled();
  });
  it("completes an inline fade before finishing the requested reveal", async () => {
    const done = vi.fn();
    vi.spyOn(game.scene.ui, "fadeOut").mockResolvedValue();
    vi.spyOn(game.scene.ui, "fadeIn").mockResolvedValue();
    handler.showText("A@f{30}B", 20, done, null, true);
    click();
    [...handler["messageTimers"]][0].callback();
    await Promise.resolve();
    [...handler["messageTimers"]][0].callback();
    await Promise.resolve();
    expect(handler.message.text).toBe("AB");
    expect(done).not.toHaveBeenCalled();
    click();
    expect(done).toHaveBeenCalledOnce();
  });
  it("invalidates text, prompt and confirmation callbacks after replacement", () => {
    const old = vi.fn();
    handler.showText("Old", 20, old, 300, true, 500);
    const tick = handler["textTimer"]!.callback;
    click();
    const prompt = handler["promptTimer"]!.callback;
    handler.showText("New", 0, vi.fn(), null, true);
    tick();
    prompt();
    expect(handler.message.text).toBe("New");
    expect(old).not.toHaveBeenCalled();
    const confirm = handler["onActionInput"]!;
    handler.clearText();
    confirm();
    expect(handler.hasPointerMessage).toBe(false);
  });
  it("clears the previous wait before a synchronous next page is created", () => {
    const done = vi.fn();
    handler.showText("First", 0, () => handler.showText("Second", 0, done, null, true), null, true);
    click();
    expect(handler["awaitingActionInput"]).toBe(true);
    expect(done).not.toHaveBeenCalled();
    click();
    expect(done).toHaveBeenCalledOnce();
  });
  it("never applies mouse reveal to keyboard or right-click CANCEL", () => {
    const done = vi.fn();
    handler.showText("Typing", 20, done, null, true);
    game.scene.ui.processInput(Button.ACTION);
    pointer.buttons = 2;
    const input = vi.spyOn(game.scene.ui, "processInput");
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.message.text).toBe("");
    expect(done).not.toHaveBeenCalled();
  });
  it.each([UiMode.PARTY, UiMode.MENU, UiMode.EVOLUTION_SCENE, UiMode.SETTINGS_GENERAL])(
    "only captures the actual current message owner (mode %i)",
    mode => {
      const other = game.scene.ui.handlers[mode] as typeof handler;
      other.active = true;
      game.scene.ui["_mode"] = mode;
      const done = vi.fn();
      other.showText("Other", 20, done, null, true);
      click();
      expect(other.message.text).toBe("Other");
      expect(done).not.toHaveBeenCalled();
      expect(handler.message.text).not.toBe("Other");
      other.clear();
    },
  );
  it("hides below an upper form and resumes the same message after returning", async () => {
    const done = vi.fn();
    handler.showText("Ready", 0, done, null, true);
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    expect(game.scene.ui["messagePointer"]!.zone.visible).toBe(false);
    click();
    expect(done).not.toHaveBeenCalled();
    await game.scene.ui.revertMode();
    expect(game.scene.ui["messagePointer"]!.zone.visible).toBe(true);
    click();
    expect(done).toHaveBeenCalledOnce();
  });
  it("destroys its single scene listener and full-canvas zone", () => {
    const controller = game.scene.ui["messagePointer"]!;
    controller.destroy();
    expect(controller.zone.listenerCount("pointerdown")).toBe(0);
    expect(game.scene.events.listeners("preupdate")).not.toContain(controller.update);
    game.scene.ui["messagePointer"] = new MessagePointerController(game.scene.ui);
  });
});
