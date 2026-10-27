import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { BattleMessageUiHandler } from "#ui/battle-message-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - message advancement with a mouse", () => {
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

  function click(): void {
    const stopPropagation = vi.fn();
    handler["messagePointerZone"].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }

  it("confirms a ready prompt once through ACTION with the existing sound", () => {
    const callback = vi.fn();
    const process = vi.spyOn(game.scene.ui, "processInput");
    const sound = vi.spyOn(game.scene.ui, "playSelect");
    handler.showText("Ready", 0, callback, null, true);
    click();
    click();
    expect(callback).toHaveBeenCalledOnce();
    expect(process).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    expect(sound).toHaveBeenCalledOnce();
  });

  it("ignores hover, wheel, non-left buttons and touch", () => {
    const callback = vi.fn();
    handler.showText("Ready", 0, callback, null, true);
    handler["messagePointerZone"].emit("pointerover", pointer);
    handler["messagePointerZone"].emit("wheel", pointer, 0, 120, 0);
    for (const buttons of [0, 2, 4]) {
      pointer.buttons = buttons;
      click();
    }
    pointer.buttons = 1;
    pointer.wasTouch = true;
    click();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not finish typing or consume a stale prompt while waiting for the next prompt", () => {
    const stale = vi.fn();
    handler.showText("Old", 0, stale, null, true);
    handler.showText("Typing", 20, vi.fn(), null, true, 500);
    const timer = handler["textTimer"]!;
    click();
    expect(timer.repeatCount).toBe(timer.repeat);
    expect(stale).not.toHaveBeenCalled();
    expect(handler.pendingPrompt).toBe(true);
  });

  it("does not finish an automatic message or bypass its callback delay", () => {
    handler.showText("Old", 0, vi.fn(), null, true);
    const callback = vi.fn();
    handler.showText("Automatic", 20, callback, 500, false);
    click();
    expect(callback).not.toHaveBeenCalled();
  });

  it("preserves the callback delay and prevents repeated scheduling", () => {
    const callback = vi.fn();
    handler.showText("Ready", 0, callback, 500, true);
    const delayed = vi.spyOn(game.scene.time, "delayedCall");
    click();
    click();
    expect(callback).not.toHaveBeenCalled();
    expect(delayed).toHaveBeenCalledOnce();
    handler["textCallbackTimer"]!.callback();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("requires a separate click for a synchronously opened next prompt", () => {
    const done = vi.fn();
    handler.showText("First", 0, () => handler.showText("Second", 0, done, null, true), null, true);
    click();
    expect(handler.message.text).toBe("Second");
    expect(done).not.toHaveBeenCalled();
    click();
    expect(done).toHaveBeenCalledOnce();
  });

  it("blocks overlays, transitions, tutorials and inactive handlers", async () => {
    const callback = vi.fn();
    handler.showText("Ready", 0, callback, null, true);
    game.scene.ui["overlayActive"] = true;
    click();
    game.scene.ui["overlayActive"] = false;
    handler.tutorialActive = true;
    click();
    handler.tutorialActive = false;
    handler.active = false;
    click();
    handler.active = true;
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    click();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not confirm a new selection opened by a message callback", () => {
    const yes = vi.fn();
    handler.showText(
      "Question",
      0,
      () => {
        return game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: yes, noHandler: vi.fn() });
      },
      null,
      true,
    );
    click();
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    expect(yes).not.toHaveBeenCalled();
  });

  it("supports keyboard and mouse alternation and repeated clear/reopen", () => {
    for (let i = 0; i < 3; i++) {
      const callback = vi.fn();
      handler.show([]);
      handler.showText("Ready", 0, callback, null, true);
      game.scene.ui.processInput(Button.ACTION);
      click();
      expect(callback).toHaveBeenCalledOnce();
      handler.showText("Next", 0, callback, null, true);
      handler.clearText();
      click();
      handler.clear();
      click();
      expect(callback).toHaveBeenCalledOnce();
    }
  });

  it("advances level-up values one stage per click", async () => {
    settings.display.showStatsOnLevelUp = true;
    vi.spyOn(game.scene, "getPlayerParty").mockReturnValue([{ stats: [20, 10, 10, 10, 10, 10] }] as never);
    const done = vi.fn();
    const result = handler.promptLevelUpStats(0, [19, 9, 9, 9, 9, 9], false).then(done);
    click();
    expect(handler["levelUpStatsContainer"].visible).toBe(true);
    expect(handler["levelUpStatsValuesContent"].text).toContain("20");
    expect(done).not.toHaveBeenCalled();
    click();
    await result;
    expect(done).toHaveBeenCalledOnce();
    expect(handler["levelUpStatsContainer"].visible).toBe(false);
  });

  it("advances an IV prompt once", async () => {
    vi.spyOn(handler, "getIvDescriptor").mockReturnValue("Good");
    const done = vi.fn();
    const result = handler.promptIvs(1, [10, 10, 10, 10, 10, 10]).then(done);
    click();
    click();
    await result;
    expect(done).toHaveBeenCalledOnce();
    expect(handler["levelUpStatsContainer"].visible).toBe(false);
  });

  it("removes its input listener on destruction", () => {
    const zone = handler["messagePointerZone"];
    handler.destroy();
    expect(zone.listenerCount("pointerdown")).toBe(0);
  });
});
