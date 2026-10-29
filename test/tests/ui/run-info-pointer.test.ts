/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Button } from "#enums/buttons";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { RunDisplayMode, type RunInfoUiHandler } from "#ui/run-info-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - run information pointer controls", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: RunInfoUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override.enemySpecies(SpeciesId.MAGIKARP).battleStyle("single");
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    const data = game.scene.gameData.getSessionSaveData();
    data.party = [];
    data.enemyParty = [];
    await game.scene.ui.setOverlayMode(UiMode.RUN_INFO, data, RunDisplayMode.SESSION_PREVIEW);
    handler = game.scene.ui.getHandler() as RunInfoUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["overlayActive"] = false;
  });
  function click() {
    const stopPropagation = vi.fn();
    handler["pointerTargets"]!.zones.find(z => z.name === "run-info-page")!.emit("pointerdown", pointer, 0, 0, {
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("keeps preview content inert on left click and wheel", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    click();
    handler["pointerTargets"]!.zones[0].emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(input).not.toHaveBeenCalled();
    expect(handler["isVictory"]).toBe(false);
  });
  it("routes page right click to the original CANCEL", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
  });
  it("closes an upper detail view before leaving its main page", () => {
    handler["hallofFameContainer"] = game.scene.add.container();
    handler["pageMode"] = 1;
    pointer.buttons = 2;
    const revert = vi.spyOn(game.scene.ui, "revertMode");
    click();
    expect(handler["pageMode"]).toBe(0);
    expect(revert).not.toHaveBeenCalled();
    click();
    expect(revert).toHaveBeenCalledOnce();
  });
  it.each(["touch", "middle", "upper", "transition"])("blocks %s", kind => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    pointer.buttons = 2;
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.COMMAND]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    click();
    expect(input).not.toHaveBeenCalled();
  });
  it("cleans all page zones and containers on clear", () => {
    const targets = handler["pointerTargets"]!;
    handler.clear();
    expect(targets.zones).toHaveLength(0);
    expect(handler["runContainer"].visible).toBe(false);
    expect(handler["runContainer"].list).toHaveLength(0);
  });
});
