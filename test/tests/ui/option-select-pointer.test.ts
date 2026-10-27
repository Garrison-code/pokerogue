import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { ConfirmModeConfig, OptionSelectItem, OptionSelectModeConfig } from "#types/ui-types";
import type { OptionSelectUiHandler } from "#ui/option-select-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - option selection with a mouse", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: OptionSelectUiHandler;
  let pointer: Phaser.Input.Pointer;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.OPTION_SELECT] as OptionSelectUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });

  async function open(options: OptionSelectItem[], config: Partial<OptionSelectModeConfig> = {}): Promise<void> {
    if (handler["mode"] === UiMode.TITLE && game.scene.ui.mode === UiMode.TITLE) {
      await game.scene.ui.setMode(UiMode.MESSAGE);
    }
    await game.scene.ui.setOverlayMode(handler["mode"], { options, ...config });
  }

  async function openConfirm(config: ConfirmModeConfig): Promise<void> {
    handler = game.scene.ui.handlers[UiMode.CONFIRM] as OptionSelectUiHandler;
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, config);
  }

  function click(row: number): void {
    const stopPropagation = vi.fn();
    handler["pointerRows"][row].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }

  function wheel(deltaY: number): void {
    const stopPropagation = vi.fn();
    handler["pointerRows"][0].emit("wheel", pointer, 0, deltaY, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }

  function absoluteCursor(): number {
    return handler.getCursor() + handler["scrollCursor"];
  }

  describe.each([UiMode.OPTION_SELECT, UiMode.MENU_OPTION_SELECT, UiMode.TITLE])("option mode %i", mode => {
    beforeEach(() => {
      handler = game.scene.ui.handlers[mode] as OptionSelectUiHandler;
    });

    it("selects a different item first, then confirms it once through the existing action path", async () => {
      const selected = vi.fn(() => true);
      const onHover = vi.fn();
      await open([
        { label: "First", handler: vi.fn() },
        { label: "Second", handler: selected, onHover },
      ]);
      const processInput = vi.spyOn(game.scene.ui, "processInput");

      click(1);
      expect(handler.getCursor()).toBe(1);
      expect(onHover).toHaveBeenCalledOnce();
      expect(selected).not.toHaveBeenCalled();
      click(1);
      expect(processInput).toHaveBeenCalledWith(Button.ACTION);
      expect(selected).toHaveBeenCalledOnce();
      expect(handler.active).toBe(false);
    });

    it("confirms the initially selected item without a preliminary click", async () => {
      const selected = vi.fn(() => true);
      await open([{ label: "Selected", handler: selected }]);
      click(0);
      expect(selected).toHaveBeenCalledOnce();
    });

    it("ignores hover, right click and unavailable items", async () => {
      const unavailable = vi.fn();
      await open([
        { label: "First", handler: vi.fn() },
        { label: "Unavailable", handler: unavailable, selectable: false },
        { label: "Last", handler: vi.fn() },
      ]);
      handler["pointerRows"][2].emit("pointerover", pointer);
      expect(handler.getCursor()).toBe(0);
      click(1);
      pointer.buttons = 2;
      click(2);
      expect(handler.getCursor()).toBe(0);
      expect(unavailable).not.toHaveBeenCalled();
    });

    it("moves one selectable item per wheel event and stops at the boundaries", async () => {
      const selected = vi.fn(() => true);
      const options = Array.from({ length: 20 }, (_, index) => ({
        label: `Option ${index}`,
        selectable: index !== 1 && index !== 18,
        handler: selected,
      }));
      await open(options, { maxOptions: 3 });
      wheel(-120);
      expect(absoluteCursor()).toBe(0);
      wheel(0);
      expect(absoluteCursor()).toBe(0);
      wheel(10000);
      expect(absoluteCursor()).toBe(2);
      wheel(120);
      expect(absoluteCursor()).toBe(3);
      expect(handler["scrollCursor"]).toBe(1);
      wheel(-120);
      expect(absoluteCursor()).toBe(2);
      for (let index = 0; index < 25; index++) {
        wheel(120);
      }
      expect(absoluteCursor()).toBe(19);
      expect(handler["scrollCursor"]).toBe(17);
      expect(selected).not.toHaveBeenCalled();
      click(0);
      expect(absoluteCursor()).toBe(17);
      expect(selected).not.toHaveBeenCalled();
      click(0);
      expect(selected).toHaveBeenCalledOnce();
    });

    it("preserves failure, keepOpen and noSoundEffects behavior", async () => {
      const selected = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
      await open([{ label: "Keep open", handler: selected, keepOpen: true, noSoundEffects: true }]);
      const playError = vi.spyOn(game.scene.ui, "playError");
      const playSelect = vi.spyOn(game.scene.ui, "playSelect");
      click(0);
      expect(playError).toHaveBeenCalledOnce();
      expect(handler.active).toBe(true);
      playSelect.mockClear();
      click(0);
      expect(selected).toHaveBeenCalledTimes(2);
      expect(playSelect).not.toHaveBeenCalled();
      expect(handler.active).toBe(true);
    });

    it("honors confirmation delays and cancels old timers when reopening", async () => {
      const selected = vi.fn(() => true);
      await open([{ label: "Delayed", handler: selected }], { inputDelay: 100000 });
      const timer = handler["inputDelayTimer"]!;
      click(0);
      expect(selected).not.toHaveBeenCalled();
      await game.scene.ui.revertMode();
      expect(timer.hasDispatched).toBe(true);
      await open([{ label: "Immediate", handler: selected }]);
      click(0);
      expect(selected).toHaveBeenCalledOnce();
    });

    it("blocks pointer input during a tutorial, an overlay and a transition", async () => {
      const selected = vi.fn(() => true);
      await open([
        { label: "First", handler: selected },
        { label: "Second", handler: selected },
      ]);
      const tutorialAction = vi.fn();
      handler.tutorialActive = true;
      handler["onActionInput"] = tutorialAction;
      click(0);
      click(1);
      wheel(120);
      expect(absoluteCursor()).toBe(0);
      expect(tutorialAction).not.toHaveBeenCalled();
      handler.tutorialActive = false;

      await game.scene.ui.setOverlayMode(UiMode.CONFIRM, { yesHandler: vi.fn(), noHandler: vi.fn() });
      click(0);
      wheel(120);
      expect(absoluteCursor()).toBe(0);
      await game.scene.ui.revertMode();

      await game.scene.ui.fadeOut(1);
      click(0);
      click(1);
      wheel(120);
      expect(absoluteCursor()).toBe(0);
      expect(selected).not.toHaveBeenCalled();
      await game.scene.ui.fadeIn(1);
    });

    it("keeps keyboard wrapping and cancel behavior after mouse navigation", async () => {
      const cancelled = vi.fn(() => true);
      await open([
        { label: "First", handler: vi.fn() },
        { label: "Cancel", handler: cancelled },
      ]);
      wheel(120);
      game.scene.ui.processInput(Button.DOWN);
      expect(absoluteCursor()).toBe(0);
      game.scene.ui.processInput(Button.UP);
      expect(absoluteCursor()).toBe(1);
      game.scene.ui.processInput(Button.CANCEL);
      expect(cancelled).toHaveBeenCalledOnce();
    });

    it("destroys old hit areas and does not accumulate callbacks after reopening", async () => {
      const selected = vi.fn(() => true);
      await open([{ label: "First", handler: selected }]);
      const oldRow = handler["pointerRows"][0];
      await game.scene.ui.revertMode();
      expect(oldRow.listenerCount("pointerdown")).toBe(0);
      expect(oldRow.listenerCount("wheel")).toBe(0);
      expect(handler.active).toBe(false);
      await open([{ label: "Reopened", handler: selected }]);
      expect(handler["pointerRows"][0].listenerCount("wheel")).toBe(1);
      click(0);
      expect(selected).toHaveBeenCalledOnce();
    });

    it("does not enable other menus that inherit the same base", () => {
      for (const unsupportedMode of [UiMode.MENU, UiMode.AUTO_COMPLETE]) {
        const otherHandler = game.scene.ui.handlers[unsupportedMode] as OptionSelectUiHandler;
        expect(otherHandler["supportsPointerInput"]).toBe(false);
        expect(otherHandler["pointerRows"]).toHaveLength(0);
      }
    });
  });

  it.each([0, 1])("confirms the existing preselected yes/no item %i", async index => {
    const yesHandler = vi.fn();
    const noHandler = vi.fn();
    await openConfirm({ yesHandler, noHandler });
    game.scene.ui.setCursor(index);
    click(index);
    expect(yesHandler).toHaveBeenCalledTimes(index === 0 ? 1 : 0);
    expect(noHandler).toHaveBeenCalledTimes(index === 1 ? 1 : 0);
    expect(handler.active).toBe(false);
  });

  it("selects No before confirming and never invokes Yes", async () => {
    const yesHandler = vi.fn();
    const noHandler = vi.fn();
    await openConfirm({ yesHandler, noHandler });
    click(1);
    expect(handler.getCursor()).toBe(1);
    expect(yesHandler).not.toHaveBeenCalled();
    expect(noHandler).not.toHaveBeenCalled();
    click(1);
    expect(noHandler).toHaveBeenCalledOnce();
    expect(yesHandler).not.toHaveBeenCalled();
  });

  it("clamps confirmation wheel navigation without confirming, then shares selection with the keyboard", async () => {
    const yesHandler = vi.fn();
    const noHandler = vi.fn();
    await openConfirm({ yesHandler, noHandler });
    wheel(-120);
    expect(handler.getCursor()).toBe(0);
    wheel(120);
    wheel(120);
    expect(handler.getCursor()).toBe(1);
    expect(yesHandler).not.toHaveBeenCalled();
    expect(noHandler).not.toHaveBeenCalled();
    game.scene.ui.processInput(Button.UP);
    click(0);
    expect(yesHandler).toHaveBeenCalledOnce();
    expect(noHandler).not.toHaveBeenCalled();
  });

  it("keeps confirmation delay blocking mouse input while retaining the explicit cancel bypass", async () => {
    const yesHandler = vi.fn();
    const noHandler = vi.fn();
    await openConfirm({ yesHandler, noHandler, inputDelay: 100000, canBypassInputDelay: true });
    const timer = handler["inputDelayTimer"]!;
    click(0);
    click(1);
    click(1);
    expect(yesHandler).not.toHaveBeenCalled();
    expect(noHandler).not.toHaveBeenCalled();
    game.scene.ui.processInput(Button.CANCEL);
    expect(noHandler).toHaveBeenCalledOnce();
    expect(timer.hasDispatched).toBe(true);
    expect(handler["inputDelayTimer"]).toBeNull();
  });

  it("retains a blocked confirmation cancel shortcut but allows explicitly clicking No", async () => {
    const yesHandler = vi.fn();
    const noHandler = vi.fn();
    await openConfirm({ yesHandler, noHandler, blockCancelButton: true });
    game.scene.ui.processInput(Button.CANCEL);
    expect(noHandler).not.toHaveBeenCalled();
    click(1);
    expect(noHandler).not.toHaveBeenCalled();
    click(1);
    expect(noHandler).toHaveBeenCalledOnce();
    expect(yesHandler).not.toHaveBeenCalled();
  });
});
