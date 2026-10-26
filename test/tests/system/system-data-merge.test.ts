import { EggData } from "#system/egg-data";
import { GameStats } from "#system/game-stats";
import { RibbonData } from "#system/ribbon-data";
import {
  cloneSystemData,
  commitSystemMerge,
  decodeSystemImport,
  expandSystemKeys,
  mergeSystemData,
  serializeSystemData,
  systemFingerprint,
  systemRevision,
  validateSystemImportShape,
} from "#system/system-data-merge";
import type { SystemSaveData } from "#types/save-data";
import { AES, enc } from "crypto-js";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function save(id = 1): SystemSaveData {
  return {
    trainerId: id,
    secretId: id,
    gender: 0,
    gameVersion: "1.12.2.0",
    timestamp: id,
    dexData: {
      25: {
        seenAttr: 1n,
        caughtAttr: 1n,
        natureAttr: 1,
        seenCount: 1,
        caughtCount: 1,
        hatchedCount: 0,
        ivs: [1, 2, 3, 4, 5, 6],
        ribbons: new RibbonData(0),
      },
    },
    starterData: {
      25: {
        moveset: null,
        eggMoves: 0,
        candyCount: 0,
        friendship: 0,
        abilityAttr: 1,
        passiveAttr: 0,
        valueReduction: 0,
        classicWinCount: 0,
        pity: [0, 0],
      },
    },
    gameStats: new GameStats(),
    unlocks: {},
    achvUnlocks: {},
    voucherUnlocks: {},
    voucherCounts: { 0: 0 },
    eggs: [],
    eggPity: [0, 0, 0, 0],
    unlockPity: [0, 0, 0, 0],
    appliedMigrators: {},
  };
}
const options = { version: "1.12.2.0", now: 100, friendshipCap: () => 25 };
const source = (data: SystemSaveData, name = String(data.trainerId)) => ({ name, data });
function egg(id = 1, hatchWaves = 20): EggData {
  return new EggData({
    id,
    timestamp: 10,
    hatchWaves,
    tier: 0,
    sourceType: 0,
    variantTier: 0,
    species: 25,
    isShiny: false,
    eggMoveIndex: 0,
    overrideHiddenAbility: false,
  });
}

