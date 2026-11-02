/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Button } from "#enums/buttons";
import { GachaType } from "#enums/gacha-types";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EggGachaUiHandler } from "#ui/egg-gacha-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - Free egg gacha", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggGachaUiHandler;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(() => {
    game = new GameManager(phaserGame);
    handler = game.scene.ui.handlers[UiMode.EGG_GACHA] as EggGachaUiHandler;
    game.scene.gameData.eggs = [];
    game.scene.gameData.voucherCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  });

  it.each(Object.values(GachaType))("allows all options with no vouchers on machine %s", machine => {
    handler.setGachaCursor(machine);
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    const consume = vi.spyOn(handler, "consumeVouchers");
    const error = vi.spyOn(handler, "showError");
    for (const [cursor, count] of [1, 10, 5, 10, 25].entries()) {
      handler.setCursor(cursor);
      expect(handler.processInput(Button.ACTION)).toBe(true);
      expect(pull).toHaveBeenLastCalledWith(count);
    }
    expect(consume).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(Object.values(game.scene.gameData.voucherCounts)).toEqual([0, 0, 0, 0]);
  });

  it("renders zero cost for every pull option", () => {
    const text = vi.spyOn(game.scene.add, "text");
    handler.setup();
    const options = text.mock.calls.find(([, , content]) => typeof content === "string" && content.includes("x0"));
    expect(String(options?.[2]).match(/x0/g)).toHaveLength(5);
  });

  it.each([1, 10, 5, 10, 25])("keeps the egg capacity boundary for %s pulls", count => {
    const cursor = [1, 10, 5, 10, 25].indexOf(count);
    const pull = vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    const error = vi.spyOn(handler, "showError").mockImplementation(() => {});
    handler.setCursor(cursor);
    game.scene.gameData.eggs.length = 100 - count;
    handler.processInput(Button.ACTION);
    expect(pull).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    game.scene.gameData.eggs.length = 99 - count;
    expect(handler.processInput(Button.ACTION)).toBe(true);
    expect(pull).toHaveBeenCalledWith(count);
  });

  it("does not spend existing vouchers", () => {
    game.scene.gameData.voucherCounts = { 0: 7, 1: 8, 2: 9, 3: 10 };
    vi.spyOn(handler, "pull").mockResolvedValue(undefined);
    for (let cursor = 0; cursor < 5; cursor++) {
      handler.setCursor(cursor);
      handler.processInput(Button.ACTION);
    }
    expect(game.scene.gameData.voucherCounts).toEqual({ 0: 7, 1: 8, 2: 9, 3: 10 });
  });
});
