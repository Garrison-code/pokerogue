/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { RunHistoryData, SessionSaveData } from "#types/save-data";
import type { RunHistoryUiHandler } from "#ui/run-history-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - run history pointer controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: RunHistoryUiHandler;
  let pointer: Phaser.Input.Pointer;
  const data = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [
      100 + i,
      {
        isVictory: true,
        isFavorite: false,
        entry: { timestamp: 100 + i, gameMode: 0, waveIndex: 10, party: [], enemyParty: [] },
      },
    ]),
  ) as unknown as RunHistoryData;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    vi.spyOn(game.scene.gameData, "getRunHistoryData").mockResolvedValue(data);
    vi.spyOn(game.scene.gameData, "parseSessionData").mockImplementation(value => JSON.parse(value) as SessionSaveData);
    await game.scene.ui.setOverlayMode(UiMode.RUN_HISTORY);
    handler = game.scene.ui.getHandler() as RunHistoryUiHandler;
    await Promise.resolve();
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
  });
  function zone(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `run-history-${name}`)!;
  }
  function click(name: string) {
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
  }
  function wheel(dy: number) {
    zone("list").emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  it("selects a card before confirming its actual record", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("card-1");
    expect(handler.getCursor()).toBe(1);
    expect(input).not.toHaveBeenCalled();
    click("card-1");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    expect(handler["runs"][1].entryData.entry.timestamp).toBe(104);
  });
  it("wheels through all records and stops at boundaries", () => {
    for (let i = 0; i < 10; i++) {
      wheel(120);
    }
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(5);
    expect(handler["scrollCursor"]).toBe(3);
    for (let i = 0; i < 10; i++) {
      wheel(-120);
    }
    expect(handler.getCursor() + handler["scrollCursor"]).toBe(0);
  });
  it("does not confirm cards while their scroll tween is moving", () => {
    handler["scrollTween"] = { remove: vi.fn() } as unknown as Phaser.Tweens.Tween;
    const input = vi.spyOn(game.scene.ui, "processInput");
    click("card-0");
    expect(input).not.toHaveBeenCalled();
  });
  it("does not let an old tween completion unlock a newer scroll", () => {
    const configs: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
    const tweens: Phaser.Tweens.Tween[] = [];
    vi.spyOn(game.scene.tweens, "add").mockImplementation(config => {
      configs.push(config as Phaser.Types.Tweens.TweenBuilderConfig);
      const tween = { remove: vi.fn() } as unknown as Phaser.Tweens.Tween;
      tweens.push(tween);
      return tween;
    });
    for (let i = 0; i < 4; i++) {
      wheel(120);
    }
    const newer = handler["scrollTween"];
    (configs[0].onComplete as () => void)();
    expect(handler["scrollTween"]).toBe(newer);
    expect(tweens[0].remove).toHaveBeenCalledOnce();
  });
  it("ignores the response from a closed and reopened list", async () => {
    const pending = Promise.withResolvers<RunHistoryData>();
    vi.spyOn(game.scene.gameData, "getRunHistoryData").mockReturnValueOnce(pending.promise).mockResolvedValue({});
    handler.clear();
    handler.show([]);
    handler.clear();
    handler.show([]);
    pending.resolve(data);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler["runs"]).toHaveLength(0);
  });
  it("right click follows CANCEL and cleanup removes zones", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const old = zone("page");
    handler.clear();
    expect(old.listenerCount("pointerdown")).toBe(0);
  });
  it.each(["touch", "middle", "upper", "tutorial", "transition"])("blocks %s", kind => {
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.TITLE]);
    }
    if (kind === "tutorial") {
      handler.tutorialActive = true;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    click("card-1");
    expect(handler.getCursor()).toBe(0);
  });
});
