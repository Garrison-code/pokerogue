import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { AlertModalUiHandler } from "#ui/alert-modal-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - alert modals with a mouse", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: AlertModalUiHandler;
  let pointer: Phaser.Input.Pointer;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    // Input hit testing is verified in the browser; the headless scene has no input plugin.
    vi.spyOn(Phaser.GameObjects.Rectangle.prototype, "setInteractive").mockReturnThis();
    handler = game.scene.ui.handlers[UiMode.ALERT_MODAL] as AlertModalUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });

  async function open(delay?: number): Promise<void> {
    await game.scene.ui.setOverlayMode(UiMode.ALERT_MODAL, "Alert message", delay);
  }

  function unlock(): void {
    handler["closeDelayTimer"]!.callback();
  }

  function click(target = handler["pointerZone"]!): void {
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }

  it("uses ACTION to close a ready alert once and retains its overlay until the fade ends", async () => {
    await open(0);
    unlock();
    const overlay = handler["overlay"]!;
    const zone = handler["pointerZone"]!;
    const action = vi.spyOn(game.scene.ui, "processInput");
    const revert = vi.spyOn(game.scene.ui, "revertMode");
    const sound = vi.spyOn(game.scene.ui, "playSelect");
    const addTween = vi.spyOn(game.scene.tweens, "add");
    click();
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(handler.processInput()).toBe(false);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    expect(revert).toHaveBeenCalledOnce();
    expect(sound).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.TITLE);
    expect(overlay.active).toBe(true);
    expect(handler["fadingOverlays"].has(overlay)).toBe(true);
    await vi.waitFor(() =>
      expect(addTween).toHaveBeenCalledWith(expect.objectContaining({ targets: overlay, alpha: 0 })),
    );
    const fade = addTween.mock.calls.at(-1)![0] as Phaser.Types.Tweens.TweenBuilderConfig;
    (fade.onComplete as () => void)();
    await vi.waitFor(() => expect(handler["fadingOverlays"].size).toBe(0));
    expect(overlay.active).toBe(false);
    expect(overlay.listenerCount("pointerdown")).toBe(0);
  });

  it("does not bypass the close delay", async () => {
    await open(5000);
    click();
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
    unlock();
    click();
    expect(game.scene.ui.mode).toBe(UiMode.TITLE);
  });

  it("keeps alerts without a close delay unclosable by mouse or keyboard", async () => {
    await open();
    click();
    expect(game.scene.ui.processInput(Button.ACTION)).toBe(false);
    expect(game.scene.ui.processInput(Button.CANCEL)).toBe(false);
    expect(handler["closeDelayTimer"]).toBeNull();
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
  });

  it("ignores hover, wheel, non-left buttons and touch", async () => {
    await open(0);
    unlock();
    const zone = handler["pointerZone"]!;
    const stopPropagation = vi.fn();
    zone.emit("pointerover", pointer);
    zone.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    for (const buttons of [0, 2, 4]) {
      pointer.buttons = buttons;
      click();
    }
    pointer.buttons = 1;
    pointer.wasTouch = true;
    click();
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
  });

  it("consumes outside clicks and wheel without closing, including during the closing fade", async () => {
    await open(0);
    unlock();
    const overlay = handler["overlay"]!;
    const stopPropagation = vi.fn();
    overlay.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    overlay.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
    click();
    overlay.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(3);
    expect(game.scene.ui.mode).toBe(UiMode.TITLE);
  });

  it("blocks inactive handlers, transitions and upper overlays", async () => {
    await open(0);
    unlock();
    handler.active = false;
    click();
    handler.active = true;
    game.scene.ui["overlayActive"] = true;
    click();
    game.scene.ui["overlayActive"] = false;
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    click();
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    await game.scene.ui.revertMode();
    click();
    expect(game.scene.ui.mode).toBe(UiMode.TITLE);
  });

  it("does not dismiss a standalone alert with no mode to return to", async () => {
    game.scene.ui.resetModeChain();
    await game.scene.ui.setMode(UiMode.ALERT_MODAL, "Standalone", 0);
    unlock();
    const revert = vi.spyOn(game.scene.ui, "revertMode");
    click();
    expect(revert).not.toHaveBeenCalled();
    expect(handler.active).toBe(true);
    expect(handler["overlay"]!.active).toBe(true);
  });

  it("cancels old delays and ignores stale timer callbacks after reopening", async () => {
    await open(5000);
    const timer = handler["closeDelayTimer"]!;
    const zone = handler["pointerZone"]!;
    const overlay = handler["overlay"]!;
    await game.scene.ui.revertMode();
    expect(timer.hasDispatched).toBe(true);
    expect(zone.listenerCount("pointerdown")).toBe(0);
    expect(overlay.active).toBe(false);
    await open();
    timer.callback();
    click();
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
    expect(handler["allowClosing"]).toBe(false);
  });

  it("cleans up when switching directly to another mode", async () => {
    await open(5000);
    const timer = handler["closeDelayTimer"]!;
    const overlay = handler["overlay"]!;
    const killTweens = vi.spyOn(game.scene.tweens, "killTweensOf");
    await game.scene.ui.setMode(UiMode.MESSAGE);
    expect(timer.hasDispatched).toBe(true);
    expect(killTweens).toHaveBeenCalledWith(overlay);
    expect(overlay.active).toBe(false);
    expect(handler["pointerZone"]).toBeNull();
  });

  it("does not let an old fade remove the overlay of a reopened alert", async () => {
    await open(0);
    unlock();
    const oldOverlay = handler["overlay"]!;
    const addTween = vi.spyOn(game.scene.tweens, "add");
    click();
    await vi.waitFor(() => expect(addTween).toHaveBeenCalled());
    const fade = addTween.mock.calls.at(-1)![0] as Phaser.Types.Tweens.TweenBuilderConfig;
    await open(5000);
    const overlay = handler["overlay"]!;
    expect(oldOverlay.active).toBe(false);
    (fade.onComplete as () => void)();
    await vi.waitFor(() => expect(handler["fadingOverlays"].size).toBe(0));
    expect(handler["overlay"]).toBe(overlay);
    expect(overlay.active).toBe(true);
    click();
    expect(game.scene.ui.mode).toBe(UiMode.ALERT_MODAL);
  });

  it("supports keyboard closing and repeated reopen without accumulating handlers", async () => {
    for (let index = 0; index < 3; index++) {
      await open(0);
      unlock();
      expect(handler["pointerZone"]!.listenerCount("pointerdown")).toBe(1);
      expect(game.scene.ui.processInput(Button.CANCEL)).toBe(true);
      expect(handler["pointerZone"]).toBeNull();
      expect(game.scene.ui.mode).toBe(UiMode.TITLE);
    }
  });

  it("destroys the pointer target, delay and overlay", async () => {
    await open(5000);
    const zone = handler["pointerZone"]!;
    const overlay = handler["overlay"]!;
    const timer = handler["closeDelayTimer"]!;
    handler.destroy();
    timer.callback();
    expect(handler["allowClosing"]).toBe(false);
    expect(timer.hasDispatched).toBe(true);
    expect(zone.listenerCount("pointerdown")).toBe(0);
    expect(overlay.active).toBe(false);
  });

  it("clears a closing overlay when destroyed before its fade starts", async () => {
    await open(0);
    unlock();
    const overlay = handler["overlay"]!;
    click();
    handler.destroy();
    await vi.waitFor(() => expect(handler["fadingOverlays"].size).toBe(0));
    expect(overlay.active).toBe(false);
  });
});