describe("System data merge", () => {
  it("merges Pikachu to 58 candies, both shinies, the passive and best IVs without mutations", () => {
    const base = save();
    const a = save(2);
    const c = save(3);
    base.starterData[25].candyCount = 3;
    a.starterData[25].candyCount = 5;
    c.starterData[25].candyCount = 50;
    base.dexData[25].caughtAttr = 32n;
    c.dexData[25].caughtAttr = 64n;
    a.starterData[25].passiveAttr = 1;
    a.dexData[25].ivs = [31, 31, 31, 31, 31, 31];
    const before = [base, a, c].map(serializeSystemData);
    const { data } = mergeSystemData(base, [source(a), source(c)], options);
    expect(data.starterData[25]).toMatchObject({ candyCount: 58, passiveAttr: 3 });
    expect(data.dexData[25].caughtAttr & 96n).toBe(96n);
    expect(data.dexData[25].ivs).toEqual(a.dexData[25].ivs);
    expect([base, a, c].map(serializeSystemData)).toEqual(before);
    c.dexData[25].ivs = [0, 0, 0, 0, 0, 31];
    a.dexData[25].ivs = [31, 0, 0, 0, 0, 0];
    expect(mergeSystemData(base, [source(a), source(c)], options).data.dexData[25].ivs).toEqual([31, 2, 3, 4, 5, 31]);
  });
  it("unions unlocks, preserves disabled passive/moves, and takes best reduction", () => {
    const base = save();
    const a = save(2);
    base.starterData[25].passiveAttr = 1;
    base.starterData[25].moveset = [1];
    a.starterData[25].moveset = [2];
    a.starterData[25].passiveAttr = 3;
    a.starterData[25].eggMoves = 4;
    a.starterData[25].abilityAttr = 4;
    a.starterData[25].valueReduction = 2;
    base.dexData[25].ribbons = new RibbonData(1n << 55n);
    a.dexData[25].ribbons = new RibbonData(1);
    const merged = mergeSystemData(base, [source(a)], options).data;
    expect(merged.starterData[25]).toMatchObject({
      passiveAttr: 1,
      moveset: [1],
      eggMoves: 4,
      abilityAttr: 5,
      valueReduction: 2,
    });
    expect(merged.dexData[25].ribbons.getRibbons()).toBe((1n << 55n) | 1n);
    expect(RibbonData.fromJSON(((1n << 55n) | 1n).toString(16)).getRibbons()).toBe((1n << 55n) | 1n);
    base.starterData[25].moveset = null;
    expect(mergeSystemData(base, [source(a)], options).data.starterData[25].moveset).toEqual([2]);
  });
  it("adds resources/counters, converts friendship, maximizes records/pity and keeps earliest unlocks", () => {
    const base = save();
    const a = save(2);
    base.starterData[25].friendship = 20;
    a.starterData[25].friendship = 17;
    base.gameStats.battles = 3;
    a.gameStats.battles = 5;
    base.gameStats.highestDamage = 99;
    a.gameStats.highestDamage = 50;
    base.voucherCounts[0] = 4;
    a.voucherCounts[0] = 6;
    base.starterData[25].pity = [5, 1];
    a.starterData[25].pity = [1, 9];
    base.eggPity = [0, 1, 9, 2];
    a.eggPity = [0, 4, 1, 3];
    base.unlockPity = [0, 1, 8, 0];
    a.unlockPity = [0, 7, 2, 3];
    a.starterData[25].classicWinCount = 3;
    base.gameStats.ribbonsOwned = 99;
    base.achvUnlocks.WIN = 20;
    a.achvUnlocks.WIN = 10;
    a.voucherUnlocks.REWARD = 30;
    a.unlocks[0] = true;
    const { data } = mergeSystemData(base, [source(a)], options);
    expect(data.starterData[25]).toMatchObject({ candyCount: 1, friendship: 12, pity: [5, 9], classicWinCount: 3 });
    expect(data.gameStats).toMatchObject({ battles: 8, highestDamage: 99, ribbonsOwned: 1 });
    expect(data.voucherCounts[0]).toBe(10);
    expect(data.achvUnlocks.WIN).toBe(10);
    expect(data.voucherUnlocks.REWARD).toBe(30);
    expect(data.unlocks[0]).toBe(true);
    expect(data.eggPity).toEqual([0, 4, 9, 3]);
    expect(data.unlockPity).toEqual([0, 7, 8, 3]);
  });
  it("caps candies, reports losses, and computes capped resources independently of source order", () => {
    const base = save();
    const a = save(2);
    const b = save(3);
    base.starterData[25].candyCount = 9990;
    a.starterData[25].candyCount = 10;
    a.starterData[25].friendship = 20;
    b.starterData[25].friendship = 20;
    const result = mergeSystemData(base, [source(a), source(b)], options);
    expect(result.data.starterData[25]).toMatchObject({ candyCount: 9999, friendship: 24 });
    expect(result.candyOverflow).toEqual({ 25: 2 });
    expect(result.data.starterData).toEqual(mergeSystemData(base, [source(b), source(a)], options).data.starterData);
  });
  it("keeps the friendship remainder when a candy conversion reaches the cap exactly", () => {
    const base = save();
    base.starterData[25].candyCount = 9998;
    base.starterData[25].friendship = 25;
    expect(mergeSystemData(base, [source(save(2))], options).data.starterData[25]).toMatchObject({
      candyCount: 9999,
      friendship: 0,
    });
  });
  it("deduplicates within a batch, across reloads and transitively from merged exports", () => {
    const base = save();
    const a = save(2);
    a.starterData[25].candyCount = 5;
    const result = mergeSystemData(base, [source(a), source(a, "copy")], options);
    expect(result.files.map(f => f.status)).toEqual(["accepted", "duplicate"]);
    expect(mergeSystemData(cloneSystemData(result.data), [source(a)], options).files[0].status).toBe("duplicate");
    expect(mergeSystemData(save(3), [source(result.data), source(a)], options).files.map(f => f.status)).toEqual([
      "accepted",
      "duplicate",
    ]);
    expect(mergeSystemData(base, [source(result.data)], options).files[0].status).toBe("duplicate");
  });
  it("adds different legacy snapshots without known shared lineage", () => {
    const base = save();
    const a = save();
    a.starterData[25].candyCount = 5;
    expect(mergeSystemData(base, [source(a)], options).data.starterData[25].candyCount).toBe(5);
  });
  it("deduplicates eggs by identity/time, minimizes remaining waves, and allows over 99 eggs", () => {
    const base = save();
    const a = save(2);
    base.eggs = [egg()];
    a.eggs = [egg(1, 10), ...Array.from({ length: 100 }, (_, i) => egg(i + 2))];
    const result = mergeSystemData(base, [source(a)], options);
    expect(result.data.eggs).toHaveLength(101);
    expect(result.data.eggs[0].hatchWaves).toBe(10);
    expect(base.eggs[0].hatchWaves).toBe(20);
  });
  it("blocks contradictory fixed egg data", () => {
    const base = save();
    const a = save(2);
    base.eggs = [egg()];
    a.eggs = [egg()];
    a.eggs[0].isShiny = true;
    expect(() => mergeSystemData(base, [source(a)], options)).toThrow("eggConflict");
  });
  it.each(["vouchers", "stats", "counts"])("blocks unsafe %s sums", kind => {
    const base = save();
    const a = save(2);
    if (kind === "vouchers") {
      base.voucherCounts[0] = Number.MAX_SAFE_INTEGER;
      a.voucherCounts[0] = 1;
    }
    if (kind === "stats") {
      base.gameStats.battles = Number.MAX_SAFE_INTEGER;
      a.gameStats.battles = 1;
    }
    if (kind === "counts") {
      base.dexData[25].caughtCount = Number.MAX_SAFE_INTEGER;
    }
    expect(() => mergeSystemData(base, [source(a)], options)).toThrow("overflow");
  });
  it("preserves account identity and migration timestamps", () => {
    const base = save();
    const a = save(2);
    base.appliedMigrators.old = 10;
    a.appliedMigrators.old = 20;
    expect(mergeSystemData(base, [source(a)], options).data).toMatchObject({
      trainerId: 1,
      secretId: 1,
      gender: 0,
      appliedMigrators: { old: 10 },
      timestamp: 100,
      gameVersion: options.version,
    });
  });
  it("validates unknown fields, IV bounds, masks, numbers and history", () => {
    const raw = () => JSON.parse(serializeSystemData(save()));
    expect(() => validateSystemImportShape(raw())).not.toThrow();
    const changes = [
      d => {
        d.newField = 1;
      },
      d => {
        d.dexData[25].ivs[0] = 32;
      },
      d => {
        d.starterData[25].eggMoves = 16;
      },
      d => {
        d.voucherCounts[0] = -1;
      },
      d => {
        d.eggs = [{}];
      },
      d => {
        d.importHistory = { version: 2, fingerprints: [] };
      },
      d => {
        d.dexData[25].seenAttr = 1e30;
      },
      d => {
        d.gameStats.battles = null;
      },
    ];
    for (const change of changes) {
      const data = raw();
      change(data);
      expect(() => validateSystemImportShape(data)).toThrow();
    }
  });
  it("expands only keys and rejects collisions and prototype fields", () => {
    expect(expandSystemKeys({ $x: 5, text: "$x" }, { candyCount: "$x" })).toEqual({ candyCount: 5, text: "$x" });
    expect(() => expandSystemKeys({ $x: 5, candyCount: 7 }, { candyCount: "$x" })).toThrow();
    expect(() => expandSystemKeys(JSON.parse('{"__proto__":{}}'), {})).toThrow();
  });
  it("fingerprints ignore key order, export time and migration timestamps, while revisions detect metadata changes", () => {
    const data = save();
    const changed = cloneSystemData(data);
    changed.timestamp++;
    changed.appliedMigrators.read = 50;
    expect(systemFingerprint(data)).toBe(
      systemFingerprint(Object.fromEntries(Object.entries(changed).reverse()) as unknown as SystemSaveData),
    );
    expect(systemRevision(data)).not.toBe(systemRevision(changed));
  });
  it("decodes encrypted/plain/abbreviated data, runs migrations and rejects future/corrupt/non-system inputs", () => {
    const decoder = {
      decrypt: (text: string) => AES.decrypt(text, "test").toString(enc.Utf8),
      shortKeys: { candyCount: "$x" },
      parse: (text: string) => cloneSystemData(JSON.parse(text)),
      migrate: vi.fn(),
      version: options.version,
      compareVersions: (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }),
    };
    const raw = serializeSystemData(save()).replace('"candyCount"', '"$x"');
    const a = decodeSystemImport(AES.encrypt(raw, "test").toString(), decoder);
    const b = decodeSystemImport(AES.encrypt(raw, "test").toString(), decoder);
    expect(systemFingerprint(a)).toBe(systemFingerprint(b));
    expect(decodeSystemImport(raw, decoder).starterData[25].candyCount).toBe(0);
    const emptyRibbons = JSON.parse(raw);
    emptyRibbons.dexData[25].ribbons = "";
    const normalizedRibbons = decodeSystemImport(JSON.stringify(emptyRibbons), decoder);
    expect(normalizedRibbons.dexData[25].ribbons.getRibbons()).toBe(0n);
    expect(systemFingerprint(normalizedRibbons)).toBe(systemFingerprint(a));
    emptyRibbons.gameVersion = "1.0.4";
    expect(decodeSystemImport(JSON.stringify(emptyRibbons), decoder).dexData[25].ribbons.getRibbons()).toBe(0n);
    emptyRibbons.dexData[25].ribbons = "not-hex";
    expect(() => decodeSystemImport(JSON.stringify(emptyRibbons), decoder)).toThrow("invalid");
    decodeSystemImport(raw.replace(options.version, "1.12.1.0"), decoder);
    expect(decoder.migrate).toHaveBeenCalled();
    const serverRaw = JSON.parse(raw);
    serverRaw.starterMoveData = null;
    serverRaw.starterEggMoveData = {};
    expect(decodeSystemImport(JSON.stringify(serverRaw), decoder).starterData[25].candyCount).toBe(0);
    expect(() => decodeSystemImport(raw.replace(options.version, "9.0.0"), decoder)).toThrow("unsupported");
    expect(() => decodeSystemImport('{"party":[]}', decoder)).toThrow();
    expect(() => decodeSystemImport("corrupt", decoder)).toThrow();
    expect(() => decodeSystemImport(raw.replace('"battles":0', '"battles":null'), decoder)).toThrow();
    expect(() => decodeSystemImport(raw.replace('"eggs":[]', '"eggs":[{"unknown":1}]'), decoder)).toThrow(
      "unsupported",
    );
  });
  it("requires another confirmation if current data or lineage changed", async () => {
    const base = save();
    const result = mergeSystemData(base, [source(save(2))], options);
    const saveData = vi.fn();
    const changed = cloneSystemData(base);
    changed.starterData[25].candyCount++;
    expect(await commitSystemMerge(base, result, async () => changed, saveData)).toBe(changed);
    expect(saveData).not.toHaveBeenCalled();
    changed.starterData[25].candyCount--;
    changed.importHistory = result.data.importHistory!;
    expect(await commitSystemMerge(base, result, async () => changed, saveData)).toBe(changed);
    expect(saveData).not.toHaveBeenCalled();
  });
  it("persists once on confirmation and leaves base unchanged on persistence failure", async () => {
    const base = save();
    const before = serializeSystemData(base);
    const result = mergeSystemData(base, [source(save(2))], options);
    const success = vi.fn().mockResolvedValue(undefined);
    expect(await commitSystemMerge(base, result, async () => base, success)).toBeNull();
    expect(success).toHaveBeenCalledOnce();
    await expect(
      commitSystemMerge(
        base,
        result,
        async () => base,
        async () => {
          throw new Error("network failed");
        },
      ),
    ).rejects.toThrow("network failed");
    expect(serializeSystemData(base)).toBe(before);
  });
});

