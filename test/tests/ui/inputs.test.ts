import { TouchControl } from "#app/touch-controls";
import { Button } from "#enums/buttons";
import { CFG_KEYBOARD_QWERTY } from "#inputs/cfg-keyboard-qwerty";
import { PAD_XBOX360 } from "#inputs/pad-xbox360";
import { GameManager } from "#test/framework/game-manager";
import { InputsHandler } from "#test/framework/inputs-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("Inputs", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let originalDocument: Document;

  beforeAll(() => {
    originalDocument = window.document;
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "document", {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    game.inputsHandler = new InputsHandler(game.scene);
    // Input repeat tests must not act on a battle menu left by another suite.
    vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
  });

  it("Mobile - test touch holding for 1ms - 1 input", async () => {
    await game.inputsHandler.pressTouch("dpadUp", 1);
    expect(game.inputsHandler.log.length).toBe(1);
  });

  it("Mobile - test touch holding for 200ms - 1 input", async () => {
    await game.inputsHandler.pressTouch("dpadUp", 200);
    expect(game.inputsHandler.log.length).toBe(1);
  });

  it("Mobile - test touch holding for 300ms - 2 input", async () => {
    await game.inputsHandler.pressTouch("dpadUp", 300);
    expect(game.inputsHandler.log.length).toBe(2);
  });

  it("Mobile - test touch holding for 1000ms - 4 input", async () => {
    await game.inputsHandler.pressTouch("dpadUp", 1050);
    expect(game.inputsHandler.log.length).toBe(5);
  });

  it("keyboard - test input holding for 200ms - 1 input", async () => {
    await game.inputsHandler.pressKeyboardKey(CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP, 200);
    expect(game.inputsHandler.log.length).toBe(1);
  });

  it("keyboard - test input holding for 300ms - 2 input", async () => {
    await game.inputsHandler.pressKeyboardKey(CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP, 300);
    expect(game.inputsHandler.log.length).toBe(2);
  });

  it("keyboard - test input holding for 1000ms - 4 input", async () => {
    await game.inputsHandler.pressKeyboardKey(CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP, 1050);
    expect(game.inputsHandler.log.length).toBe(5);
  });

  it("releases a held keyboard key when an HTML tool gains focus and accepts later game input", async () => {
    const keyCode = CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP;
    game.scene.input.keyboard?.emit("keydown", { keyCode });
    expect(game.inputsHandler.log.length).toBe(1);
    game.scene.game.events.emit("type-chart/focus");
    expect(game.inputsHandler.logUp.length).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(game.inputsHandler.log.length).toBe(1);
    await game.inputsHandler.pressKeyboardKey(keyCode, 1);
    expect(game.inputsHandler.log.length).toBe(2);
  });

  it("gamepad - test input holding for 1ms - 1 input", async () => {
    await game.inputsHandler.pressGamepadButton(PAD_XBOX360.deviceMapping.RC_S, 1);
    expect(game.inputsHandler.log.length).toBe(1);
  });

  it("gamepad - test input holding for 200ms - 1 input", async () => {
    await game.inputsHandler.pressGamepadButton(PAD_XBOX360.deviceMapping.RC_S, 200);
    expect(game.inputsHandler.log.length).toBe(1);
  });

  it("gamepad - test input holding for 300ms - 2 input", async () => {
    await game.inputsHandler.pressGamepadButton(PAD_XBOX360.deviceMapping.RC_S, 300);
    expect(game.inputsHandler.log.length).toBe(2);
  });

  it("gamepad - test input holding for 1000ms - 4 input", async () => {
    await game.inputsHandler.pressGamepadButton(PAD_XBOX360.deviceMapping.RC_S, 1050);
    expect(game.inputsHandler.log.length).toBe(5);
  });
  it.each(["keyboard", "gamepad", "touch"])(
    "stops %s repeats when the opening input suspends gameplay",
    async source => {
      const controller = game.scene.inputController;
      const touch = new TouchControl();
      const node = document.querySelector<HTMLElement>("[data-key='ACTION']")!;
      let restore: (() => void) | undefined;
      controller.events.once("input_down", () => {
        restore = controller.suspendGameplayInput();
      });
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        if (source === "keyboard") {
          controller.keyboardKeyDown({ keyCode: CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP } as KeyboardEvent);
        } else if (source === "gamepad") {
          controller.gamepadButtonDown(
            game.scene.input.gamepad!.gamepads.at(-1)!,
            { index: PAD_XBOX360.deviceMapping.RC_S } as Phaser.Input.Gamepad.Button,
            1,
          );
        } else {
          touch.touchButtonDown(node, "ACTION");
        }
        expect(controller.gameplayInputSuspended).toBe(true);
        vi.advanceTimersByTime(1000);
        expect(game.inputsHandler.log).toHaveLength(1);
        const process = vi.spyOn(game.scene.ui, "processInput").mockClear();
        controller.events.emit("input_down", { controller_type: "gamepad", button: Button.CANCEL });
        expect(process).not.toHaveBeenCalled();
        restore!();
        vi.advanceTimersByTime(1000);
        expect(game.inputsHandler.log).toHaveLength(2);
        controller.keyboardKeyDown({
          keyCode: CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP,
          repeat: true,
        } as KeyboardEvent);
        expect(game.inputsHandler.log).toHaveLength(2);
        controller.keyboardKeyDown({ keyCode: CFG_KEYBOARD_QWERTY.deviceMapping.KEY_ARROW_UP } as KeyboardEvent);
        expect(process).toHaveBeenCalled();
      } finally {
        restore?.();
        controller.loseFocus();
        touch.deactivatePressedKey();
        vi.useRealTimers();
      }
    },
  );
});
