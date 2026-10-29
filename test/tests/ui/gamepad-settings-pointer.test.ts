import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { Device } from "#enums/devices";
import { UiMode } from "#enums/ui-mode";
import { PAD_DUALSHOCK } from "#inputs/pad-dualshock";
import { PAD_GENERIC } from "#inputs/pad-generic";
import { PAD_PROCON } from "#inputs/pad-procon";
import { PAD_UNLICENSED_SNES } from "#inputs/pad-unlicensed-snes";
import { PAD_XBOX360 } from "#inputs/pad-xbox360";
import { SettingGamepad } from "#system/settings-gamepad";
import { GameManager } from "#test/framework/game-manager";
import type { InterfaceConfig } from "#types/inputs";
import type { SettingsGamepadUiHandler } from "#ui/gamepad-settings-ui-handler";
import { deepCopy } from "#utils/data";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - gamepad settings mouse controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: SettingsGamepadUiHandler;
  let pointer: Phaser.Input.Pointer;
  let previousDevice: string | undefined;
  let previousConfigs: Record<string, InterfaceConfig>;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    const controller = game.scene.inputController;
    previousDevice = controller.selectedDevice[Device.GAMEPAD];
    previousConfigs = { ...controller["configs"] };
    const config = deepCopy(PAD_XBOX360);
    config.custom = { ...config.default };
    controller["configs"]["mouse xbox"] = config as unknown as InterfaceConfig;
    controller.selectedDevice[Device.GAMEPAD] = "mouse xbox";
    vi.spyOn(controller, "getGamepadsName").mockReturnValue(["mouse xbox"]);
    handler = game.scene.ui.handlers[UiMode.SETTINGS_GAMEPAD] as SettingsGamepadUiHandler;
    await game.scene.ui.setOverlayMode(UiMode.SETTINGS_GAMEPAD);
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    game.scene.ui.handlers[UiMode.GAMEPAD_BINDING].clear();
    handler.clear();
    game.scene.inputController["configs"] = previousConfigs;
    if (previousDevice == null) {
      delete game.scene.inputController.selectedDevice[Device.GAMEPAD];
    } else {
      game.scene.inputController.selectedDevice[Device.GAMEPAD] = previousDevice;
    }
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
  it("selects a value's row first and applies the existing gamepad support setting", () => {
    const save = vi.spyOn(settings, "update").mockImplementation(() => {});
    const index = handler["keys"].indexOf(SettingGamepad.GAMEPAD_SUPPORT);
    const value = handler["optionCursors"][index] ? 0 : 1;
    click(`controls-value-${index}-${value}`);
    expect(save).not.toHaveBeenCalled();
    click(`controls-value-${index}-${value}`);
    click(`controls-value-${index}-${value}`);
    expect(save).toHaveBeenCalledExactlyOnceWith("gamepad", "enabled", value === 0);
  });
  it("opens the original binding popup using the actual selected setting key", () => {
    const index = handler["keys"].indexOf(SettingGamepad.BUTTON_ACTION);
    click(`controls-row-${index}`);
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_GAMEPAD);
    click(`controls-row-${index}`);
    expect(game.scene.ui.mode).toBe(UiMode.GAMEPAD_BINDING);
    expect(game.scene.ui.handlers[UiMode.GAMEPAD_BINDING]["target"]).toBe(SettingGamepad.BUTTON_ACTION);
  });
  it.each([PAD_XBOX360, PAD_GENERIC, PAD_DUALSHOCK, PAD_PROCON, PAD_UNLICENSED_SNES])(
    "keeps the exact rows for $padID, including shared xbox textures",
    source => {
      const config = deepCopy(source);
      config.custom = { ...config.default };
      game.scene.inputController["configs"]["mouse xbox"] = config as unknown as InterfaceConfig;
      handler["observePointerLayout"]();
      const expected = Object.values(SettingGamepad).filter(
        key => key === SettingGamepad.CONTROLLER || key === SettingGamepad.GAMEPAD_SUPPORT || key in config.settings,
      );
      expect(handler["keys"]).toEqual(expected);
      expect(handler["settingLabels"]).toHaveLength(expected.length);
      expect(handler["optionValueLabels"]).toHaveLength(expected.length);
    },
  );
  it("never confirms locked directional bindings", () => {
    const index = handler["keys"].indexOf(SettingGamepad.BUTTON_UP);
    click(`controls-row-${index}`);
    click(`controls-row-${index}`);
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_GAMEPAD);
  });
  it("clamps wheel selection at the real rows without changing a value", () => {
    const setting = vi.spyOn(handler, "setSetting");
    wheel(-120);
    expect(handler.getCursor()).toBe(0);
    for (let i = 0; i < 40; i++) {
      wheel(120);
    }
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(handler["keys"].length - 1);
    expect(setting).not.toHaveBeenCalled();
  });
  it("shows the original no-device fallback on disconnect and rejects stale rows", () => {
    const old = handler["pointerTargets"]!.zones[0];
    vi.spyOn(game.scene.inputController, "getGamepadsName").mockReturnValue([]);
    handler["observePointerLayout"]();
    expect(handler["keys"]).toHaveLength(0);
    expect(handler["layout"]["noGamepads"].optionsContainer.visible).toBe(true);
    expect(old.listenerCount("pointerdown")).toBe(0);
    const reset = vi.spyOn(game.scene.gameData, "resetMappingToDefault");
    handler.resetMappings();
    expect(reset).not.toHaveBeenCalled();
    pointer.buttons = 2;
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("controls-page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it("opens the controller picker and restores the controller row on cancellation", async () => {
    click("controls-value-0-1");
    await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.OPTION_SELECT));
    game.scene.ui.processInput(Button.CANCEL);
    expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_GAMEPAD);
    expect(handler["optionCursors"][0]).toBe(0);
  });
  it("switches to another connected configuration and displays its device name", () => {
    const controller = game.scene.inputController;
    const other = deepCopy(PAD_DUALSHOCK);
    other.custom = { ...other.default };
    controller["configs"]["mouse dualshock"] = other as unknown as InterfaceConfig;
    vi.spyOn(controller, "getGamepadsName").mockReturnValue(["mouse xbox", "mouse dualshock"]);
    controller.setChosenGamepad("mouse dualshock");
    expect(handler["activeLayoutConfig"]).toBe(other);
    expect(handler["optionValueLabels"][0][0].text).toBe("mouse dualshock");
    expect(handler["keys"]).toContain(SettingGamepad.BUTTON_SUBMIT);
  });
  it.each(["upper", "transition", "guard", "touch", "middle"])("blocks %s pointer input", kind => {
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
  it("removes old zones and rebuilds one set when reopened", () => {
    const old = handler["pointerTargets"]!.zones[0];
    handler.clear();
    handler.show([]);
    expect(old.listenerCount("pointerdown")).toBe(0);
    expect(handler["tabMenu"]["pointerZones"]).toHaveLength(7);
  });
});
