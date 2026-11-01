import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { type SaveSlotSelectUiHandler, SaveSlotUiMode } from "#ui/save-slot-select-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - save slots with a mouse", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: SaveSlotSelectUiHandler;
  let pointer: Phaser.Input.Pointer;
  let callback: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    handler = game.scene.ui.handlers[UiMode.SAVE_SLOT] as SaveSlotSelectUiHandler;
    vi.spyOn(game.scene.gameData, "getSession").mockResolvedValue(undefined);
    callback = vi.fn();
    const addTween = game.scene.tweens.add.bind(game.scene.tweens);
    vi.spyOn(game.scene.tweens, "add").mockImplementation(config => {
      const tweenConfig = config as Phaser.Types.Tweens.TweenBuilderConfig;
      if (tweenConfig.targets === handler["sessionSlotsContainer"]) {
        return {
          remove: vi.fn(),
          complete: () => (tweenConfig.onComplete as () => void)?.(),
        } as unknown as Phaser.Tweens.Tween;
      }
      return addTween(config);
    });
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });

  async function open(mode = SaveSlotUiMode.LOAD) {
    await game.scene.ui.setMode(UiMode.SAVE_SLOT, mode, callback);
    await vi.waitFor(() => expect(handler["sessionSlots"].every(s => s.loaded)).toBe(true));
  }
  function click(row = 0, target = handler["pointerRows"][row]) {
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(dy: number) {
    const stopPropagation = vi.fn();
    handler["pointerListZone"]!.emit("wheel", pointer, 0, dy, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function selected() {
    return handler.getCursor() + handler["scrollCursor"];
  }
  async function settled() {
    handler["scrollTween"]?.complete();
    expect(handler["scrollTween"]).toBeNull();
  }

  it("selects another slot before saving and confirms the preselected slot through ACTION", async () => {
    await open(SaveSlotUiMode.SAVE);
    const action = vi.spyOn(game.scene.ui, "processInput");
    const setMode = vi.spyOn(game.scene.ui, "setMode");
    click(1);
    expect(selected()).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    click(1);
    expect(action).toHaveBeenCalledWith(Button.ACTION);
    expect(callback).toHaveBeenCalledExactlyOnceWith(1);
    expect(setMode).toHaveBeenCalledWith(UiMode.MESSAGE);
  });

  it("confirms an initially selected empty save slot once", async () => {
    await open(SaveSlotUiMode.SAVE);
    const zone = handler["pointerRows"][0];
    click();
    zone.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(callback).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("preserves empty load errors and malformed slot management", async () => {
    await open();
    const error = vi.spyOn(game.scene.ui, "playError");
    click();
    expect(error).toHaveBeenCalledOnce();
    const slot = handler["sessionSlots"][0];
    slot.hasData = true;
    slot.malformed = true;
    click();
    expect(game.scene.ui.mode).toBe(UiMode.MENU_OPTION_SELECT);
    expect(callback).not.toHaveBeenCalled();
    expect(handler["previewPointerZone"]!.visible).toBe(false);
  });

  it("opens the existing load submenu and does not pass its opening click through", async () => {
    await open();
    handler["sessionSlots"][0].hasData = true;
    click();
    expect(game.scene.ui.mode).toBe(UiMode.MENU_OPTION_SELECT);
    expect(callback).not.toHaveBeenCalled();
    game.scene.ui.processInput(Button.CANCEL);
    expect(game.scene.ui.mode).toBe(UiMode.SAVE_SLOT);
  });

  it("blocks confirmation while loading, then refreshes the relative cursor after scrolling", async () => {
    const resolvers: ((value: undefined) => void)[] = [];
    vi.mocked(game.scene.gameData.getSession).mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    await game.scene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.SAVE, callback);
    click();
    click(1);
    click(1);
    expect(callback).not.toHaveBeenCalled();
    wheel(120);
    wheel(120);
    expect(selected()).toBe(3);
    resolvers.forEach(resolve => resolve(undefined));
    await vi.waitFor(() => expect(handler["sessionSlots"].every(s => s.loaded)).toBe(true));
    expect(handler.getCursor()).toBe(1);
    expect(selected()).toBe(3);
    await settled();
    click(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("moves one slot per wheel event, clamps boundaries, and blocks moving card clicks", async () => {
    await open(SaveSlotUiMode.SAVE);
    wheel(-120);
    wheel(0);
    expect(selected()).toBe(0);
    wheel(9999);
    expect(selected()).toBe(1);
    wheel(120);
    expect(selected()).toBe(2);
    const oldTween = handler["scrollTween"]!;
    const remove = vi.spyOn(oldTween, "remove");
    click(0);
    expect(selected()).toBe(2);
    wheel(120);
    expect(remove).toHaveBeenCalledOnce();
    wheel(120);
    wheel(120);
    expect(selected()).toBe(4);
    expect(handler["scrollCursor"]).toBe(3);
    expect(callback).not.toHaveBeenCalled();
    await settled();
    click(0);
    expect(selected()).toBe(3);
    expect(callback).not.toHaveBeenCalled();
  });

  it("opens preview only from a ready, valid selected slot", async () => {
    await open();
    const slot = handler["sessionSlots"][0];
    slot.hasData = true;
    slot.saveData = {} as typeof slot.saveData;
    handler.setCursor(0);
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    expect(handler["previewPointerZone"]!.visible).toBe(true);
    click(0, handler["previewPointerZone"]!);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.RIGHT);
    slot.malformed = true;
    handler.setCursor(0);
    expect(handler["previewPointerZone"]!.visible).toBe(false);
    click(0, handler["previewPointerZone"]!);
    expect(action).toHaveBeenCalledOnce();
  });

  it("routes right clicks on cards and the page through CANCEL once", async () => {
    await open();
    pointer.buttons = 2;
    const action = vi.spyOn(game.scene.ui, "processInput");
    click(0, handler["pointerBackground"]!);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(callback).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it("ignores hover, middle buttons, touch, and horizontal wheels", async () => {
    await open(SaveSlotUiMode.SAVE);
    handler["pointerRows"][1].emit("pointerover", pointer);
    pointer.buttons = 4;
    click(1);
    pointer.buttons = 1;
    pointer.wasTouch = true;
    click();
    wheel(120);
    pointer.wasTouch = false;
    wheel(0);
    expect(selected()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("blocks background operations during tutorials, upper menus and transitions", async () => {
    await open(SaveSlotUiMode.SAVE);
    handler.tutorialActive = true;
    click(1);
    wheel(120);
    handler.tutorialActive = false;
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, {
      yesHandler: vi.fn(),
      noHandler: () => game.scene.ui.revertMode(),
    });
    click(1);
    wheel(120);
    pointer.buttons = 2;
    click();
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    await game.scene.ui.revertMode();
    await game.scene.ui.fadeOut(1);
    pointer.buttons = 1;
    click(1);
    wheel(120);
    expect(selected()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
    await game.scene.ui.fadeIn(1);
  });

  it("keeps keyboard wrapping and cancel callbacks after mouse navigation", async () => {
    await open();
    wheel(120);
    game.scene.ui.processInput(Button.UP);
    expect(selected()).toBe(0);
    game.scene.ui.processInput(Button.UP);
    expect(selected()).toBe(4);
    game.scene.ui.processInput(Button.DOWN);
    expect(selected()).toBe(0);
    game.scene.ui.processInput(Button.CANCEL);
    expect(callback).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it("preserves the delayed overwrite confirmation without deleting on the opening click", async () => {
    await open(SaveSlotUiMode.SAVE);
    handler["sessionSlots"][0].hasData = true;
    const deletion = vi.spyOn(game.scene.gameData, "deleteSession").mockResolvedValue(true);
    click();
    await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.CONFIRM));
    expect(deletion).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    game.scene.ui.processInput(Button.CANCEL);
    expect(deletion).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.SAVE_SLOT);
  });
  it("runs overwrite confirmation through the existing delayed Yes callback once", async () => {
    await open(SaveSlotUiMode.SAVE);
    handler["sessionSlots"][0].hasData = true;
    const deletion = vi.spyOn(game.scene.gameData, "deleteSession").mockResolvedValue(true);
    click();
    await vi.waitFor(() => expect(game.scene.ui.mode).toBe(UiMode.CONFIRM));
    const confirm = game.scene.ui.handlers[UiMode.CONFIRM] as import("#ui/confirm-ui-handler").ConfirmUiHandler;
    confirm["inputDelayTimer"]!.callback();
    const stopPropagation = vi.fn();
    confirm["pointerRows"][0].emit("pointerdown", pointer, 0, 0, { stopPropagation });
    await vi.waitFor(() => expect(callback).toHaveBeenCalledExactlyOnceWith(0));
    expect(deletion).toHaveBeenCalledExactlyOnceWith(0);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("refreshes a successfully loaded scrolled slot with its visible row index", async () => {
    const pending = new Map<number, (data: Awaited<ReturnType<typeof game.scene.gameData.getSession>>) => void>();
    vi.mocked(game.scene.gameData.getSession).mockImplementation(
      slot => new Promise(resolve => pending.set(slot, resolve)),
    );
    await game.scene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.LOAD, callback);
    wheel(120);
    wheel(120);
    wheel(120);
    const setCursor = vi.spyOn(handler, "setCursor");
    const data = {
      name: "Fixture",
      gameMode: 0,
      waveIndex: 1,
      timestamp: 0,
      playTime: 0,
      party: [],
      modifiers: [],
    } as unknown as NonNullable<Awaited<ReturnType<typeof game.scene.gameData.getSession>>>;
    pending.get(3)!(data);
    await vi.waitFor(() => expect(handler["sessionSlots"][3].loaded).toBe(true));
    expect(setCursor).toHaveBeenCalledWith(1);
    expect(handler.getCursor()).toBe(1);
    expect(selected()).toBe(3);
  });

  it("clears old targets, tweens and async loads when reopened", async () => {
    let resolveOld!: (value: undefined) => void;
    vi.mocked(game.scene.gameData.getSession).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        }),
    );
    await game.scene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.LOAD, callback);
    const oldSlots = [...handler["sessionSlots"]];
    const oldZone = handler["pointerRows"][0];
    wheel(120);
    wheel(120);
    const tween = handler["scrollTween"]!;
    const remove = vi.spyOn(tween, "remove");
    await game.scene.ui.setMode(UiMode.TITLE, { options: [{ label: "Title", handler: vi.fn() }] });
    expect(remove).toHaveBeenCalledOnce();
    expect(oldZone.listenerCount("pointerdown")).toBe(0);
    vi.mocked(game.scene.gameData.getSession).mockResolvedValue(undefined);
    await open();
    resolveOld(undefined);
    await Promise.resolve();
    expect(handler["sessionSlots"].some(s => oldSlots.includes(s))).toBe(false);
    expect(selected()).toBe(0);
    expect(handler["pointerRows"][0].listenerCount("pointerdown")).toBe(1);
    handler.destroy();
    expect(handler["pointerRows"]).toHaveLength(0);
    expect(handler["scrollTween"]).toBeNull();
  });
});
