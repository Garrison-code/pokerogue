import { getGameMode } from "#app/game-mode";
import { copyChallenge } from "#data/challenge";
import { Button } from "#enums/buttons";
import { Challenges } from "#enums/challenges";
import { GameModes } from "#enums/game-modes";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { GameChallengesUiHandler } from "#ui/challenges-select-ui-handler";
import { TabMenu } from "#ui/tab-menu";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - challenge selection with a mouse", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: GameChallengesUiHandler;
  let pointer: Phaser.Input.Pointer;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    game.scene.gameMode = getGameMode(GameModes.CHALLENGE);
    handler = game.scene.ui.handlers[UiMode.CHALLENGE_SELECT] as GameChallengesUiHandler;
    handler["challengesContainer"].update = vi.fn();
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  async function open() {
    await game.scene.ui.setMode(UiMode.CHALLENGE_SELECT);
  }
  function click(target: Phaser.GameObjects.Zone) {
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function row(index = 0) {
    return handler["rowPointerZones"][index];
  }
  function arrow(index = 0, direction: "left" | "right" = "right") {
    return handler["arrowPointerZones"][index][direction];
  }
  function tab(index: number) {
    return handler["tabMenu"]["pointerZones"][index];
  }
  function wheel(dy: number, target = row()) {
    const stopPropagation = vi.fn();
    target.emit("wheel", pointer, 0, dy, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function start() {
    return handler["pointerZones"].at(-2)!;
  }
  function reset() {
    return handler["pointerZones"].at(-1)!;
  }
  function selected() {
    return handler.getCursor() + handler["scrollCursor"];
  }

  it("only selects a row, including repeated clicks, without activating start", async () => {
    await open();
    const action = vi.spyOn(game.scene.ui, "processInput");
    click(row(1));
    click(row(1));
    expect(handler.getCursor()).toBe(1);
    expect(handler["startCursor"].visible).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("selects the arrow's row and changes one value through the existing direction input", async () => {
    await open();
    const challenge = handler["getFilteredChallenges"]()[1];
    const action = vi.spyOn(game.scene.ui, "processInput");
    click(arrow(1));
    expect(handler.getCursor()).toBe(1);
    expect(challenge.value).toBe(1);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.RIGHT);
    click(arrow(1, "left"));
    expect(challenge.value).toBe(0);
    expect(arrow(1, "left").visible).toBe(false);
    click(arrow(1, "left"));
    expect(challenge.value).toBe(0);
    challenge.value = challenge.maxValue;
    handler["updateText"]();
    expect(arrow(1).visible).toBe(false);
    click(arrow(1));
    expect(challenge.value).toBe(challenge.maxValue);
  });

  it("switches categories and icons, resets selection, and keeps other TabMenus opt-in", async () => {
    await open();
    click(arrow());
    click(start());
    click(tab(1));
    expect(handler["tabMenu"].selectedIndex).toBe(1);
    expect(selected()).toBe(0);
    expect(handler["startCursor"].visible).toBe(false);
    click(tab(5));
    expect(handler["tabMenu"].selectedIndex).toBe(2);
    click(tab(4));
    expect(handler["tabMenu"].selectedIndex).toBe(1);
    const other = new TabMenu(0, 0, 320, ["First", "Second"], vi.fn());
    expect(other["pointerZones"]).toHaveLength(0);
    other.destroy();
  });

  it("scrolls long categories one row per event, clamps boundaries and preserves values", async () => {
    game.scene.gameMode.challenges = Array.from({ length: 9 }, () =>
      copyChallenge({ id: Challenges.HARDCORE, value: 0, severity: 0 }),
    );
    await open();
    wheel(-120);
    wheel(0);
    expect(selected()).toBe(0);
    for (let index = 0; index < 12; index++) {
      wheel(999);
    }
    expect(selected()).toBe(8);
    expect(handler["scrollCursor"]).toBe(3);
    expect(game.scene.gameMode.challenges.every(c => c.value === 0)).toBe(true);
    click(row(0));
    expect(selected()).toBe(3);
    wheel(-120);
    expect(selected()).toBe(2);
    expect(handler["scrollCursor"]).toBe(2);
    expect(handler["startCursor"].visible).toBe(false);
  });

  it("handles empty categories without selecting invisible rows", async () => {
    game.scene.gameMode.challenges = [];
    await open();
    click(row());
    wheel(120);
    click(start());
    expect(selected()).toBe(0);
    expect(row().visible).toBe(false);
    expect(handler["startCursor"].visible).toBe(false);
  });

  it("selects Start before confirming and accepts a keyboard-selected Start", async () => {
    await open();
    const enqueue = vi.spyOn(game.scene.phaseManager, "unshiftNew").mockImplementation(() => undefined);
    const end = vi.spyOn(game.scene.phaseManager.getCurrentPhase(), "end").mockImplementation(() => undefined);
    click(start());
    expect(enqueue).not.toHaveBeenCalled();
    click(arrow());
    click(start());
    expect(handler["startCursor"].visible).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    click(start());
    expect(enqueue).toHaveBeenCalledExactlyOnceWith("SelectStarterPhase");
    expect(end).toHaveBeenCalledOnce();
    handler["deactivateStartCursor"]();
    game.scene.ui.processInput(Button.ACTION);
    click(start());
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("resets all challenges while preserving the selected category", async () => {
    await open();
    click(arrow());
    click(tab(1));
    click(arrow());
    expect(game.scene.gameMode.challenges.some(c => c.value !== 0)).toBe(true);
    click(reset());
    expect(game.scene.gameMode.challenges.every(c => c.value === 0)).toBe(true);
    expect(handler["tabMenu"].selectedIndex).toBe(1);
    expect(handler["startCursor"].visible).toBe(false);
    expect(handler["hasSelectedChallenge"]).toBe(false);
  });

  it("supports the single-type icon and keeps wheel navigation separate from values", async () => {
    await open();
    click(tab(1));
    const challenges = handler["getFilteredChallenges"]();
    const index = challenges.findIndex(c => c.id === Challenges.SINGLE_TYPE);
    expect(index).toBeGreaterThanOrEqual(0);
    const setVisible = vi.spyOn(handler["monoTypeValue"], "setVisible");
    const valueVisible = vi.spyOn(handler["challengeLabels"][index].value, "setVisible");
    click(arrow(index));
    expect(setVisible).toHaveBeenCalledWith(true);
    expect(valueVisible).toHaveBeenCalledWith(false);
    const before = challenges.map(c => c.value);
    wheel(120);
    expect(challenges.map(c => c.value)).toEqual(before);
  });

  it("uses right-click CANCEL to leave Start first and returns on the next right click", async () => {
    await open();
    click(arrow());
    click(start());
    const title = vi.spyOn(game.scene.phaseManager, "toTitleScreen").mockImplementation(() => undefined);
    vi.spyOn(game.scene.phaseManager.getCurrentPhase(), "end").mockImplementation(() => undefined);
    pointer.buttons = 2;
    click(row());
    expect(handler["startCursor"].visible).toBe(false);
    expect(title).not.toHaveBeenCalled();
    click(tab(0));
    expect(title).toHaveBeenCalledOnce();
  });

  it("returns from Start to the original row when wheeling without confirming", async () => {
    await open();
    click(arrow());
    click(start());
    wheel(120);
    expect(handler["startCursor"].visible).toBe(false);
    expect(selected()).toBe(1);
  });

  it("ignores hover, middle buttons, touch and wheel outside the list", async () => {
    await open();
    row(1).emit("pointerover", pointer);
    pointer.buttons = 4;
    click(arrow());
    pointer.buttons = 1;
    pointer.wasTouch = true;
    click(arrow());
    wheel(120);
    pointer.wasTouch = false;
    wheel(120, start());
    wheel(120, tab(0));
    expect(selected()).toBe(0);
    expect(game.scene.gameMode.challenges.every(c => c.value === 0)).toBe(true);
  });

  it("blocks all pointer targets under an upper handler or transition", async () => {
    await open();
    await game.scene.ui.setOverlayMode(UiMode.CONFIRM, {
      yesHandler: vi.fn(),
      noHandler: () => game.scene.ui.revertMode(),
    });
    click(row(1));
    click(arrow());
    click(tab(1));
    wheel(120);
    pointer.buttons = 2;
    click(reset());
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    expect(selected()).toBe(0);
    await game.scene.ui.revertMode();
    await game.scene.ui.fadeOut(1);
    pointer.buttons = 1;
    click(arrow());
    click(tab(1));
    wheel(120);
    expect(handler["tabMenu"].selectedIndex).toBe(0);
    expect(game.scene.gameMode.challenges.every(c => c.value === 0)).toBe(true);
    await game.scene.ui.fadeIn(1);
  });

  it("keeps keyboard directions, tabs, and cancel working with mouse selection", async () => {
    await open();
    click(row(1));
    game.scene.ui.processInput(Button.RIGHT);
    expect(handler["getFilteredChallenges"]()[1].value).toBe(1);
    game.scene.ui.processInput(Button.ACTION);
    game.scene.ui.processInput(Button.CANCEL);
    expect(handler["startCursor"].visible).toBe(false);
    game.scene.ui.processInput(Button.CYCLE_SHINY);
    expect(handler["tabMenu"].selectedIndex).toBe(1);
  });

  it("destroys old targets and only installs one listener when reopening", async () => {
    await open();
    const oldRow = row();
    const oldTab = tab(0);
    await game.scene.ui.setMode(UiMode.TITLE, { options: [{ label: "Title", handler: vi.fn() }] });
    expect(oldRow.listenerCount("pointerdown")).toBe(0);
    expect(oldTab.listenerCount("pointerdown")).toBe(0);
    await open();
    expect(row().listenerCount("pointerdown")).toBe(1);
    click(arrow());
    expect(handler["getFilteredChallenges"]()[0].value).toBe(1);
    handler.destroy();
    expect(handler["pointerZones"]).toHaveLength(0);
    expect(handler["tabMenu"]["pointerZones"]).toHaveLength(0);
  });
});
