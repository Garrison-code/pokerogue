import { pokerogueApi } from "#api/api";
import * as account from "#app/account";
import * as appConstants from "#constants/app-constants";
import { AbilityId } from "#enums/ability-id";
import { MoveId } from "#enums/move-id";
import { version } from "#package.json";
import { GameData } from "#system/game-data";
import { cloneSystemData, decodeSystemImport, serializeSystemData } from "#system/system-data-merge";
import { applySystemVersionMigration } from "#system/version-converter";
import { GameManager } from "#test/framework/game-manager";
import type { SessionSaveData } from "#types/save-data";
import type { SystemMergeDialogOptions } from "#ui/system-merge-dialog";
import * as mergeDialog from "#ui/system-merge-dialog";
import { loadStarterPreferences } from "#utils/data";
import { compareVersions } from "#utils/migrator-utils";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("System - Game Data", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    game.override
      .moveset([MoveId.SPLASH])
      .battleStyle("single")
      .enemyAbility(AbilityId.BALL_FETCH)
      .enemyMoveset(MoveId.SPLASH);
  });

  describe("merge import persistence", () => {
    afterEach(() => {
      if (document.getElementById("system-merge-dialog")) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }
    });
    async function openDialog(): Promise<SystemMergeDialogOptions> {
      let captured: SystemMergeDialogOptions | undefined;
      Object.assign(game.scene.scene, { isPaused: vi.fn().mockReturnValue(false), pause: vi.fn(), resume: vi.fn() });
      vi.spyOn(mergeDialog, "showSystemMergeDialog").mockImplementation(options => {
        captured = options;
      });
      vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(false);
      vi.spyOn(account, "updateUserInfo").mockResolvedValue([true, 1]);
      await game.scene.gameData.mergeImportData();
      expect(captured).toBeDefined();
      return captured!;
    }

    it("retains history through normal serialization and loading, including high ribbon bits", () => {
      const history = { version: 1 as const, fingerprints: ["a".repeat(64)] };
      game.scene.gameData.importHistory = history;
      const data = game.scene.gameData.getSystemSaveData();
      data.gameVersion = version;
      expect(data.importHistory).toEqual(history);
      const reloaded = GameData.fromRawSystem(serializeSystemData(data));
      expect(reloaded.getSystemSaveData().importHistory).toEqual(history);
    });

    it("migrates an actual legacy schema, supplying missing ribbon and pity defaults", () => {
      const data = JSON.parse(serializeSystemData(game.scene.gameData.getSystemSaveData()));
      data.gameVersion = "1.12.1.0";
      for (const entry of Object.values(data.starterData) as Record<string, unknown>[]) {
        entry.pity = undefined;
      }
      for (const entry of Object.values(data.dexData) as Record<string, unknown>[]) {
        entry.ribbons = undefined;
      }
      const parsed = decodeSystemImport(JSON.stringify(data), {
        decrypt: value => value,
        shortKeys: {},
        parse: GameData.parseSystemData,
        migrate: value => applySystemVersionMigration(value, { silent: true, dataOnly: true }),
        version,
        compareVersions,
      });
      expect(parsed.starterData[25].pity).toHaveLength(2);
      expect(parsed.dexData[25].ribbons.getRibbons()).toBe(0n);
      expect(parsed.gameVersion).toBe(version);
    });

    it.each(["valid", "invalid"])(
      "preserves preferences when selecting and cancelling a %s pre-1.12.1 export",
      async kind => {
        const showDialog = mergeDialog.showSystemMergeDialog;
        const options = await openDialog();
        const current = cloneSystemData(game.scene.gameData.getSystemSaveData());
        current.gameVersion = version;
        vi.spyOn(pokerogueApi.savedata.system, "get").mockResolvedValue(serializeSystemData(current));
        const incoming = cloneSystemData(current);
        incoming.gameVersion = "1.12.0.10";
        incoming.appliedMigrators = {};
        incoming.starterData[25].candyCount = 5;
        if (kind === "invalid") {
          incoming.voucherCounts[0] = -1;
        }
        const key = `starterPrefs_${account.loggedInUser?.username}`;
        const preferences = JSON.stringify({
          25: { abilityIndex: 2, formIndex: 1, nickname: `preview ${kind} stays put` },
        });
        localStorage.setItem(key, preferences);
        loadStarterPreferences();
        const writes = vi.spyOn(localStorage, "setItem");
        const removes = vi.spyOn(localStorage, "removeItem");
        const parse = vi.spyOn(options, "parse");
        showDialog(options);
        const panel = document.getElementById("system-merge-dialog")!;
        const input = panel.querySelector("input")!;
        Object.defineProperty(input, "files", {
          value: [{ name: "legacy.prsv", text: async () => serializeSystemData(incoming) }],
          configurable: true,
        });
        await input.onchange!.call(input, new Event("change"));
        const buttons = [...panel.querySelectorAll("button")];
        expect(buttons.at(-1)!.disabled).toBe(kind === "invalid");
        if (kind === "valid") {
          const parsed = parse.mock.results[0].value;
          expect(parsed.appliedMigrators).not.toHaveProperty("1.12.1.0-migrateStarterPreferences");
          expect(parsed.appliedMigrators["1.12.2.0-addPityTracker"]).toBeTypeOf("number");
        }
        expect(writes).not.toHaveBeenCalled();
        expect(removes).not.toHaveBeenCalled();
        expect(localStorage.getItem(key)).toBe(preferences);
        buttons.at(-2)!.click();
        expect(document.getElementById("system-merge-dialog")).toBeNull();
        expect(writes).not.toHaveBeenCalled();
        expect(localStorage.getItem(key)).toBe(preferences);
      },
    );

    it("does not migrate destination preferences while inspecting an older remote save", async () => {
      const options = await openDialog();
      const remote = cloneSystemData(game.scene.gameData.getSystemSaveData());
      remote.gameVersion = "1.12.0.10";
      vi.spyOn(pokerogueApi.savedata.system, "get").mockResolvedValue(serializeSystemData(remote));
      const key = `starterPrefs_${account.loggedInUser?.username}`;
      const preferences = JSON.stringify({ 25: { abilityIndex: 2, formIndex: 1, nickname: "remote stays put" } });
      localStorage.setItem(key, preferences);
      loadStarterPreferences();
      const writes = vi.spyOn(localStorage, "setItem");
      await options.readCurrent();
      expect(writes).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBe(preferences);
      options.onClose();
    });

    it("still migrates legacy local preferences during normal save loading", () => {
      const data = cloneSystemData(game.scene.gameData.getSystemSaveData());
      data.gameVersion = "1.12.0.10";
      const key = `starterPrefs_${account.loggedInUser?.username}`;
      localStorage.setItem(key, JSON.stringify({ 25: { ability: 2, form: 1, nickname: "normal load" } }));
      applySystemVersionMigration(data, { silent: true });
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
        25: { abilityIndex: 2, formIndex: 1, nickname: "normal load" },
      });
      expect(data.appliedMigrators["1.12.1.0-migrateStarterPreferences"]).toBeTypeOf("number");
    });

    it("does not write locally until the server accepts the combined data and history", async () => {
      const options = await openDialog();
      const original = game.scene.gameData.getSystemSaveData();
      const merged = cloneSystemData(original);
      merged.gameVersion = version;
      merged.importHistory = { version: 1, fingerprints: ["a".repeat(64)] };
      const pending = Promise.withResolvers<string>();
      const update = vi.spyOn(pokerogueApi.savedata.system, "update").mockReturnValue(pending.promise);
      const localWrite = vi.spyOn(localStorage, "setItem");
      const saving = options.save(merged);
      await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
      expect(localWrite).not.toHaveBeenCalled();
      expect(game.scene.gameData.importHistory).toBe(original.importHistory);
      pending.resolve("");
      await saving;
      expect(localWrite).toHaveBeenCalledOnce();
      expect(game.scene.gameData.getSystemSaveData().importHistory).toEqual(merged.importHistory);
      options.onClose();
    });

    it("keeps local state and history unchanged when the server rejects the import", async () => {
      const options = await openDialog();
      const original = game.scene.gameData.getSystemSaveData();
      const merged = cloneSystemData(original);
      merged.gameVersion = version;
      merged.importHistory = { version: 1, fingerprints: ["b".repeat(64)] };
      vi.spyOn(pokerogueApi.savedata.system, "update").mockResolvedValue("save rejected");
      const localWrite = vi.spyOn(localStorage, "setItem");
      await expect(options.save(merged)).rejects.toThrow("save rejected");
      expect(localWrite).not.toHaveBeenCalled();
      expect(game.scene.gameData.importHistory).toBe(original.importHistory);
      options.onClose();
    });

    it("uses the accepted server result even if the local cache is full", async () => {
      const options = await openDialog();
      const merged = cloneSystemData(game.scene.gameData.getSystemSaveData());
      merged.gameVersion = version;
      merged.importHistory = { version: 1, fingerprints: ["c".repeat(64)] };
      vi.spyOn(pokerogueApi.savedata.system, "update").mockResolvedValue("");
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      await options.save(merged);
      expect(game.scene.gameData.importHistory).toEqual(merged.importHistory);
      options.onClose();
    });

    it("keeps offline imports atomic when local storage fails", async () => {
      const options = await openDialog();
      vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(true);
      const original = game.scene.gameData.importHistory;
      const merged = cloneSystemData(game.scene.gameData.getSystemSaveData());
      merged.gameVersion = version;
      merged.importHistory = { version: 1, fingerprints: ["d".repeat(64)] };
      const update = vi.spyOn(pokerogueApi.savedata.system, "update");
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      await expect(options.save(merged)).rejects.toThrow("quota exceeded");
      expect(game.scene.gameData.importHistory).toBe(original);
      expect(update).not.toHaveBeenCalled();
      options.onClose();
    });

    it("returns independent snapshots and detects remote changes without mutating live data", async () => {
      const options = await openDialog();
      const remote = cloneSystemData(game.scene.gameData.getSystemSaveData());
      remote.gameVersion = version;
      const get = vi.spyOn(pokerogueApi.savedata.system, "get").mockResolvedValue(serializeSystemData(remote));
      const first = await options.readCurrent();
      game.scene.gameData.starterData[25].candyCount = 3;
      expect(first.starterData[25].candyCount).toBe(0);
      const second = await options.readCurrent();
      expect(second.starterData[25].candyCount).toBe(3);
      remote.starterData[25].candyCount = 7;
      get.mockResolvedValue(serializeSystemData(remote));
      expect((await options.readCurrent()).starterData[25].candyCount).toBe(7);
      expect(game.scene.gameData.starterData[25].candyCount).toBe(3);
      options.onClose();
    });
  });

  describe("tryClearSession", () => {
    beforeEach(() => {
      vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(false);
      vi.spyOn(game.scene.gameData, "getSessionSaveData").mockReturnValue({} as SessionSaveData);
      vi.spyOn(account, "updateUserInfo").mockImplementation(async () => [true, 1]);
    });

    it("should return [true, true] if bypassLogin is true", async () => {
      vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(true);

      const result = await game.scene.gameData.tryClearSession(0);

      expect(result).toEqual([true, true]);
    });

    it("should return [true, true] if successful", async () => {
      vi.spyOn(pokerogueApi.savedata.session, "clear").mockResolvedValue({
        success: true,
      });

      const result = await game.scene.gameData.tryClearSession(0);

      expect(result).toEqual([true, true]);
      expect(account.updateUserInfo).toHaveBeenCalled();
    });

    it("should return [true, false] if not successful", async () => {
      vi.spyOn(pokerogueApi.savedata.session, "clear").mockResolvedValue({
        success: false,
      });

      const result = await game.scene.gameData.tryClearSession(0);

      expect(result).toEqual([true, false]);
      expect(account.updateUserInfo).toHaveBeenCalled();
    });

    it("should return [false, false] session is out of date", async () => {
      vi.spyOn(pokerogueApi.savedata.session, "clear").mockResolvedValue({
        error: "session out of date",
      });

      const result = await game.scene.gameData.tryClearSession(0);

      expect(result).toEqual([false, false]);
      expect(account.updateUserInfo).toHaveBeenCalled();
    });
  });
});
