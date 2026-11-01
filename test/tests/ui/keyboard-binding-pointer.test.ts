import { Button } from "#enums/buttons";
import { Device } from "#enums/devices";
import { UiMode } from "#enums/ui-mode";
import { SettingKeyboard } from "#system/settings-keyboard";
import { GameManager } from "#test/framework/game-manager";
import type { CustomKeyboardConfig } from "#types/inputs";
import type { KeyboardBindingUiHandler } from "#ui/keyboard-binding-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - keyboard binding mouse controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: KeyboardBindingUiHandler;
  let pointer: Phaser.Input.Pointer;
  let config: CustomKeyboardConfig;
  let originalMapping: CustomKeyboardConfig["custom"];
  let returned: ReturnType<typeof vi.fn>;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.SETTINGS_KEYBOARD);
    config = game.scene.inputController.getActiveConfig(Device.KEYBOARD)!;
    originalMapping = { ...config.custom! };
    handler = game.scene.ui.handlers[UiMode.KEYBOARD_BINDING] as KeyboardBindingUiHandler;
    returned = vi.fn();
    vi.useFakeTimers();
    await game.scene.ui.setOverlayMode(UiMode.KEYBOARD_BINDING, {
      target: SettingKeyboard.ALT_BUTTON_DOWN,
      cancelHandler: returned,
    });
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui.handlers[UiMode.SETTINGS_KEYBOARD].clear();
    config.custom = originalMapping;
    game.scene.inputController.deactivatePressedKey();
    vi.useRealTimers();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.TITLE;
  });
  function capture(keyCode = Phaser.Input.Keyboard.KeyCodes.W) {
    vi.advanceTimersByTime(100);
    handler.onKeyDown(new KeyboardEvent("keydown", { keyCode }));
    handler["pointerTargets"]!.update();
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === name)!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects assign first and confirms it only once through the original binding callback", () => {
    const assign = vi.spyOn(game.scene.inputController, "assignBinding").mockReturnValue(true);
    const save = vi.spyOn(game.scene.gameData, "saveMappingConfigs").mockImplementation(() => {});
    capture();
    click("binding-choice-1");
    expect(handler.getCursor()).toBe(1);
    expect(assign).not.toHaveBeenCalled();
    click("binding-choice-1");
    click("binding-choice-1");
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      config,
      SettingKeyboard.ALT_BUTTON_DOWN,
      Phaser.Input.Keyboard.KeyCodes.W,
    );
    expect(save).toHaveBeenCalledOnce();
    expect(returned).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("confirms the preselected return without assigning a binding", () => {
    const assign = vi.spyOn(game.scene.inputController, "assignBinding");
    capture();
    click("binding-choice-0");
    expect(returned).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
  it("retains binding failure, the single return callback and error sound", () => {
    vi.spyOn(game.scene.inputController, "assignBinding").mockReturnValue(false);
    const error = vi.spyOn(game.scene.ui, "playError");
    capture();
    click("binding-choice-1");
    click("binding-choice-1");
    expect(returned).toHaveBeenCalledExactlyOnceWith(false);
    expect(error).toHaveBeenCalledOnce();
  });
  it("keeps CANCEL unable to close while waiting or confirming, including its existing sound", () => {
    const error = vi.spyOn(game.scene.ui, "playError");
    pointer.buttons = 2;
    click("binding-body");
    expect(returned).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    capture();
    click("binding-body");
    expect(handler.processInput(Button.CANCEL)).toBe(false);
    expect(returned).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });
  it("only consumes outside clicks and wheel without closing or selecting", () => {
    capture();
    const input = vi.spyOn(game.scene.ui, "processInput");
    pointer.buttons = 2;
    handler["pointerBackdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    handler["pointerBackdrop"]!.emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    expect(returned).not.toHaveBeenCalled();
  });
  it("retains the existing countdown and closes only once", () => {
    vi.advanceTimersByTime(6099);
    expect(returned).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(10000);
    expect(returned).toHaveBeenCalledOnce();
    expect(handler["listening"]).toBe(false);
  });
  it("does not capture reserved, unknown or repeated keys", () => {
    vi.advanceTimersByTime(100);
    for (const keyCode of [Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.ESC, 999]) {
      handler.onKeyDown(new KeyboardEvent("keydown", { keyCode }));
    }
    handler.onKeyDown(new KeyboardEvent("keydown", { keyCode: Phaser.Input.Keyboard.KeyCodes.W, repeat: true }));
    expect(handler["buttonPressed"]).toBeNull();
  });
  it("does not let the captured ACTION key's repeat confirm the dialog", () => {
    vi.advanceTimersByTime(100);
    game.scene.input.keyboard!.emit(
      "keydown",
      new KeyboardEvent("keydown", { keyCode: Phaser.Input.Keyboard.KeyCodes.SPACE }),
    );
    expect(handler["buttonPressed"]).toBe(Phaser.Input.Keyboard.KeyCodes.SPACE);
    vi.advanceTimersByTime(1200);
    expect(returned).not.toHaveBeenCalled();
  });
  it("rejects assignment if the selected configuration changes after capture", () => {
    capture();
    vi.spyOn(game.scene.inputController, "getActiveConfig").mockReturnValue(null);
    const assign = vi.spyOn(game.scene.inputController, "assignBinding");
    click("binding-choice-1");
    click("binding-choice-1");
    expect(assign).not.toHaveBeenCalled();
    expect(returned).toHaveBeenCalledExactlyOnceWith(false);
  });
  it.each(["upper", "transition", "guard", "touch", "middle"])("blocks %s pointer input", kind => {
    capture();
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "guard") {
      vi.spyOn(game.scene.ui, "canProcessPointerInput").mockReturnValue(false);
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click("binding-choice-1");
    expect(handler.getCursor()).toBe(0);
    expect(returned).not.toHaveBeenCalled();
  });
  it("cancels old listening and close timers when reopening", () => {
    const old = handler["pointerTargets"]!.zones[0];
    handler.clear();
    handler.show([{ target: SettingKeyboard.ALT_BUTTON_DOWN, cancelHandler: returned }]);
    vi.advanceTimersByTime(99);
    expect(handler["listening"]).toBe(false);
    vi.advanceTimersByTime(1);
    expect(handler["listening"]).toBe(true);
    capture();
    vi.advanceTimersByTime(10000);
    expect(returned).not.toHaveBeenCalled();
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
});
