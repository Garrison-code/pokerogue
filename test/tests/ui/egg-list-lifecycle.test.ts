/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Egg } from "#data/egg";
import { GameManager } from "#test/framework/game-manager";
import { EggListUiHandler } from "#ui/egg-list-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - egg list lifecycle", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggListUiHandler;
  let destroyed: boolean;

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    // A fresh handler must remain unopened, regardless of earlier tests' UI state.
    handler = new EggListUiHandler();
    handler.setup();
    destroyed = false;
  });

  afterEach(() => {
    if (!destroyed) {
      handler.destroy();
    }
  });

  it("clears an unopened list repeatedly", () => {
    expect(() => handler.clear()).not.toThrow();
    expect(() => handler.clear()).not.toThrow();
    expect(handler.active).toBe(false);
    expect(handler["eggListContainer"].visible).toBe(false);
  });

  it("destroys an unopened list", () => {
    const destroy = vi.spyOn(handler["eggListContainer"], "destroy");
    expect(() => handler.destroy()).not.toThrow();
    destroyed = true;
    expect(destroy).toHaveBeenCalledOnce();
    expect(handler.active).toBe(false);
  });

  it.each([0, 120])("cleans and reopens a list containing %i eggs", count => {
    game.scene.gameData.eggs = Array.from({ length: count }, () => new Egg());
    handler.show([]);
    if (count) {
      handler["scrollGridHandler"].selectIndex(3);
      handler["scrollGridHandler"].scrollByPointer(1);
      expect(handler["scrollGridHandler"].getItemOffset()).toBe(11);
    }

    const oldZones = [...handler["pointerTargets"]!.zones];
    const removeAnimations = vi.spyOn(handler["iconAnimHandler"], "removeAll");
    handler.clear();

    expect(removeAnimations).toHaveBeenCalledOnce();
    expect(handler["iconAnimHandler"]["icons"].size).toBe(0);
    expect(handler["eggListIconContainer"].list).toHaveLength(0);
    for (const zone of oldZones) {
      expect(zone.listenerCount("pointerdown")).toBe(0);
      expect(zone.listenerCount("wheel")).toBe(0);
    }

    handler.show([]);
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(0);
    expect(handler["cursorObj"].visible).toBe(count > 0);
    if (count) {
      expect(handler.getCursor()).toBe(0);
      expect(handler["scrollGridHandler"].getSelectedIndex()).toBe(0);
    }
    expect(() => handler.destroy()).not.toThrow();
    destroyed = true;
    expect(handler["iconAnimHandler"]["icons"].size).toBe(0);
  });
});
