import { MAX_STARTER_CANDY_COUNT } from "#constants/game-constants";
import { Passive } from "#enums/passive";
import { EggData } from "#system/egg-data";
import { GameStats } from "#system/game-stats";
import { RibbonData } from "#system/ribbon-data";
import type { SystemSaveData } from "#types/save-data";
import { SHA256 } from "crypto-js";

export class MergeImportError extends Error {
  constructor(
    public readonly code: "invalid" | "unsupported" | "overflow" | "eggConflict",
    public readonly field: string,
  ) {
    super(`${code}: ${field}`);
  }
}

const systemKeys = [
  "trainerId",
  "secretId",
  "gender",
  "dexData",
  "starterData",
  "gameStats",
  "unlocks",
  "achvUnlocks",
  "voucherUnlocks",
  "voucherCounts",
  "eggs",
  "gameVersion",
  "timestamp",
  "eggPity",
  "unlockPity",
  "appliedMigrators",
  "importHistory",
];
const dexKeys = ["seenAttr", "caughtAttr", "natureAttr", "seenCount", "caughtCount", "hatchedCount", "ivs", "ribbons"];
const starterKeys = [
  "moveset",
  "eggMoves",
  "candyCount",
  "friendship",
  "abilityAttr",
  "passiveAttr",
  "valueReduction",
  "classicWinCount",
  "pity",
];
const eggKeys = [
  "id",
  "tier",
  "sourceType",
  "hatchWaves",
  "timestamp",
  "variantTier",
  "isShiny",
  "species",
  "eggMoveIndex",
  "overrideHiddenAbility",
];
const highestStats = new Set(["highestEndlessWave", "highestLevel", "highestMoney", "highestDamage", "highestHeal"]);
const statKeys = [
  "playTime",
  "battles",
  "classicSessionsPlayed",
  "sessionsWon",
  "ribbonsOwned",
  "dailyRunSessionsPlayed",
  "dailyRunSessionsWon",
  "endlessSessionsPlayed",
  "highestEndlessWave",
  "highestLevel",
  "highestMoney",
  "highestDamage",
  "highestHeal",
  "pokemonSeen",
  "pokemonDefeated",
  "pokemonCaught",
  "pokemonHatched",
  "subLegendaryPokemonSeen",
  "subLegendaryPokemonCaught",
  "subLegendaryPokemonHatched",
  "legendaryPokemonSeen",
  "legendaryPokemonCaught",
  "legendaryPokemonHatched",
  "mythicalPokemonSeen",
  "mythicalPokemonCaught",
  "mythicalPokemonHatched",
  "shinyPokemonSeen",
  "shinyPokemonCaught",
  "shinyPokemonHatched",
  "pokemonFused",
  "trainersDefeated",
  "eggsPulled",
  "rareEggsPulled",
  "epicEggsPulled",
  "legendaryEggsPulled",
  "manaphyEggsPulled",
] as const satisfies readonly (keyof GameStats)[];

export function serializeSystemData(data: SystemSaveData): string {
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export function cloneSystemData(data: SystemSaveData): SystemSaveData {
  return JSON.parse(serializeSystemData(data), (key, value) => {
    if (key === "ribbons") {
      return new RibbonData(BigInt(`0x${value || "0"}`));
    }
    if (key === "seenAttr" || key === "caughtAttr") {
      return BigInt(value);
    }
    if (key === "gameStats") {
      return new GameStats(value);
    }
    if (key === "eggs") {
      return value.map(egg => new EggData(egg));
    }
    return value;
  });
}

function object(value: unknown, field: string): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MergeImportError("invalid", field);
  }
}
function keys(value: unknown, allowed: readonly string[], field: string): void {
  object(value, field);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new MergeImportError("unsupported", `${field}.${key}`);
    }
  }
}
function number(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new MergeImportError("invalid", field);
  }
}
function array(value: unknown, field: string, length?: number, max?: number): void {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
    throw new MergeImportError("invalid", field);
  }
  value.forEach((v, i) => number(v, `${field}.${i}`, max));
}
function numericMap(value: unknown, field: string): void {
  object(value, field);
  for (const [key, v] of Object.entries(value)) {
    number(v, `${field}.${key}`);
  }
}
function moveset(value: unknown, field: string): void {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length > 4) {
      throw new MergeImportError("invalid", field);
    }
    array(value, field);
  } else {
    object(value, field);
    for (const [key, v] of Object.entries(value)) {
      if (!/^\d+$/.test(key) || !Array.isArray(v)) {
        throw new MergeImportError("invalid", field);
      }
      moveset(v, `${field}.${key}`);
    }
  }
}

