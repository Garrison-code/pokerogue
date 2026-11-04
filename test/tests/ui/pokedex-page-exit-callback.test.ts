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

describe("UI - pokedex page exit callback", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  const stayOption = { options: [{ label: "Stay", handler: () => false }] };

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
  });

  afterEach(() => {
    game.scene.ui.getHandler()?.clear();
    game.scene.ui["overlayActive"] = false;
  });

  async function openPokedex(exitCallback?: () => void): Promise<PokedexPageUiHandler> {
    if (game.scene.ui.mode !== UiMode.OPTION_SELECT) {
      await game.scene.ui.setMode(UiMode.OPTION_SELECT, stayOption);
    }
    const species = speciesDataRegistry.getSpecies(SpeciesId.BULBASAUR);
    if (exitCallback) {
      await game.scene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, null, null, null, exitCallback);
    } else {
      await game.scene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species);
    }
    expect(game.scene.ui.mode).toBe(UiMode.POKEDEX_PAGE);
    expect(game.scene.ui.modeChain.length).toBeGreaterThan(0);
    return game.scene.ui.getHandler() as PokedexPageUiHandler;
  }

  async function cancelPage(): Promise<boolean> {
    const revert = vi.spyOn(game.scene.ui, "revertMode");
    const accepted = game.scene.ui.processInput(Button.CANCEL);
    expect(accepted).toBe(true);
    const pending = revert.mock.results.at(-1)?.value as Promise<boolean> | undefined;
    expect(pending).toBeInstanceOf(Promise);
    const reverted = await pending!;
    revert.mockRestore();
    await Promise.resolve();
    return reverted;
  }

  describe("Closing the Pokedex page runs the opener's exit callback exactly once", () => {
    it("runs the exit callback once after cancel restores the previous mode", async () => {
      const exit = vi.fn();
      await openPokedex(exit);

      const reverted = await cancelPage();

      expect(reverted).toBe(true);
      expect(game.scene.ui.mode).toBe(UiMode.OPTION_SELECT);
      expect(exit).toHaveBeenCalledTimes(1);
    });

    it("runs the exit callback once per closing", async () => {
      const exit = vi.fn();
      await openPokedex(exit);
      await cancelPage();
      await openPokedex(exit);
      await cancelPage();

      expect(exit).toHaveBeenCalledTimes(2);
    });

    it("still runs the exit callback once after evolution-chain navigation", async () => {
      const exit = vi.fn();
      const handler = await openPokedex(exit);
      const ivysaur = speciesDataRegistry.getSpecies(SpeciesId.IVYSAUR);
      await game.scene.ui.setModeWithoutClear(UiMode.OPTION_SELECT, stayOption);
      handler["previousSpecies"].push(handler["species"]);
      handler["previousStarterPreferences"].push({ ...handler["savedStarterPreferences"] });
      await game.scene.ui.setMode(UiMode.POKEDEX_PAGE, ivysaur, handler["savedStarterPreferences"]);

      game.scene.ui.processInput(Button.CANCEL);
      await Promise.resolve();
      await Promise.resolve();
      expect(exit).not.toHaveBeenCalled();

      const reverted = await cancelPage();
      expect(reverted).toBe(true);
      expect(exit).toHaveBeenCalledTimes(1);
    });
  });

  describe("The exit callback does not run when the page did not actually close", () => {
    it("does not run the exit callback when cancel steps back to the previous species", async () => {
      const exit = vi.fn();
      const handler = await openPokedex(exit);
      handler["previousSpecies"].push(handler["species"]);

      game.scene.ui.processInput(Button.CANCEL);
      await Promise.resolve();
      await Promise.resolve();

      expect(handler["previousSpecies"]).toHaveLength(0);
      expect(game.scene.ui.mode).toBe(UiMode.POKEDEX_PAGE);
      expect(exit).not.toHaveBeenCalled();
    });

    it("keeps the exit callback when there is no mode to restore, then runs it on a later close", async () => {
      const exit = vi.fn();
      await openPokedex(exit);
      game.scene.ui.resetModeChain();

      const firstRevert = await cancelPage();
      const callsWhenModeChainEmpty = exit.mock.calls.length;

      game.scene.ui.modeChain.push(UiMode.OPTION_SELECT);
      const secondRevert = await cancelPage();

      expect({
        firstRevert,
        callsWhenModeChainEmpty,
        secondRevert,
        callsAfterLaterClose: exit.mock.calls.length,
        modeAfterLaterClose: game.scene.ui.mode,
      }).toEqual({
        firstRevert: false,
        callsWhenModeChainEmpty: 0,
        secondRevert: true,
        callsAfterLaterClose: 1,
        modeAfterLaterClose: UiMode.OPTION_SELECT,
      });
    });
  });

  describe("A pending exit callback does not leak into a later opening", () => {
    it("does not run a callback cleared before a later opening without one", async () => {
      const exit = vi.fn();
      const handler = await openPokedex(exit);
      handler.clear();

      await openPokedex();
      const reverted = await cancelPage();

      expect(reverted).toBe(true);
      expect(exit).not.toHaveBeenCalled();
    });
  });
});
