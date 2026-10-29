import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { BaseSettingsUiHandler } from "#ui/base-settings-ui-handler";
import { MessageUiHandler } from "#ui/message-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe.each([UiMode.SETTINGS_GENERAL, UiMode.SETTINGS_DISPLAY, UiMode.SETTINGS_AUDIO])(
  "UI - settings mouse controls %i",
  mode => {
    let phaserGame: Phaser.Game;
    let game: GameManager;
    let handler: BaseSettingsUiHandler;
    let pointer: Phaser.Input.Pointer;
    beforeAll(() => {
      phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
    });
    beforeEach(async () => {
      game = new GameManager(phaserGame);
      await game.runToTitle();
      handler = game.scene.ui.handlers[mode] as BaseSettingsUiHandler;
      await game.scene.ui.setOverlayMode(mode);
      pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
      pointer.buttons = 1;
    });
    afterEach(() => {
      Reflect.deleteProperty(handler["footerTargets"][0].object, "visible");
      Reflect.deleteProperty(handler["footerTargets"][2].object, "visible");
      handler?.clear();
      handler.tutorialActive = false;
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
      handler["pointerTargets"]!.zones.find(z => z.name === "settings-list")!.emit("wheel", pointer, 0, dy, 0, {
        stopPropagation: vi.fn(),
      });
    }
    it("selects an unselected row first, then applies the clicked value once", () => {
      const save = vi.spyOn(settings, "update").mockImplementation(() => {});
      const index = mode === UiMode.SETTINGS_DISPLAY ? 2 : 1;
      const value = (handler["optionCursors"][index] + 1) % handler["uiItems"][index].options.length;
      click(`settings-value-${index}-${value}`);
      expect(handler.getCursor()).toBe(index);
      expect(save).not.toHaveBeenCalled();
      click(`settings-value-${index}-${value}`);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        handler["category"],
        handler["uiItems"][index].key,
        handler["uiItems"][index].options[value].value,
      );
      click(`settings-value-${index}-${value}`);
      expect(save).toHaveBeenCalledOnce();
    });
    if (mode === UiMode.SETTINGS_DISPLAY) {
      it("opens and cancels the original language submenu without saving a preference", async () => {
        const save = vi.spyOn(settings, "update").mockImplementation(() => {});
        click("settings-value-0-1");
        await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.OPTION_SELECT));
        click("settings-row-1");
        expect(handler.getCursor()).toBe(0);
        game.scene.ui.processInput(Button.CANCEL);
        await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.SETTINGS_DISPLAY));
        expect(handler["optionCursors"][0]).toBe(0);
        expect(save).not.toHaveBeenCalled();
      });
      it("retains the existing reload path for a theme change", () => {
        const reload = vi.spyOn(settings, "updateAndReload").mockImplementation(() => {});
        const value = handler["optionCursors"][1] ? 0 : 1;
        click(`settings-value-1-${value}`);
        expect(reload).not.toHaveBeenCalled();
        click(`settings-value-1-${value}`);
        expect(reload).toHaveBeenCalledExactlyOnceWith(
          "display",
          "uiTheme",
          handler["uiItems"][1].options[value].value,
        );
      });
    }
    if (mode === UiMode.SETTINGS_AUDIO) {
      it("applies all eleven volume steps and retains keyboard clamping", () => {
        const save = vi.spyOn(settings, "update").mockImplementation(() => {});
        click("settings-row-1");
        for (let value = 0; value <= 10; value++) {
          click(`settings-value-1-${value}`);
          expect(handler["optionCursors"][1]).toBe(value);
        }
        expect(save).toHaveBeenCalledTimes(11);
        expect(save).toHaveBeenLastCalledWith("audio", "masterVolume", 1);
        game.scene.ui.processInput(Button.RIGHT);
        expect(save).toHaveBeenCalledTimes(11);
        for (let i = 0; i < 12; i++) {
          game.scene.ui.processInput(Button.LEFT);
        }
        expect(handler["optionCursors"][1]).toBe(0);
      });
    }
    it("row labels and whitespace select without applying or confirming", () => {
      const action = vi.spyOn(handler, "processInput");
      click("settings-row-2");
      click("settings-row-2");
      expect(handler.getCursor()).toBe(2);
      expect(action).not.toHaveBeenCalled();
    });
    it("moves one row per wheel, scrolls by real index, and clamps at the ends", () => {
      const save = vi.spyOn(settings, "update").mockImplementation(() => {});
      wheel(-120);
      expect(handler.getCursor()).toBe(0);
      wheel(120);
      expect(handler.getCursor()).toBe(1);
      for (let i = 0; i < handler["uiItems"].length + 2; i++) {
        wheel(120);
      }
      expect(handler.getCursor() + handler["scrollCursor"]).toBe(handler["uiItems"].length - 1);
      expect(handler["scrollCursor"]).toBe(Math.max(0, handler["uiItems"].length - handler["rowsToDisplay"]));
      expect(save).not.toHaveBeenCalled();
      wheel(0);
      pointer.wasTouch = true;
      wheel(-120);
      expect(handler.getCursor() + handler["scrollCursor"]).toBe(handler["uiItems"].length - 1);
    });
    it("only enables visible rows and uses the scrolled item's setting key", () => {
      for (let i = 0; i < 8; i++) {
        wheel(120);
      }
      const index = handler["scrollCursor"];
      expect(handler["pointerTargets"]!.zones.find(z => z.name === "settings-row-0")!.visible).toBe(
        handler["scrollCursor"] === 0,
      );
      click(`settings-row-${index}`);
      expect(handler.getCursor() + handler["scrollCursor"]).toBe(index);
    });
    it("keeps setting confirmation and cancellation on the original save path", async () => {
      const index = 1;
      const previous = handler["optionCursors"][index];
      const value = (previous + 1) % handler["uiItems"][index].options.length;
      const item = handler["uiItems"][index];
      const old = item.options[value];
      item.options[value] = { ...old, requiresConfirmation: true };
      const save = vi
        .spyOn(
          handler as unknown as { handleSaveSetting: (item: unknown, value: unknown) => void },
          "handleSaveSetting",
        )
        .mockImplementation(() => {});
      vi.spyOn(game.scene.ui, "showText").mockImplementation((_text, _delay, callback) => callback?.());
      try {
        click(`settings-value-${index}-${value}`);
        click(`settings-value-${index}-${value}`);
        await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.CONFIRM));
        expect(save).not.toHaveBeenCalled();
        const confirm = game.scene.ui.handlers[UiMode.CONFIRM];
        confirm["config"].noHandler();
        expect(handler["optionCursors"][index]).toBe(previous);
        expect(save).not.toHaveBeenCalled();
      } finally {
        item.options[value] = old;
      }
    });
    it("locks changes during messages but keeps original right CANCEL", () => {
      handler.showText("Waiting", 0);
      click("settings-row-1");
      wheel(120);
      expect(handler.getCursor()).toBe(0);
      const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
      pointer.buttons = 2;
      click("settings-row-1");
      expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    });
    it("uses the existing footer ACTION and back inputs", () => {
      const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
      // MockText has no visible state; this fixture exposes the rendered labels.
      const footer = handler["footerTargets"];
      footer[0].object.visible = true;
      footer[2].object.visible = true;
      click("settings-footer-0");
      click("settings-footer-2");
      expect(input.mock.calls).toEqual([[Button.ACTION], [Button.CANCEL]]);
    });
    it("switches tabs immediately through the opt-in TabMenu", () => {
      const setMode = vi.spyOn(game.scene.ui, "setMode").mockResolvedValue(undefined);
      const index = mode === UiMode.SETTINGS_AUDIO ? 0 : 2;
      handler["tabMenu"]["pointerZones"][index].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
      expect(setMode).toHaveBeenCalledExactlyOnceWith(
        mode === UiMode.SETTINGS_AUDIO ? UiMode.SETTINGS_GENERAL : UiMode.SETTINGS_AUDIO,
      );
    });
    it.each(["upper", "transition", "tutorial", "touch", "middle"])("blocks %s input", kind => {
      if (kind === "upper") {
        vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
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
      click("settings-row-1");
      expect(handler.getCursor()).toBe(0);
    });
    it("invalidates old message callbacks and removes all targets on reopen", () => {
      let late: (() => void) | null | undefined;
      vi.spyOn(MessageUiHandler.prototype, "showText").mockImplementation((_text, _delay, callback) => {
        late = callback;
      });
      const callback = vi.fn();
      handler.showText("Wait", 10, callback);
      const oldCallback = late;
      const old = handler["pointerTargets"]!.zones[0];
      handler.clear();
      handler.show([]);
      oldCallback?.();
      expect(callback).not.toHaveBeenCalled();
      expect(old.listenerCount("pointerdown")).toBe(0);
      expect(handler["tabMenu"]["pointerZones"]).toHaveLength(7);
    });
  },
);