describe("Merge import dialog", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  afterEach(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  async function open() {
    const { showSystemMergeDialog } = await import("#ui/system-merge-dialog");
    const base = save();
    const callbacks = {
      parse: (text: string) => cloneSystemData(JSON.parse(text)),
      readCurrent: vi.fn().mockResolvedValue(base),
      save: vi.fn().mockResolvedValue(undefined),
      mergeOptions: () => options,
      speciesName: () => "Pikachu",
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    };
    showSystemMergeDialog(callbacks);
    const panel = document.getElementById("system-merge-dialog")!;
    const input = panel.querySelector("input")!;
    const actions = panel.querySelectorAll("button");
    const cancel = actions[0];
    const confirm = actions[1];
    async function select(values: { name: string; text: () => Promise<string> }[]) {
      Object.defineProperty(input, "files", { value: values, configurable: true });
      await input.onchange!.call(input, new Event("change"));
    }
    return { callbacks, base, panel, input, cancel, confirm, select };
  }
  it("supports multiple visible file selection, removes invalid files, previews details and saves on confirmation", async () => {
    const ui = await open();
    expect(ui.input.multiple).toBe(true);
    expect(ui.confirm.disabled).toBe(true);
    await ui.select([
      { name: "bad.prsv", text: async () => "invalid" },
      { name: "good.prsv", text: async () => serializeSystemData(save(2)) },
    ]);
    expect(ui.confirm.disabled).toBe(true);
    expect(ui.panel.textContent).toContain("good.prsv");
    expect(ui.panel.querySelector("details")).not.toBeNull();
    const remove = [...ui.panel.querySelectorAll("button")].find(b => b.textContent === "Remove")!;
    remove.click();
    expect(ui.confirm.disabled).toBe(false);
    expect(ui.callbacks.save).not.toHaveBeenCalled();
    await ui.confirm.onclick!.call(ui.confirm, new MouseEvent("click") as PointerEvent);
    expect(ui.callbacks.save).toHaveBeenCalledOnce();
    expect(ui.callbacks.onSuccess).toHaveBeenCalledOnce();
    expect(document.getElementById("system-merge-dialog")).toBeNull();
  });
  it("keeps both action rows synchronized and prevents duplicate saves", async () => {
    const ui = await open();
    const confirms = [...ui.panel.querySelectorAll<HTMLButtonElement>('[data-action="confirm"]')];
    const cancels = [...ui.panel.querySelectorAll<HTMLButtonElement>('[data-action="cancel"]')];
    expect(confirms).toHaveLength(2);
    expect(confirms.every(button => button.disabled)).toBe(true);
    expect(confirms[0].closest("header")).not.toBeNull();
    await ui.select([{ name: "good.prsv", text: async () => serializeSystemData(save(2)) }]);
    expect(confirms.every(button => !button.disabled)).toBe(true);
    let finish!: () => void;
    ui.callbacks.save.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const saving = confirms[0].onclick!.call(confirms[0], new MouseEvent("click") as PointerEvent);
    await Promise.resolve();
    expect(confirms.every(button => button.disabled)).toBe(true);
    expect(cancels.every(button => button.disabled)).toBe(true);
    await confirms[1].onclick!.call(confirms[1], new MouseEvent("click") as PointerEvent);
    expect(ui.callbacks.save).toHaveBeenCalledOnce();
    finish();
    await saving;
    expect(ui.callbacks.onSuccess).toHaveBeenCalledOnce();
  });
  it("isolates keydown and keyup, traps focus and restores the background", async () => {
    const background = document.createElement("div");
    background.id = "app";
    const previous = document.createElement("button");
    background.append(previous);
    document.body.append(background);
    previous.focus();
    const ui = await open();
    const gameKey = vi.fn();
    window.addEventListener("keydown", gameKey, true);
    window.addEventListener("keyup", gameKey, true);
    try {
      expect(background.inert).toBe(true);
      ui.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      ui.input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      expect(gameKey).not.toHaveBeenCalled();
      const first = ui.panel.querySelector<HTMLButtonElement>('[data-action="cancel"]')!;
      first.focus();
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(ui.panel.querySelectorAll('[data-action="cancel"]')[1]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(background.inert).toBe(false);
      expect(document.activeElement).toBe(previous);
    } finally {
      window.removeEventListener("keydown", gameKey, true);
      window.removeEventListener("keyup", gameKey, true);
      background.remove();
    }
  });
  it("cancels without saving and closes accessibly with Escape", async () => {
    const ui = await open();
    await ui.select([{ name: "good.prsv", text: async () => serializeSystemData(save(2)) }]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ui.callbacks.save).not.toHaveBeenCalled();
    expect(ui.callbacks.onClose).toHaveBeenCalledOnce();
    expect(document.getElementById("system-merge-dialog")).toBeNull();
  });
  it("rebuilds a changed preview and allows retry after a failed save", async () => {
    const ui = await open();
    await ui.select([{ name: "good.prsv", text: async () => serializeSystemData(save(2)) }]);
    const changed = save();
    changed.starterData[25].candyCount = 5;
    ui.callbacks.readCurrent.mockResolvedValue(changed);
    await ui.confirm.onclick!.call(ui.confirm, new MouseEvent("click") as PointerEvent);
    expect(ui.callbacks.save).not.toHaveBeenCalled();
    expect(ui.panel.textContent).toContain("preview has been rebuilt");
    ui.callbacks.save.mockRejectedValueOnce(new Error("network"));
    await ui.confirm.onclick!.call(ui.confirm, new MouseEvent("click") as PointerEvent);
    expect(ui.callbacks.onSuccess).not.toHaveBeenCalled();
    expect(ui.confirm.disabled).toBe(false);
    await ui.confirm.onclick!.call(ui.confirm, new MouseEvent("click") as PointerEvent);
    expect(ui.callbacks.onSuccess).toHaveBeenCalledOnce();
  });
});
