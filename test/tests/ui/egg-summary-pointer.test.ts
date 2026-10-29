/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { EggHatchData } from "#data/egg-hatch-data";
import { Button } from "#enums/buttons";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { EggSummaryUiHandler } from "#ui/egg-summary-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - egg summary pointer browsing", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: EggSummaryUiHandler;
  let pointer: Phaser.Input.Pointer;
  let data: EggHatchData[];
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    const pokemon = game.scene.addPlayerPokemon(speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR), 5);
    data = Array.from({ length: 110 }, () => {
      const d = new EggHatchData(pokemon, 0);
      d.setDex();
      return d;
    });
    await game.scene.ui.setOverlayMode(UiMode.EGG_HATCH_SUMMARY, data);
    handler = game.scene.ui.getHandler() as EggSummaryUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    if (handler) {
      handler.tutorialActive = false;
    }
    game.scene.ui["overlayActive"] = false;
  });
  function zone(name: string) {
    return handler["pointerTargets"]!.zones.find(z => z.name === `egg-summary-${name}`)!;
  }
  function click(name: string) {
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
  }
  it("selects a result instead of confirming or exiting", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    click("cell-5");
    click("cell-5");
    expect(handler.getCursor()).toBe(5);
    expect(input).not.toHaveBeenCalled();
    handler.processInput(Button.RIGHT);
    expect(handler.getCursor()).toBe(6);
  });
  it("preserves a result when scrolling and restores keyboard focus", () => {
    click("cell-2");
    zone("grid").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    expect(handler["cursorObj"].visible).toBe(false);
    handler.processInput(Button.RIGHT);
    expect(handler.getCursor()).toBe(3);
    expect(handler["scrollGridHandler"].getItemOffset()).toBe(0);
  });
  it("keeps the original exit delay for right CANCEL", () => {
    const error = vi.spyOn(game.scene.ui, "playError");
    pointer.buttons = 2;
    click("page");
    expect(error).toHaveBeenCalledOnce();
    expect(handler.active).toBe(true);
  });
  it("invalidates the old exit timer on reopening", () => {
    const old = handler["exitTimer"]!;
    const callback = old.callback!;
    handler.clear();
    handler.show([data]);
    callback();
    expect(handler["blockExit"]).toBe(true);
    expect(handler["exitTimer"]).not.toBe(old);
    expect(callback).toBeDefined();
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
    click("cell-2");
    expect(handler.getCursor()).toBe(0);
  });
  it("handles empty results and removes old targets", () => {
    const old = zone("grid");
    handler.clear();
    handler.show([[]]);
    expect(handler["cursorObj"].visible).toBe(false);
    expect(old.listenerCount("wheel")).toBe(0);
    expect(handler.processInput(Button.DOWN)).toBe(false);
  });
});
