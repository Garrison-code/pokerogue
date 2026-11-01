import { Button } from "#enums/buttons";
import { Device } from "#enums/devices";
import { UiMode } from "#enums/ui-mode";
import { getKeyWithSettingName } from "#inputs/config-handler";
import { SettingKeyboard } from "#system/settings-keyboard";
import { GameManager } from "#test/framework/game-manager";
import type { CustomKeyboardConfig } from "#types/inputs";
import type { SettingsKeyboardUiHandler } from "#ui/keyboard-settings-ui-handler";
import { deepCopy } from "#utils/data";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - keyboard settings mouse controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: SettingsKeyboardUiHandler;
  let pointer: Phaser.Input.Pointer;
  let config: CustomKeyboardConfig;
  let originalMapping: CustomKeyboardConfig["custom"];
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.SETTINGS_KEYBOARD] as SettingsKeyboardUiHandler;
    await game.scene.ui.setOverlayMode(UiMode.SETTINGS_KEYBOARD);
    config = game.scene.inputController.getActiveConfig(Device.KEYBOARD)!;
    originalMapping = { ...config.custom! };
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    config.custom = originalMapping;
    game.scene.ui.handlers[UiMode.KEYBOARD_BINDING].clear();
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.TITLE;
  });
  function click(name: string) {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === name)!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(dy: number) {
    handler["pointerTargets"]!.zones.find(z => z.name === "controls-list")!.emit("wheel", pointer, 0, dy, 0, {
      stopPropagation: vi.fn(),
    });
  }
  it("selects the actual binding row and only then opens the binding dialog", () => {
    const index = handler["keys"].indexOf(SettingKeyboard.ALT_BUTTON_UP);
    expect(index).toBeGreaterThan(0);
    click(`controls-row-${index}`);
    expect(handler.getCursor()).toBe(index);
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_KEYBOARD);
    click(`controls-row-${index}`);
    expect(game.scene.ui.mode).toBe(UiMode.KEYBOARD_BINDING);
    expect(game.scene.ui.handlers[UiMode.KEYBOARD_BINDING]["target"]).toBe(SettingKeyboard.ALT_BUTTON_UP);
  });
  it("keeps locked primary bindings locked", () => {
    click("controls-row-0");
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_KEYBOARD);
  });
  it("moves by actual row, scrolls and stops at boundaries without editing", () => {
    const setting = vi.spyOn(handler, "setSetting");
    wheel(-120);
    expect(handler.getCursor()).toBe(0);
    for (let i = 0; i < handler["keys"].length + 2; i++) {
      wheel(120);
    }
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(handler["keys"].length - 1);
    expect(handler["pointerTargets"]!.zones.find(z => z.name === "controls-row-0")!.visible).toBe(false);
    expect(setting).not.toHaveBeenCalled();
    const last = handler.getCursor() + handler["scrollCursor"];
    wheel(0);
    pointer.wasTouch = true;
    wheel(-120);
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(last);
  });
  it("deletes by setting identity even when its label is translated", () => {
    const index = handler["keys"].indexOf(SettingKeyboard.ALT_BUTTON_UP);
    const key = getKeyWithSettingName(config, SettingKeyboard.ALT_BUTTON_UP)!;
    const label = handler["settingLabels"][index];
    const previousText = label.text;
    label.setText("Translated label with no enum equivalent");
    handler["selectPointerRow"](index);
    const save = vi.spyOn(game.scene.gameData, "saveMappingConfigs").mockImplementation(() => {});
    handler.onDeleteDown();
    expect(config.custom![key]).toBe(-1);
    expect(save).toHaveBeenCalledOnce();
    label.setText(previousText);
  });
  it("uses the existing reset action from the visible footer", () => {
    const reset = vi.spyOn(game.scene.gameData, "resetMappingToDefault").mockReturnValue(true);
    const object = handler["footerTargets"][4].object;
    object.visible = true;
    click("controls-footer-4");
    Reflect.deleteProperty(object, "visible");
    expect(reset).toHaveBeenCalledExactlyOnceWith(Device.KEYBOARD);
  });
  it("keeps navigation and return available without an active configuration", () => {
    vi.spyOn(game.scene.inputController, "getActiveConfig").mockReturnValue(null);
    handler.updateBindings();
    expect(handler["keys"]).toHaveLength(0);
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("controls-page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const setMode = vi.spyOn(game.scene.ui, "setMode").mockResolvedValue(undefined);
    pointer.buttons = 1;
    handler["tabMenu"]["pointerZones"][0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(setMode).toHaveBeenCalledExactlyOnceWith(UiMode.SETTINGS_GENERAL);
  });
  it("rebuilds targets when the device configuration changes", () => {
    const old = handler["pointerTargets"]!.zones[0];
    const replacement = deepCopy(config);
    vi.spyOn(game.scene.inputController, "getActiveConfig").mockReturnValue(replacement);
    handler["observePointerLayout"]();
    expect(old.listenerCount("pointerdown")).toBe(0);
    expect(handler["activeLayoutConfig"]).toBe(replacement);
    expect(handler.getCursor()).toBe(0);
  });
  it.each(["upper", "transition", "guard", "touch", "middle"])("blocks %s selection", kind => {
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
    click("controls-row-1");
    expect(handler.getCursor()).toBe(0);
  });
  it("routes page right clicks through original CANCEL without first selecting a row", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("controls-row-1");
    expect(handler.getCursor()).toBe(0);
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it("initializes through the existing keyboard path and removes old targets on reopen", () => {
    const ensure = vi.spyOn(game.scene.inputController, "ensureKeyboardIsInit");
    const old = handler["pointerTargets"]!.zones[0];
    handler.clear();
    handler.show([]);
    expect(ensure).toHaveBeenCalled();
    expect(old.listenerCount("pointerdown")).toBe(0);
    expect(handler["tabMenu"]["pointerZones"]).toHaveLength(7);
  });
});
