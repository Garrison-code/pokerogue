import { getNatureName } from "#data/nature";
import {
  cloneSystemData,
  commitSystemMerge,
  MergeImportError,
  type MergeOptions,
  type MergeResult,
  mergeSystemData,
  serializeSystemData,
  systemChanges,
} from "#system/system-data-merge";
import type { SystemSaveData } from "#types/save-data";
import i18next from "i18next";

interface ImportFile {
  name: string;
  data?: SystemSaveData;
  error?: string;
}
export interface SystemMergeDialogOptions {
  parse: (text: string) => SystemSaveData;
  readCurrent: () => Promise<SystemSaveData>;
  save: (data: SystemSaveData) => Promise<void>;
  mergeOptions: () => MergeOptions;
  speciesName: (id: number) => string;
  onClose: () => void;
  onSuccess: () => void;
}

const t = (key: string, args: Record<string, unknown> = {}): string => String(i18next.t(`mergeImport:${key}`, args));
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

export function showSystemMergeDialog(options: SystemMergeDialogOptions): void {
  if (document.getElementById("system-merge-dialog")) {
    return;
  }
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = element("div");
  overlay.id = "system-merge-dialog";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10001;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;color:#eee;font:16px system-ui;box-sizing:border-box";
  const panel = element("section");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "system-merge-title");
  panel.style.cssText =
    "background:#192438;border:2px solid #8298bb;border-radius:10px;padding:20px;width:850px;max-width:100%;max-height:90dvh;overflow:auto;box-sizing:border-box";
  const title = element("h2", t("title"));
  title.id = "system-merge-title";
  panel.append(title, element("p", t("description")), element("p", t("overlapWarning")));
  const label = element("label", t("selectFiles"));
  const input = element("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".prsv,.json,.txt";
  input.style.cssText = "display:block;margin:12px 0;max-width:100%";
  label.append(input);
  const status = element("p");
  status.setAttribute("role", "status");
  const filesView = element("div");
  const preview = element("div");
  const actions = element("div");
  actions.style.cssText = "display:flex;gap:12px;margin-top:16px;flex-wrap:wrap";
  const cancel = element("button", t("cancel"));
  const confirm = element("button", t("confirm"));
  confirm.disabled = true;
  actions.append(cancel, confirm);
  panel.append(label, status, filesView, preview, actions);
  overlay.append(panel);
  document.body.append(overlay);
  const background = document.getElementById("game-layout") ?? document.getElementById("app");
  const wasInert = background?.inert ?? false;
  if (background) {
    background.inert = true;
  }
  const files: ImportFile[] = [];
  let base: SystemSaveData | undefined;
  let result: MergeResult | undefined;
  let busy = false;
  let closed = false;

  const errorText = (error: unknown): string =>
    error instanceof MergeImportError ? t(`errors.${error.code}`, { field: error.field }) : t("errors.failed");
  const close = () => {
    if (busy || closed) {
      return;
    }
    closed = true;
    window.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("keyup", keyboard, true);
    if (background) {
      background.inert = wasInert;
    }
    overlay.remove();
    options.onClose();
    previousFocus?.focus();
  };
  const keyboard = (event: KeyboardEvent) => {
    event.stopImmediatePropagation();
    if (event.type === "keyup") {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab") {
      const focusable = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),summary")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  window.addEventListener("keydown", keyboard, true);
  window.addEventListener("keyup", keyboard, true);
  cancel.onclick = close;
  input.focus();

  function setBusy(value: boolean): void {
    busy = value;
    input.disabled = value;
    cancel.disabled = value;
    filesView.querySelectorAll("button").forEach(button => {
      button.disabled = value;
    });
    confirm.disabled =
      value || !result || files.some(file => file.error) || !result.files.some(file => file.status === "accepted");
  }
  function fieldName(field: string): string {
    const parts = field.split(".");
    if (parts[0] === "voucherCounts") {
      return t(`voucherNames.${parts[1]}`);
    }
    const key = parts.at(-1)!;
    if (["unlocks", "achvUnlocks", "voucherUnlocks"].includes(parts[0])) {
      return `${t(`fields.${parts[0]}`)} · ${parts[0] === "unlocks" ? t(`features.${key}`) : key}`;
    }
    return t(`fields.${key}`);
  }
  function valueText(value: unknown, field: string): string {
    if (value === undefined) {
      return "—";
    }
    if (typeof value === "boolean") {
      return t(value ? "yes" : "no");
    }
    if (field.endsWith("seenAttr") || field.endsWith("caughtAttr")) {
      const bits = BigInt(String(value));
      const names = ["normal", "shiny", "male", "female", "yellow", "blue", "red"];
      const labels = names.filter((_, i) => bits & (1n << BigInt(i))).map(key => t(`flags.${key}`));
      for (let i = 7; 1n << BigInt(i) <= bits; i++) {
        if (bits & (1n << BigInt(i))) {
          labels.push(t("form", { index: i - 6 }));
        }
      }
      return labels.join(" / ") || "—";
    }
    if (field.endsWith("natureAttr")) {
      const bits = Number(value);
      return (
        Array.from({ length: 25 }, (_, i) => i)
          .filter(i => bits & (1 << (i + 1)))
          .map(nature => getNatureName(nature))
          .join(" / ") || "—"
      );
    }
    if (field.endsWith("passiveAttr")) {
      const bits = Number(value);
      return `${t("passiveUnlocked")}: ${t(bits & 1 ? "yes" : "no")} / ${t("passiveEnabled")}: ${t(bits & 2 ? "yes" : "no")}`;
    }
    if (field.endsWith("abilityAttr")) {
      return (
        ["ability1", "ability2", "hiddenAbility"]
          .filter((_, i) => Number(value) & (1 << i))
          .map(key => t(`flags.${key}`))
          .join(" / ") || "—"
      );
    }
    if (field.endsWith("ribbons") || field.endsWith("eggMoves")) {
      const bits = field.endsWith("ribbons") ? BigInt(`0x${value || "0"}`) : BigInt(String(value));
      return t("unlockedCount", { count: bits.toString(2).replace(/0/g, "").length });
    }
    if (field === "eggs" && Array.isArray(value)) {
      return (
        value
          .map(egg =>
            t("eggDescription", {
              name: egg.species ? options.speciesName(egg.species) : t("legacyEgg"),
              waves: egg.hatchWaves,
            }),
          )
          .join("; ") || "—"
      );
    }
    if (field.startsWith("achvUnlocks.") || field.startsWith("voucherUnlocks.")) {
      return new Date(Number(value)).toLocaleString(i18next.resolvedLanguage);
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  function changeTable(changes: ReturnType<typeof systemChanges>): HTMLElement {
    const table = element("table");
    table.style.cssText = "width:100%;border-collapse:collapse;overflow-wrap:anywhere;font-size:14px";
    const head = element("tr");
    for (const key of ["field", "before", "after", "increase"]) {
      head.append(element("th", t(key)));
    }
    table.append(head);
    for (const change of changes) {
      const row = element("tr");
      const values = [
        fieldName(change.field),
        valueText(change.before, change.field),
        valueText(change.after, change.field),
        typeof change.before === "number"
        && typeof change.after === "number"
        && !/(Attr|eggMoves|ribbons)$/.test(change.field)
          ? String(change.after - change.before)
          : "—",
      ];
      for (const value of values) {
        const cell = element("td", value);
        cell.style.cssText = "padding:6px;border-bottom:1px solid #52617a;text-align:left";
        row.append(cell);
      }
      table.append(row);
    }
    return table;
  }
  function rebuild(): void {
    result = undefined;
    preview.replaceChildren();
    let mergeError: string | undefined;
    if (base) {
      try {
        result = mergeSystemData(
          base,
          files
            .filter((f): f is ImportFile & { data: SystemSaveData } => !!f.data)
            .map(f => ({ name: f.name, data: f.data })),
          options.mergeOptions(),
        );
      } catch (error) {
        mergeError = errorText(error);
      }
    }
    filesView.replaceChildren();
    let validIndex = 0;
    files.forEach((file, index) => {
      const row = element("div");
      row.style.cssText = "display:flex;align-items:center;gap:12px;margin:8px 0;overflow-wrap:anywhere";
      const state = file.error ?? (file.data ? t(result?.files[validIndex++]?.status ?? "pending") : t("pending"));
      row.append(element("span", `${file.name}: ${state}`));
      const remove = element("button", t("remove"));
      remove.onclick = () => {
        files.splice(index, 1);
        status.textContent = "";
        rebuild();
      };
      row.append(remove);
      filesView.append(row);
    });
    if (mergeError) {
      preview.append(element("p", mergeError));
    }
    if (result && base) {
      const before = JSON.parse(serializeSystemData(base));
      const after = JSON.parse(serializeSystemData(result.data));
      const changes = systemChanges(before, after).filter(
        c => !["timestamp", "gameVersion", "importHistory", "appliedMigrators"].includes(c.field.split(".")[0]),
      );
      const species = new Set(
        changes.filter(c => /^(dexData|starterData)\./.test(c.field)).map(c => c.field.split(".")[1]),
      );
      preview.append(
        element(
          "h3",
          t("summary", {
            accepted: result.files.filter(f => f.status === "accepted").length,
            duplicate: result.files.filter(f => f.status === "duplicate").length,
            species: species.size,
          }),
        ),
      );
      preview.append(changeTable(changes.filter(c => !/^(dexData|starterData)\./.test(c.field))));
      for (const [id, count] of Object.entries(result.candyOverflow)) {
        preview.append(element("p", t("candyOverflow", { name: options.speciesName(Number(id)), count })));
      }
      if (result.data.eggs.length > 99) {
        preview.append(element("p", t("eggOverflow", { count: result.data.eggs.length })));
      }
      for (const id of species) {
        const details = element("details");
        details.style.cssText = "margin:12px 0;border:1px solid #52617a;padding:10px;border-radius:6px";
        details.append(element("summary", options.speciesName(Number(id))));
        details.append(
          changeTable(changes.filter(c => /^(dexData|starterData)\./.test(c.field) && c.field.split(".")[1] === id)),
        );
        preview.append(details);
      }
    }
    setBusy(false);
  }
  input.onchange = async () => {
    setBusy(true);
    status.textContent = t("loading");
    try {
      if (!base) {
        base = cloneSystemData(await options.readCurrent());
      }
      for (const file of Array.from(input.files ?? [])) {
        try {
          files.push({ name: file.name, data: options.parse(await file.text()) });
        } catch (error) {
          files.push({ name: file.name, error: errorText(error) });
        }
      }
      status.textContent = "";
      input.value = "";
      rebuild();
    } catch (error) {
      status.textContent = errorText(error);
      setBusy(false);
    }
  };
  confirm.onclick = async () => {
    if (busy || !base || !result) {
      return;
    }
    setBusy(true);
    status.textContent = t("saving");
    try {
      const changed = await commitSystemMerge(base, result, options.readCurrent, options.save);
      if (changed) {
        base = cloneSystemData(changed);
        rebuild();
        status.textContent = t("changed");
        return;
      }
      setBusy(false);
      close();
      options.onSuccess();
    } catch (error) {
      status.textContent = errorText(error);
      setBusy(false);
    }
  };
}
