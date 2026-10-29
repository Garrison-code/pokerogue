/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { GameStatsUiHandler } from "#ui/game-stats-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - game stats pointer scrolling", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: GameStatsUiHandler;
  let pointer: Phaser.Input.Pointer;
  const exit = vi.fn();
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.GAME_STATS);
    handler = game.scene.ui.getHandler() as GameStatsUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
    exit.mockClear();
  });
  function zone(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `game-stats-${name}`)!;
  }
  it("routes one direction per vertical wheel and stops at the existing bounds", () => {
    for (let i = 0; i < 100; i++) {
      zone("page").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    }
    expect(handler.getCursor()).toBe(handler["maxCursorPos"]);
    for (let i = 0; i < 100; i++) {
      zone("page").emit("wheel", pointer, 0, -120, 0, { stopPropagation: vi.fn() });
    }
    expect(handler.getCursor()).toBe(0);
  });
  it("keeps left page clicks inert and right identical to CANCEL", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    zone("page").emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    pointer.buttons = 2;
    zone("page").emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it("ignores horizontal wheels, touch and upper interfaces", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    zone("page").emit("wheel", pointer, 120, 0, 0, { stopPropagation: vi.fn() });
    pointer.wasTouch = true;
    zone("page").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    pointer.wasTouch = false;
    game.scene.ui["overlayActive"] = true;
    zone("page").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
  });
  it("clears listeners and runs exit once", () => {
    handler["exitCallback"] = exit;
    const old = zone("page");
    handler.clear();
    handler.clear();
    expect(exit).toHaveBeenCalledOnce();
    expect(old.listenerCount("wheel")).toBe(0);
  });
});
