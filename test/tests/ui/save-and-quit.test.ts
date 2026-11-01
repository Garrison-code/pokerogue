/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { pokerogueApi } from "#api/api";
import { getSessionDataLocalStorageKey, loggedInUser } from "#app/account";
import { BattleScene } from "#app/battle-scene";
import * as appConstants from "#constants/app-constants";
import { Button } from "#enums/buttons";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { GameWrapper } from "#test/framework/game-wrapper";
import { PhaseInterceptor } from "#test/framework/phase-interceptor";
import type { MenuUiHandler } from "#ui/menu-ui-handler";
import { decrypt, encrypt } from "#utils/data";
import i18next from "i18next";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - save and quit scene teardown", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  async function rebuildScene(): Promise<void> {
    const scene = new BattleScene();
    // Pause phase execution before create() starts login, as GameManager normally does.
    new PhaseInterceptor(scene);
    await new GameWrapper(phaserGame, true).setScene(scene);
  }

  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  beforeEach(async () => {
    // Other files may have opened the shared egg list; start with a genuinely fresh UI.
    await rebuildScene();
    game = new GameManager(phaserGame);
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    // ReloadHelper replaces saveAll by default. Exercise the actual cached save path.
    vi.mocked(game.scene.gameData.saveAll).mockRestore();
    game.scene.sessionSlotId = 0;
    await game.scene.gameData.saveAll(true);
    await game.scene.ui.setOverlayMode(UiMode.MENU);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // reset(true) destroyed the UI; subsequent files must not reuse that scene.
    await rebuildScene();
  });

  it.each([false, true])("finishes a cached save and tears down unopened pages (online=%s)", async online => {
    const scene = game.scene;
    const ui = scene.ui;
    const eggList = ui.handlers[UiMode.EGG_LIST];
    const showEggList = vi.spyOn(eggList, "show");
    const destroyEggList = vi.spyOn(eggList, "destroy");
    const freeUIData = vi.spyOn(ui, "freeUIData");
    const updateAll = vi.spyOn(pokerogueApi.savedata, "updateAll").mockResolvedValue("");
    const sessionKey = getSessionDataLocalStorageKey(0);
    const systemKey = `data_${loggedInUser?.username}`;

    if (online) {
      for (const key of [sessionKey, systemKey]) {
        localStorage.setItem(key, encrypt(decrypt(localStorage.getItem(key)!, true), false));
      }
      vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(false);
    }
    const savedSession = localStorage.getItem(sessionKey);
    const save = vi.spyOn(scene.gameData, "saveAll");
    const reset = vi.spyOn(scene, "reset");
    // Only replace the final relaunch, after all actual handlers have been destroyed.
    const launch = vi.spyOn(scene, "launchBattle").mockImplementation(() => {});

    let finishLoadingFade!: () => void;
    vi.spyOn(scene.tweens, "add").mockImplementation(config => {
      const tween = config as Phaser.Types.Tweens.TweenBuilderConfig;
      const complete = () => tween.onComplete?.({} as Phaser.Tweens.Tween, []);
      if (tween.alpha === 1) {
        finishLoadingFade = complete;
      } else {
        complete();
      }
      return {} as Phaser.Tweens.Tween;
    });

    const menu = ui.getHandler<MenuUiHandler>();
    menu.setCursor(menu["options"].findIndex(o => o.label === i18next.t("menuUiHandler:saveAndQuit")));
    expect(menu.processInput(Button.ACTION)).toBe(true);
    expect(ui.mode).toBe(UiMode.LOADING);
    expect(save).not.toHaveBeenCalled();
    finishLoadingFade();

    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledExactlyOnceWith(true, true, true, true);
    expect(reset).toHaveBeenCalledExactlyOnceWith(true);
    expect(freeUIData).toHaveBeenCalledOnce();
    expect(showEggList).not.toHaveBeenCalled();
    expect(destroyEggList).toHaveBeenCalledOnce();
    expect(ui.handlers).toHaveLength(0);
    expect(updateAll).toHaveBeenCalledTimes(online ? 1 : 0);
    const saved = scene.gameData.parseSessionData(decrypt(localStorage.getItem(sessionKey)!, !online));
    const original = scene.gameData.parseSessionData(decrypt(savedSession!, !online));
    expect(saved).toEqual(original);
    if (online) {
      expect(updateAll).toHaveBeenCalledWith(expect.objectContaining({ sessionSlotId: 0, session: saved }));
    }
  });
});