/** Reject fields before constructors/migrations can silently discard them. */
export function validateKnownSystemFields(data: unknown): void {
  keys(data, [...systemKeys, "starterMoveData", "starterEggMoveData"], "system");
  const d = data as Record<string, any>;
  for (const [field, allowed] of [
    ["dexData", dexKeys],
    ["starterData", starterKeys],
  ] as const) {
    if (field === "starterData" && (d[field] === undefined || d[field] === null)) {
      continue;
    }
    object(d[field], field);
    for (const [id, entry] of Object.entries(d[field])) {
      keys(entry, allowed, `${field}.${id}`);
      if (field === "dexData") {
        const e = entry as Record<string, unknown>;
        for (const attr of ["seenAttr", "caughtAttr"]) {
          if (
            e[attr] !== undefined
            && (!/^[0-9]+$/.test(String(e[attr])) || (typeof e[attr] === "number" && !Number.isSafeInteger(e[attr])))
          ) {
            throw new MergeImportError("invalid", `${id}.${attr}`);
          }
        }
        if (e.ribbons !== undefined && (typeof e.ribbons !== "string" || !/^[0-9a-f]+$/i.test(e.ribbons))) {
          throw new MergeImportError("invalid", `${id}.ribbons`);
        }
      }
    }
  }
  keys(d.gameStats, statKeys, "gameStats");
  numericMap(d.gameStats, "gameStats");
  if (d.eggs === undefined || d.eggs === null) {
    return;
  }
  if (!Array.isArray(d.eggs)) {
    throw new MergeImportError("invalid", "eggs");
  }
  d.eggs.forEach((egg, i) => keys(egg, [...eggKeys, "gachaType"], `eggs.${i}`));
}

