/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { settings } from "#app/global-settings-manager";
import { handleTutorial, Tutorial } from "#app/tutorial";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { TutorialFlags } from "#types/save-data";
import type { BattleMessageUiHandler } from "#ui/battle-message-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - tutorial pointer lifetime", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: BattleMessageUiHandler;
  let pointer: Phaser.Input.Pointer;
  let save: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setMode(UiMode.MESSAGE);
    handler = game.scene.ui.getMessageHandler();
    handler.tutorialActive = false;
    game.scene.disableMenu = false;
    vi.spyOn(game.scene.gameData, "getTutorialFlags").mockReturnValue(
      Object.fromEntries(Object.values(Tutorial).map(key => [key, false])) as TutorialFlags,
    );
    save = vi.spyOn(game.scene.gameData, "saveTutorialFlag").mockImplementation(() => {});
    settings.update("general", "enableTutorials", true);
    settings.update("general", "enableTouchControls", false);
    // Preserve real handler text input rather than the framework's automatic text interceptor.
    vi.spyOn(game.scene.ui, "showText").mockImplementation(
      (text, delay, callback, callbackDelay, prompt, promptDelay) => {
        game.scene.ui
          .getCurrentMessageHandler()
          .showText(text, text ? delay : 0, callback, callbackDelay, prompt, promptDelay);
      },
    );
    vi.spyOn(game.scene.ui, "showDialogue").mockImplementation(
      (text, name, delay, callback, callbackDelay, promptDelay) => {
        game.scene.ui
          .getCurrentMessageHandler()
          .showDialogue(text, name, delay, callback, callbackDelay, true, promptDelay);
      },
    );
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    game.scene.ui.tutorialSession?.cancel();
    if (game.scene.ui.getHandler() !== handler) {
      game.scene.ui.getHandler().clear();
    }
    handler.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    settings.update("general", "enableTutorials", false);
  });
  async function flush() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  }
  function click() {
    const stopPropagation = vi.fn();
    game.scene.ui["messagePointer"]!.zone.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  async function completeTutorial() {
    for (let i = 0; i < 30 && game.scene.ui.tutorialSession; i++) {
      await flush();
      if (game.scene.ui.tutorialSession?.inputReady) {
        click();
      }
    }
    await flush();
  }
  it.each([
    Tutorial.INTRO,
    Tutorial.ACCESS_MENU,
    Tutorial.MENU,
    Tutorial.STARTER_SELECT,
    Tutorial.POKERUS,
    Tutorial.STAT_CHANGE,
    Tutorial.SELECT_ITEM,
    Tutorial.EGG_GACHA,
  ])("finishes %s only after its prompted text and overlay are complete", async tutorial => {
    const promise = handleTutorial(tutorial);
    expect(game.scene.disableMenu).toBe(true);
    await completeTutorial();
    expect(await promise).toBe(true);
    expect(save).toHaveBeenCalledWith(tutorial, true);
    expect(handler.tutorialActive).toBe(false);
    expect(game.scene.disableMenu).toBe(false);
    expect(game.scene.ui.tutorialSession).toBeNull();
    if (tutorial === Tutorial.SELECT_ITEM) {
      expect(game.scene.ui.mode).toBe(UiMode.MODIFIER_SELECT);
    }
  });
  it("does not start disabled or already-seen tutorials", async () => {
    settings.update("general", "enableTutorials", false);
    expect(await handleTutorial(Tutorial.INTRO)).toBe(false);
    settings.update("general", "enableTutorials", true);
    vi.mocked(game.scene.gameData.getTutorialFlags).mockReturnValue({
      ...game.scene.gameData.getTutorialFlags(),
      [Tutorial.INTRO]: true,
    });
    expect(await handleTutorial(Tutorial.INTRO)).toBe(false);
    expect(game.scene.ui.tutorialSession).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it("does not invent content for the unused POKEDEX enum entry", async () => {
    expect(await handleTutorial(Tutorial.POKEDEX)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("retains the touch-specific ACCESS_MENU skip without adding pointer touch input", async () => {
    settings.update("general", "enableTouchControls", true);
    expect(await handleTutorial(Tutorial.ACCESS_MENU)).toBe(true);
    expect(game.scene.ui.showDialogue).not.toHaveBeenCalled();
  });
  it("requires separate clicks for reveal and confirm while normal background input stays blocked", async () => {
    const promise = handleTutorial(Tutorial.INTRO);
    await flush();
    expect(game.scene.ui.canProcessPointerInput(handler)).toBe(false);
    expect(handler.pendingPrompt).toBe(true);
    click();
    expect(handler.pendingPrompt).toBe(false);
    expect(save).not.toHaveBeenCalled();
    click();
    expect(await promise).toBe(true);
  });
  it.each([Button.ACTION, Button.CANCEL])("interleaves keyboard %i with mouse reveal", async button => {
    const promise = handleTutorial(Tutorial.INTRO);
    await flush();
    click();
    game.scene.ui.processInput(button);
    expect(await promise).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("keeps right click identical to keyboard CANCEL without adding reveal", async () => {
    const promise = handleTutorial(Tutorial.INTRO);
    await flush();
    const input = vi.spyOn(game.scene.ui, "processInput");
    pointer.buttons = 2;
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.message.text).toBe("");
    expect(save).not.toHaveBeenCalled();
    pointer.buttons = 1;
    click();
    pointer.buttons = 2;
    click();
    expect(await promise).toBe(true);
  });
  it.each(["touch", "middle", "transition", "wheel"])("ignores %s while consuming its event", async kind => {
    const promise = handleTutorial(Tutorial.INTRO);
    await flush();
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "wheel") {
      const stopPropagation = vi.fn();
      game.scene.ui["messagePointer"]!.zone.emit("wheel", pointer, 0, 120, 0, { stopPropagation });
      expect(stopPropagation).toHaveBeenCalledOnce();
    } else {
      click();
    }
    expect(handler.message.text).toBe("");
    expect(save).not.toHaveBeenCalled();
    game.scene.ui.tutorialSession!.cancel();
    expect(await promise).toBe(false);
  });
  it("waits for real overlay callbacks and blocks input through the exit tween", async () => {
    handler.initTutorialOverlay(game.scene.ui);
    const transitions: (() => void)[] = [];
    vi.spyOn(game.scene.tweens, "add").mockImplementation(config => {
      const tween = { remove: vi.fn() } as unknown as Phaser.Tweens.Tween;
      transitions.push(() => (config as Phaser.Types.Tweens.TweenBuilderConfig).onComplete?.(tween, []));
      return tween;
    });
    const promise = handleTutorial(Tutorial.MENU);
    await flush();
    click();
    expect(game.scene.ui.showDialogue).not.toHaveBeenCalled();
    expect(transitions).toHaveLength(1);
    transitions[0]();
    await flush();
    click();
    click();
    await flush();
    expect(transitions).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    expect(game.scene.disableMenu).toBe(true);
    expect(game.scene.ui.tutorialSession?.inputReady).toBe(false);
    click();
    pointer.buttons = 2;
    click();
    transitions[1]();
    expect(await promise).toBe(true);
    expect(game.scene.disableMenu).toBe(false);
    expect(save).toHaveBeenCalledWith(Tutorial.ACCESS_MENU, true);
  });
  it.each(["clear", "destroy", "upper"])("cancels %s without recording a seen flag", async kind => {
    const promise = handleTutorial(Tutorial.MENU);
    await flush();
    click();
    const oldConfirm = handler["onActionInput"]!;
    if (kind === "clear") {
      handler.clear();
    }
    if (kind === "destroy") {
      handler.destroy();
    }
    if (kind === "upper") {
      await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    }
    expect(await promise).toBe(false);
    oldConfirm();
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(game.scene.ui.tutorialSession).toBeNull();
    expect(game.scene.disableMenu).toBe(false);
  });
  it("replaces a running tutorial without inheriting its menu lock or late callbacks", async () => {
    const first = handleTutorial(Tutorial.INTRO);
    await flush();
    click();
    const oldConfirm = handler["onActionInput"]!;
    const second = handleTutorial(Tutorial.STARTER_SELECT);
    await flush();
    expect(await first).toBe(false);
    oldConfirm();
    expect(save).not.toHaveBeenCalled();
    await completeTutorial();
    expect(await second).toBe(true);
    expect(game.scene.disableMenu).toBe(false);
    expect(save).toHaveBeenCalledExactlyOnceWith(Tutorial.STARTER_SELECT, true);
  });
  it("cancels a pending mode handoff without leaving its tutorial Promise unresolved", async () => {
    let finishMode!: () => void;
    vi.spyOn(game.scene.ui, "setModeWithoutClear").mockImplementation(
      () =>
        new Promise(resolve => {
          finishMode = resolve;
        }),
    );
    const promise = handleTutorial(Tutorial.SELECT_ITEM);
    await flush();
    game.scene.ui.tutorialSession!.cancel();
    expect(await promise).toBe(false);
    finishMode();
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(handler.tutorialActive).toBe(false);
  });
  it("unblocks the actual menu's message gate after interruption and return", async () => {
    settings.update("general", "enableTutorials", false);
    await game.scene.ui.setOverlayMode(UiMode.MENU);
    settings.update("general", "enableTutorials", true);
    const menu = game.scene.ui.getHandler() as import("#ui/menu-ui-handler").MenuUiHandler;
    const promise = handleTutorial(Tutorial.MENU);
    await flush();
    click();
    expect(menu["pointerMessageBlocked"]).toBe(true);
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
    expect(await promise).toBe(false);
    expect(menu["pointerMessageBlocked"]).toBe(false);
    await game.scene.ui.revertMode();
    expect(game.scene.ui.canProcessPointerInput(menu)).toBe(true);
  });
  it("routes a delegated tutorial through MESSAGE rather than the background command", async () => {
    const command = game.scene.ui.handlers[UiMode.COMMAND];
    command.active = true;
    handler.active = false;
    vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(command);
    const input = vi.spyOn(command, "processInput");
    const promise = handleTutorial(Tutorial.INTRO);
    await completeTutorial();
    expect(await promise).toBe(true);
    expect(input).not.toHaveBeenCalled();
  });
  it("rejects old overlay completion callbacks after cancellation and reopen", async () => {
    handler.initTutorialOverlay(game.scene.ui);
    const transitions: (() => void)[] = [];
    vi.spyOn(game.scene.tweens, "add").mockImplementation(config => {
      const tween = { remove: vi.fn() } as unknown as Phaser.Tweens.Tween;
      transitions.push(() => (config as Phaser.Types.Tweens.TweenBuilderConfig).onComplete?.(tween, []));
      return tween;
    });
    const first = handleTutorial(Tutorial.MENU);
    const firstRun = game.scene.ui.tutorialSession;
    const second = handleTutorial(Tutorial.INTRO);
    expect(await first).toBe(false);
    transitions[0]();
    await flush();
    expect(game.scene.ui.tutorialSession).not.toBe(firstRun);
    expect(game.scene.disableMenu).toBe(true);
    expect(game.scene.ui.showDialogue).not.toHaveBeenCalled();
    game.scene.ui.tutorialSession!.cancel();
    expect(await second).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("restores a pre-existing menu lock", async () => {
    game.scene.disableMenu = true;
    const promise = handleTutorial(Tutorial.INTRO);
    await completeTutorial();
    expect(await promise).toBe(true);
    expect(game.scene.disableMenu).toBe(true);
  });
  it("supports bare tutorialActive prompts used by previews and invalid-team warnings", () => {
    const done = vi.fn(() => {
      handler.tutorialActive = false;
    });
    handler.tutorialActive = true;
    handler.showText("Contextual prompt", 20, done, null, true);
    click();
    expect(done).not.toHaveBeenCalled();
    click();
    expect(done).toHaveBeenCalledOnce();
    expect(handler["awaitingActionInput"]).toBe(false);
  });
  it("retains a new synchronous tutorial prompt's wait state", () => {
    const done = vi.fn();
    handler.tutorialActive = true;
    handler.showText("First", 0, () => handler.showText("Second", 0, done, null, true), null, true);
    click();
    expect(handler["awaitingActionInput"]).toBe(true);
    click();
    expect(done).toHaveBeenCalledOnce();
  });
});
