/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PokedexPageUiHandler } from "#ui/pokedex-page-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - pokedex detail pointer", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PokedexPageUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    await game.scene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR));
    handler = game.scene.ui.getHandler() as PokedexPageUiHandler;
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
    return handler["pointerTargets"]!.zones.find(z => z.name === `dex-detail-${name}`)!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it("selects operation rows before ACTION", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("row-2");
    expect(handler.getCursor()).toBe(2);
    expect(input).not.toHaveBeenCalled();
    click("row-2");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("wheels through operation rows without changing species", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    const species = handler["species"];
    for (let i = 0; i < 20; i++) {
      zone("menu").emit("wheel", pointer, 0, 120, 0, { stopPropagation: vi.fn() });
    }
    expect(handler.getCursor()).toBe(8);
    expect(handler["species"]).toBe(species);
    expect(input).not.toHaveBeenCalled();
  });
  it("dispatches species arrows through original LEFT and RIGHT", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("species--1");
    click("species-1");
    expect(input.mock.calls).toEqual([[Button.LEFT], [Button.RIGHT]]);
    handler["filteredIndices"] = [SpeciesId.BULBASAUR];
    click("species-1");
    expect(input).toHaveBeenCalledTimes(2);
  });
  it("dismisses stats with ACTION and blocks background rows", () => {
    handler["blockInputOverlay"] = true;
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("row-3");
    expect(handler.getCursor()).toBe(0);
    click("stats");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("routes right click to CANCEL and cleans up on reopening", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    pointer.buttons = 2;
    click("page");
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    const old = zone("page");
    handler.clear();
    handler.show([speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR)]);
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
    click("row-2");
    expect(handler.getCursor()).toBe(0);
  });
});