/** Check raw JSON too: class constructors must not hide unknown fields or invalid numbers. */
export function validateSystemImportShape(data: unknown): void {
  keys(data, systemKeys, "system");
  const d = data as Record<string, any>;
  for (const field of ["trainerId", "secretId", "gender", "timestamp"]) {
    number(d[field], field);
  }
  number(d.trainerId, "trainerId", 65535);
  number(d.secretId, "secretId", 65535);
  number(d.gender, "gender", 2);
  if (typeof d.gameVersion !== "string" || !/^\d+\.\d+\.\d+(\.\d+)?$/.test(d.gameVersion)) {
    throw new MergeImportError("invalid", "gameVersion");
  }
  for (const field of [
    "dexData",
    "starterData",
    "gameStats",
    "unlocks",
    "achvUnlocks",
    "voucherUnlocks",
    "voucherCounts",
    "appliedMigrators",
  ]) {
    object(d[field], field);
  }
  keys(d.gameStats, statKeys, "gameStats");
  numericMap(d.gameStats, "gameStats");
  for (const field of ["achvUnlocks", "voucherUnlocks", "voucherCounts", "appliedMigrators"]) {
    numericMap(d[field], field);
  }
  for (const [key, value] of Object.entries(d.unlocks)) {
    if (typeof value !== "boolean") {
      throw new MergeImportError("invalid", `unlocks.${key}`);
    }
  }
  array(d.eggPity, "eggPity", 4);
  array(d.unlockPity, "unlockPity", 4);
  for (const [id, entry] of Object.entries(d.dexData)) {
    if (!/^[1-9]\d*$/.test(id)) {
      throw new MergeImportError("invalid", `dexData.${id}`);
    }
    keys(entry, dexKeys, `dexData.${id}`);
    const e = entry as Record<string, any>;
    for (const field of ["seenAttr", "caughtAttr"]) {
      if (!/^[0-9]+$/.test(String(e[field])) || (typeof e[field] === "number" && !Number.isSafeInteger(e[field]))) {
        throw new MergeImportError("invalid", `${id}.${field}`);
      }
    }
    for (const field of ["natureAttr", "seenCount", "caughtCount", "hatchedCount"]) {
      number(e[field], `${id}.${field}`);
    }
    number(e.natureAttr, `${id}.natureAttr`, 0x3ffffff);
    array(e.ivs, `${id}.ivs`, 6, 31);
    if (typeof e.ribbons !== "string" || !/^[0-9a-f]+$/i.test(e.ribbons)) {
      throw new MergeImportError("invalid", `${id}.ribbons`);
    }
  }
  for (const [id, entry] of Object.entries(d.starterData)) {
    if (!/^[1-9]\d*$/.test(id) || !Object.hasOwn(d.dexData, id)) {
      throw new MergeImportError("invalid", `starterData.${id}`);
    }
    keys(entry, starterKeys, `starterData.${id}`);
    const e = entry as Record<string, any>;
    for (const field of starterKeys.filter(k => k !== "moveset" && k !== "pity")) {
      number(e[field], `${id}.${field}`);
    }
    number(e.eggMoves, `${id}.eggMoves`, 15);
    number(e.abilityAttr, `${id}.abilityAttr`, 7);
    number(e.passiveAttr, `${id}.passiveAttr`, 3);
    number(e.candyCount, `${id}.candyCount`, MAX_STARTER_CANDY_COUNT);
    moveset(e.moveset, `${id}.moveset`);
    array(e.pity, `${id}.pity`, 2);
  }
  if (!Array.isArray(d.eggs)) {
    throw new MergeImportError("invalid", "eggs");
  }
  d.eggs.forEach((egg, i) => {
    keys(egg, eggKeys, `eggs.${i}`);
    for (const field of eggKeys.filter(k => k !== "isShiny" && k !== "overrideHiddenAbility")) {
      number(egg[field], `eggs.${i}.${field}`);
    }
    number(egg.tier, `eggs.${i}.tier`, 3);
    number(egg.sourceType, `eggs.${i}.sourceType`, 4);
    number(egg.variantTier, `eggs.${i}.variantTier`, 2);
    number(egg.eggMoveIndex, `eggs.${i}.eggMoveIndex`, 3);
    for (const field of ["isShiny", "overrideHiddenAbility"]) {
      if (typeof egg[field] !== "boolean") {
        throw new MergeImportError("invalid", `eggs.${i}.${field}`);
      }
    }
  });
  if (d.importHistory !== undefined) {
    keys(d.importHistory, ["version", "fingerprints"], "importHistory");
    if (
      d.importHistory.version !== 1
      || !Array.isArray(d.importHistory.fingerprints)
      || d.importHistory.fingerprints.some(v => typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    ) {
      throw new MergeImportError("unsupported", "importHistory");
    }
  }
}

/** Sort object keys; retain array order (IVs, move slots and pity tiers are positional). */
function stable(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries([...Object.keys(value)].sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function systemFingerprint(data: SystemSaveData): string {
  const plain = JSON.parse(serializeSystemData(data));
  plain.timestamp = undefined;
  plain.importHistory = undefined;
  // Migrator timestamps are generated while reading legacy files.
  plain.appliedMigrators = undefined;
  return SHA256(JSON.stringify(stable(plain))).toString();
}

/** Expand abbreviated JSON keys structurally, never replace text inside values. */
export function expandSystemKeys(value: any, shortKeys: Record<string, string>): any {
  const reverse = Object.fromEntries(Object.entries(shortKeys).map(([key, short]) => [short, key]));
  reverse.$pAttr = "passiveAttr";
  function expand(v: any): any {
    if (Array.isArray(v)) {
      return v.map(expand);
    }
    if (!v || typeof v !== "object") {
      return v;
    }
    const entries: [string, any][] = [];
    const seen = new Set<string>();
    for (const [key, child] of Object.entries(v)) {
      const full = Object.hasOwn(reverse, key) ? reverse[key] : key;
      if (["__proto__", "constructor", "prototype"].includes(full) || seen.has(full)) {
        throw new MergeImportError("invalid", full);
      }
      seen.add(full);
      entries.push([full, expand(child)]);
    }
    return Object.fromEntries(entries);
  }
  return expand(value);
}

function add(a: number, b: number, field: string): number {
  const result = a + b;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new MergeImportError("overflow", field);
  }
  return result;
}

export interface MergeSource {
  name: string;
  data: SystemSaveData;
}
export interface MergeResult {
  data: SystemSaveData;
  files: { name: string; status: "accepted" | "duplicate" }[];
  candyOverflow: Record<string, number>;
}
export interface MergeOptions {
  version: string;
  now: number;
  friendshipCap: (speciesId: number) => number;
}

export function mergeSystemData(base: SystemSaveData, sources: MergeSource[], options: MergeOptions): MergeResult {
  const result = cloneSystemData(base);
  const known = new Set([systemFingerprint(base), ...(base.importHistory?.fingerprints ?? [])]);
  const files: MergeResult["files"] = [];
  const candyOverflow: Record<string, number> = {};
  // Accumulate friendship before converting, so input order cannot change capped results.
  for (const source of sources) {
    const fingerprint = systemFingerprint(source.data);
    const lineage = [fingerprint, ...(source.data.importHistory?.fingerprints ?? [])];
    if (lineage.some(hash => known.has(hash))) {
      files.push({ name: source.name, status: "duplicate" });
      continue;
    }
    const incoming = cloneSystemData(source.data);
    for (const [id, entry] of Object.entries(incoming.dexData)) {
      const target = result.dexData[id];
      if (!target) {
        result.dexData[id] = entry;
        continue;
      }
      target.seenAttr |= entry.seenAttr;
      target.caughtAttr |= entry.caughtAttr;
      target.natureAttr |= entry.natureAttr;
      target.ribbons = new RibbonData(target.ribbons.getRibbons() | entry.ribbons.getRibbons());
      target.ivs = target.ivs.map((v, i) => Math.max(v, entry.ivs[i]));
      for (const key of ["seenCount", "caughtCount", "hatchedCount"] as const) {
        target[key] = add(target[key], entry[key], `${id}.${key}`);
      }
    }
    for (const [id, entry] of Object.entries(incoming.starterData)) {
      const target = result.starterData[id];
      if (!target) {
        result.starterData[id] = entry;
        if (entry.passiveAttr & Passive.UNLOCKED) {
          entry.passiveAttr = Passive.UNLOCKED | Passive.ENABLED;
        }
        continue;
      }
      target.eggMoves |= entry.eggMoves;
      target.abilityAttr |= entry.abilityAttr;
      const wasUnlocked = !!(target.passiveAttr & Passive.UNLOCKED);
      target.passiveAttr |= entry.passiveAttr & Passive.UNLOCKED;
      if (!wasUnlocked && target.passiveAttr & Passive.UNLOCKED) {
        target.passiveAttr |= Passive.ENABLED;
      }
      target.valueReduction = Math.max(target.valueReduction, entry.valueReduction);
      target.candyCount = add(target.candyCount, entry.candyCount, `${id}.candyCount`);
      target.friendship = add(target.friendship, entry.friendship, `${id}.friendship`);
      target.classicWinCount = add(target.classicWinCount, entry.classicWinCount, `${id}.classicWinCount`);
      target.pity = target.pity.map((v, i) => Math.max(v, entry.pity[i])) as [number, number];
      if (target.moveset === null) {
        target.moveset = entry.moveset;
      }
    }
    for (const key of statKeys) {
      if (key === "ribbonsOwned") {
        continue;
      }
      result.gameStats[key] = highestStats.has(key)
        ? Math.max(result.gameStats[key], incoming.gameStats[key])
        : add(result.gameStats[key], incoming.gameStats[key], `gameStats.${key}`);
    }
    for (const [key, value] of Object.entries(incoming.unlocks)) {
      result.unlocks[key] = !!result.unlocks[key] || value;
    }
    for (const field of ["achvUnlocks", "voucherUnlocks"] as const) {
      for (const [key, value] of Object.entries(incoming[field])) {
        result[field][key] = Object.hasOwn(result[field], key) ? Math.min(result[field][key], value) : value;
      }
    }
    for (const [key, value] of Object.entries(incoming.voucherCounts)) {
      result.voucherCounts[key] = add(result.voucherCounts[key] ?? 0, value, `voucherCounts.${key}`);
    }
    result.eggPity = result.eggPity.map((v, i) => Math.max(v, incoming.eggPity[i]));
    result.unlockPity = result.unlockPity.map((v, i) => Math.max(v, incoming.unlockPity[i]));
    result.eggs.push(...incoming.eggs);
    lineage.forEach(hash => known.add(hash));
    files.push({ name: source.name, status: "accepted" });
  }
  for (const [id, entry] of Object.entries(result.starterData)) {
    const cap = options.friendshipCap(Number(id));
    number(cap, `${id}.friendshipCap`);
    if (cap === 0) {
      throw new MergeImportError("invalid", `${id}.friendshipCap`);
    }
    const total = add(entry.candyCount, Math.floor(entry.friendship / cap), `${id}.candyCount`);
    const overflow = Math.max(0, total - MAX_STARTER_CANDY_COUNT);
    if (overflow) {
      candyOverflow[id] = overflow;
    }
    const alreadyCapped = entry.candyCount >= MAX_STARTER_CANDY_COUNT;
    entry.candyCount = Math.min(total, MAX_STARTER_CANDY_COUNT);
    entry.friendship = alreadyCapped ? Math.min(entry.friendship, cap - 1) : entry.friendship % cap;
  }
  const eggs = new Map<string, EggData>();
  for (const egg of result.eggs) {
    const key = `${egg.id}:${egg.timestamp}`;
    const old = eggs.get(key);
    if (old) {
      const fixed = (e: EggData) =>
        JSON.stringify(stable(Object.fromEntries(Object.entries(e).filter(([k]) => k !== "hatchWaves"))));
      if (fixed(old) !== fixed(egg)) {
        throw new MergeImportError("eggConflict", key);
      }
      old.hatchWaves = Math.min(old.hatchWaves, egg.hatchWaves);
    } else {
      eggs.set(key, egg);
    }
  }
  result.eggs = [...eggs.values()];
  result.gameStats.ribbonsOwned = Object.values(result.starterData).filter(entry => entry.classicWinCount > 0).length;
  result.gameVersion = options.version;
  result.timestamp = options.now;
  result.importHistory = { version: 1, fingerprints: [...known].sort() };
  return { data: result, files, candyOverflow };
}

export interface MergeChange {
  field: string;
  before: unknown;
  after: unknown;
}
export function systemChanges(before: unknown, after: unknown, prefix = ""): MergeChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return [];
  }
  if (
    before
    && after
    && typeof before === "object"
    && typeof after === "object"
    && !Array.isArray(before)
    && !Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key =>
      systemChanges(before[key], after[key], prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ field: prefix, before, after }];
}

