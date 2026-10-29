import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EvolutionSceneUiHandler } from "#ui/evolution-scene-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - evolution pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EvolutionSceneUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setMode(UiMode.EVOLUTION_SCENE);
    handler = game.scene.ui.handlers[UiMode.EVOLUTION_SCENE] as EvolutionSceneUiHandler;
    // The sprite wrapper does not expose the underlying Phaser visibility/geometry.
    Object.assign(handler.messageBg, { visible: true, displayWidth: 320, displayHeight: 48, x: 0, y: 0 });
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function click(name = "evolution-message") {
    const target = handler["pointerTargets"]!.zones.find(z => z.name === name)!;
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("advances a ready prompt once with its original sound", () => {
    const done = vi.fn();
    const sound = vi.spyOn(game.scene.ui, "playSelect");
    handler.showText("Ready", 0, done, null, true);
    click();
    click();
    expect(done).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledOnce();
  });
  it("does not finish typing, prompt delay or an automatic message", () => {
    const old = vi.fn();
    handler.showText("Old", 0, old, null, true);
    const done = vi.fn();
    handler.showText("Typing", 20, done, null, true, 500);
    click();
    expect(old).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    expect(handler.pendingPrompt).toBe(true);
    handler.showText("Auto", 20, done, 500, false);
    click();
    expect(done).not.toHaveBeenCalled();
  });
  it("replaces typing with a ready prompt and cancels an obsolete prompt delay", () => {
    const old = vi.fn();
    handler.showText("Typing", 20, old, null, true);
    const done = vi.fn();
    handler.showText("Ready", 0, done, null, true);
    click();
    expect(done).toHaveBeenCalledOnce();
    expect(old).not.toHaveBeenCalled();
    handler.showText("Delayed", 0, old, null, true, 500);
    const timer = handler["promptTimer"]!;
    handler.clear();
    expect(timer.hasDispatched).toBe(true);
    expect(handler["promptTimer"]).toBeNull();
  });
  it("retains callback delays and requires a separate click for the next prompt", () => {
    const done = vi.fn();
    handler.showText("First", 0, () => handler.showText("Second", 0, done, 500, true), null, true);
    click();
    expect(handler.message.text).toBe("Second");
    expect(done).not.toHaveBeenCalled();
    const delayed = vi.spyOn(game.scene.time, "delayedCall");
    click();
    click();
    expect(delayed).toHaveBeenCalledOnce();
    handler["textCallbackTimer"]!.callback();
    expect(done).toHaveBeenCalledOnce();
  });
  it.each([true, false])("right click has keyboard cancellation precedence when canCancel=%s", canCancel => {
    const done = vi.fn();
    handler.canCancel = canCancel;
    handler.showText("Ready", 0, done, null, true);
    pointer.buttons = 2;
    click("evolution-page");
    expect(handler.cancelled).toBe(canCancel);
    expect(done).toHaveBeenCalledTimes(canCancel ? 0 : 1);
    // The original CANCEL can advance the prompt after a previous cancellation.
    game.scene.ui.processInput(Button.CANCEL);
    expect(done).toHaveBeenCalledOnce();
  });
  it("right click is not restricted by left-click prompt readiness", () => {
    handler.canCancel = true;
    handler.showText("Typing", 20, vi.fn(), null, true, 500);
    pointer.buttons = 2;
    click();
    expect(handler.cancelled).toBe(true);
  });
  it("advances ready messages through the full-canvas controller without cancelling evolution", () => {
    handler.canCancel = true;
    const done = vi.fn();
    handler.showText("Ready", 0, done, null, true);
    game.scene.ui["messagePointer"]!.zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(handler.cancelled).toBe(false);
    expect(done).toHaveBeenCalledOnce();
  });
  it.each(["upper", "transition", "tutorial", "touch", "middle"])("blocks %s input", kind => {
    const done = vi.fn();
    handler.showText("Ready", 0, done, null, true);
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "tutorial") {
      handler.tutorialActive = true;
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click();
    expect(done).not.toHaveBeenCalled();
  });
  it("does not confirm a new overlay with the same click", () => {
    const done = vi.fn();
    handler.showText(
      "Question",
      0,
      () => {
        void game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: done, noHandler: vi.fn() });
      },
      null,
      true,
    );
    click();
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    expect(done).not.toHaveBeenCalled();
  });
  it("ignores wheel and hidden messages, and clears input and timers on reopen", () => {
    const old = vi.fn();
    handler.showText("Ready", 0, old, 500, true);
    const targets = handler["pointerTargets"]!;
    handler.messageBg.visible = false;
    click();
    expect(old).not.toHaveBeenCalled();
    handler.messageBg.visible = true;
    click();
    const timer = handler["textCallbackTimer"]!;
    handler.clear();
    expect(timer.hasDispatched).toBe(true);
    expect(targets.zones).toHaveLength(0);
    expect(handler.active).toBe(false);
    handler.show([]);
    const done = vi.fn();
    handler.showText("New", 0, done, null, true);
    handler["pointerTargets"]!.zones[0]!.emit("wheel", pointer, 0, 100, 0, { stopPropagation: vi.fn() });
    expect(done).not.toHaveBeenCalled();
    game.scene.ui.processInput(Button.ACTION);
    click();
    expect(done).toHaveBeenCalledOnce();
    handler.destroy();
    expect(handler["pointerTargets"]).toBeUndefined();
  });
});
