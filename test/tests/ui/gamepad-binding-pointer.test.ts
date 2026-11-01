import { Button } from "#enums/buttons";
import { Device } from "#enums/devices";
import { UiMode } from "#enums/ui-mode";
import { PAD_XBOX360 } from "#inputs/pad-xbox360";
import { SettingGamepad } from "#system/settings-gamepad";
import { GameManager } from "#test/framework/game-manager";
import type { InterfaceConfig } from "#types/inputs";
import type { GamepadBindingUiHandler } from "#ui/gamepad-binding-ui-handler";
import { deepCopy } from "#utils/data";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - gamepad binding mouse controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: GamepadBindingUiHandler;
  let pointer: Phaser.Input.Pointer;
  let returned: ReturnType<typeof vi.fn>;
  let previousSource: string;
  let previousDevice: string | undefined;
  let previousConfigs: Record<string, InterfaceConfig>;
  const pad = { id: "mouse xbox" } as Phaser.Input.Gamepad.Gamepad;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    const controller = game.scene.inputController;
    controller.ensureKeyboardIsInit();
    previousSource = controller.lastSource;
    previousDevice = controller.selectedDevice[Device.GAMEPAD];
    previousConfigs = { ...controller["configs"] };
    const config = deepCopy(PAD_XBOX360);
    config.custom = { ...config.default };
    controller["configs"]["mouse xbox"] = config as unknown as InterfaceConfig;
    controller.selectedDevice[Device.GAMEPAD] = "mouse xbox";
    vi.spyOn(controller, "getGamepadsName").mockReturnValue(["mouse xbox"]);
    await game.scene.ui.setOverlayMode(UiMode.SETTINGS_GAMEPAD);
    handler = game.scene.ui.handlers[UiMode.GAMEPAD_BINDING] as GamepadBindingUiHandler;
    returned = vi.fn();
    vi.useFakeTimers();
    await game.scene.ui.setOverlayMode(UiMode.GAMEPAD_BINDING, {
      target: SettingGamepad.BUTTON_STATS,
      cancelHandler: returned,
    });
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui.handlers[UiMode.SETTINGS_GAMEPAD].clear();
    game.scene.inputController.deactivatePressedKey();
    game.scene.inputController["configs"] = previousConfigs;
    game.scene.inputController.lastSource = previousSource;
    if (previousDevice == null) {
      delete game.scene.inputController.selectedDevice[Device.GAMEPAD];
    } else {
      game.scene.inputController.selectedDevice[Device.GAMEPAD] = previousDevice;
    }
    vi.useRealTimers();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.TITLE;
  });
  function capture(index = 0) {
    vi.advanceTimersByTime(100);
    handler.gamepadButtonDown(pad, { index } as Phaser.Input.Gamepad.Button, 1);
    handler["pointerTargets"]!.update();
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === name)!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects swap first and runs the real existing swap only once", () => {
    const config = game.scene.inputController.getActiveConfig(Device.GAMEPAD)!;
    const assign = vi.spyOn(game.scene.inputController, "assignBinding");
    const save = vi.spyOn(game.scene.gameData, "saveMappingConfigs").mockImplementation(() => {});
    capture();
    expect(handler["targetButtonIcon"].visible).not.toBe(false);
    click("binding-choice-1");
    expect(assign).not.toHaveBeenCalled();
    click("binding-choice-1");
    click("binding-choice-1");
    expect(assign).toHaveBeenCalledOnce();
    expect(config.custom!.RC_S).toBe(SettingGamepad.BUTTON_STATS);
    expect(config.custom!.SELECT).toBe(SettingGamepad.BUTTON_ACTION);
    expect(save).toHaveBeenCalledOnce();
    expect(returned).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("confirms the preselected return without saving", () => {
    const save = vi.spyOn(game.scene.gameData, "saveMappingConfigs");
    capture();
    click("binding-choice-0");
    expect(returned).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  it("retains swap failure and returns only once", () => {
    vi.spyOn(game.scene.inputController, "assignBinding").mockReturnValue(false);
    capture();
    click("binding-choice-1");
    click("binding-choice-1");
    expect(returned).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("keeps right and keyboard CANCEL unable to close at both input stages", () => {
    const error = vi.spyOn(game.scene.ui, "playError");
    pointer.buttons = 2;
    click("binding-body");
    expect(returned).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    capture();
    click("binding-body");
    handler.processInput(Button.CANCEL);
    expect(returned).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });
  it("only captures the selected device and rejects directional or unknown buttons", () => {
    vi.advanceTimersByTime(100);
    handler.gamepadButtonDown(
      { id: "other" } as Phaser.Input.Gamepad.Gamepad,
      { index: 0 } as Phaser.Input.Gamepad.Button,
      1,
    );
    for (const index of [12, 13, 14, 15, 99]) {
      handler.gamepadButtonDown(pad, { index } as Phaser.Input.Gamepad.Button, 1);
    }
    expect(handler["buttonPressed"]).toBeNull();
  });
  it("ignores input while an upper interface or transition is active", () => {
    vi.advanceTimersByTime(100);
    game.scene.ui["overlayActive"] = true;
    handler.gamepadButtonDown(pad, { index: 0 } as Phaser.Input.Gamepad.Button, 1);
    expect(handler["buttonPressed"]).toBeNull();
  });
  it("stops the captured gamepad ACTION press from repeating into confirmation", () => {
    vi.advanceTimersByTime(100);
    game.scene.input.gamepad!.emit("down", pad, { index: 0 } as Phaser.Input.Gamepad.Button, 1);
    expect(handler["buttonPressed"]).toBe(0);
    vi.advanceTimersByTime(1200);
    expect(returned).not.toHaveBeenCalled();
  });
  it("rejects assigning to a disconnected device after capture", () => {
    capture();
    vi.spyOn(game.scene.inputController, "getGamepadsName").mockReturnValue([]);
    const assign = vi.spyOn(game.scene.inputController, "assignBinding");
    click("binding-choice-1");
    click("binding-choice-1");
    expect(assign).not.toHaveBeenCalled();
    expect(returned).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("does not close or navigate from outside clicks and wheel", () => {
    capture();
    const input = vi.spyOn(game.scene.ui, "processInput");
    handler["pointerBackdrop"]!.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    handler["pointerTargets"]!.zones[0].emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    expect(returned).not.toHaveBeenCalled();
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
  it("invalidates old timers and zones on reopen, then times out only once", () => {
    const old = handler["pointerTargets"]!.zones[0];
    handler.clear();
    handler.show([{ target: SettingGamepad.BUTTON_STATS, cancelHandler: returned }]);
    vi.advanceTimersByTime(99);
    expect(handler["listening"]).toBe(false);
    vi.advanceTimersByTime(6001);
    expect(returned).toHaveBeenCalledOnce();
    expect(old.listenerCount("pointerdown")).toBe(0);
    vi.advanceTimersByTime(10000);
    expect(returned).toHaveBeenCalledOnce();
  });
});