/** Unlike source fingerprints, revisions also include lineage and migrator metadata. */
export function systemRevision(data: SystemSaveData): string {
  const plain = JSON.parse(serializeSystemData(data));
  plain.timestamp = undefined;
  return SHA256(JSON.stringify(stable(plain))).toString();
}

export async function commitSystemMerge(
  base: SystemSaveData,
  result: MergeResult,
  readCurrent: () => Promise<SystemSaveData>,
  save: (data: SystemSaveData) => Promise<void>,
): Promise<SystemSaveData | null> {
  const current = await readCurrent();
  if (systemRevision(current) !== systemRevision(base)) {
    return current;
  }
  if (!result.files.some(file => file.status === "accepted")) {
    throw new MergeImportError("invalid", "sources");
  }
  await save(result.data);
  return null;
}

export interface ImportDecoder {
  decrypt: (text: string) => string;
  shortKeys: Record<string, string>;
  parse: (text: string) => SystemSaveData;
  migrate: (data: SystemSaveData) => void;
  version: string;
  compareVersions: (a: string, b: string) => number;
}
export function decodeSystemImport(text: string, decoder: ImportDecoder): SystemSaveData {
  try {
    const trimmed = text.trim();
    const raw = expandSystemKeys(
      JSON.parse(trimmed.startsWith("{") ? trimmed : decoder.decrypt(trimmed)),
      decoder.shortKeys,
    );
    if (typeof raw?.gameVersion !== "string" || !/^\d+\.\d+\.\d+(\.\d+)?$/.test(raw.gameVersion)) {
      throw new MergeImportError("invalid", "gameVersion");
    }
    if (decoder.compareVersions(raw.gameVersion, decoder.version) > 0) {
      throw new MergeImportError("unsupported", "gameVersion");
    }
    validateKnownSystemFields(raw);
    // Go's current API still emits the two retired maps as null.
    for (const field of ["starterMoveData", "starterEggMoveData"]) {
      const value = raw[field];
      if (
        value === null
        || (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
      ) {
        raw[field] = undefined;
      }
    }
    const normalizedJson = JSON.stringify(raw);
    if (decoder.compareVersions(raw.gameVersion, decoder.version) === 0) {
      validateSystemImportShape(JSON.parse(normalizedJson));
    }
    const data = decoder.parse(normalizedJson);
    decoder.migrate(data);
    if (decoder.compareVersions(raw.gameVersion, decoder.version) < 0) {
      // Match normal loading's defaults for fields absent in historical exports.
      data.unlocks ??= {};
      data.achvUnlocks ??= {};
      data.voucherUnlocks ??= {};
      data.voucherCounts ??= {};
      data.appliedMigrators ??= {};
      data.eggPity ??= [0, 0, 0, 0];
      data.unlockPity ??= [0, 0, 0, 0];
      data.eggs ??= [];
      for (const entry of Object.values(data.dexData)) {
        entry.hatchedCount ??= 0;
        entry.ribbons ??= new RibbonData(0);
      }
      for (const egg of data.eggs) {
        // Legacy eggs derive their contents from their ID when loaded by toEgg().
        if (!egg.species) {
          egg.species = 0 as EggData["species"];
          egg.variantTier ??= 0;
          egg.isShiny ??= false;
          egg.eggMoveIndex ??= 0;
          egg.overrideHiddenAbility ??= false;
        }
      }
    }
    validateSystemImportShape(JSON.parse(serializeSystemData(data)));
    data.gameVersion = decoder.version;
    return data;
  } catch (error) {
    if (error instanceof MergeImportError) {
      throw error;
    }
    throw new MergeImportError("invalid", "system");
  }
}
