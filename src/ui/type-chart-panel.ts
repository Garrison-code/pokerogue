import { eventBus } from "#app/event-bus";
import { settings } from "#app/global-settings-manager";
import { getTypeRgb } from "#data/type";
import { queryTypeChart, regularTypes } from "#data/type-chart";
import type { RegularPokemonType } from "#enums/pokemon-type";
import { TextStyle } from "#enums/text-style";
import type { SettingsUpdateEventArgs } from "#types/event-bus-types";
import { getTextColor } from "#ui/text";
import { getCachedUrl } from "#utils/fetch-utils";
import { getPokemonTypeLocaleKey } from "#utils/i18n";
import i18next from "i18next";

interface TypeChartPanelOptions {
  onToolFocus: () => void;
  onResize: (width: number, height: number) => void;
}

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const result = document.createElement(tag);
  if (className) {
    result.className = className;
  }
  return result;
};
const t = (key: string): string => String(i18next.t(`typeChart:${key}`));

/** A non-modal tool beside the existing game, with no dependency on battle state. */
export function createTypeChartPanel(options: TypeChartPanelOptions): { refresh: () => void; destroy: () => void } {
  const app = document.getElementById("app")!;
  const controls = document.getElementById("touchControls")!;
  const appMarker = document.createComment("game app");
  const controlsMarker = document.createComment("touch controls");
  app.before(appMarker);
  controls.before(controlsMarker);
  const layout = node("div");
  layout.id = "game-layout";
  const applyTheme = () => {
    const legacy = settings.isLegacyTheme;
    const windowPath = `images/ui/${legacy ? "legacy/" : ""}windows/window_${settings.display.uiWindowStyle}.png`;
    layout.dataset.theme = legacy ? "legacy" : "default";
    layout.style.setProperty("--chart-window", `url("${new URL(getCachedUrl(windowPath), document.baseURI).href}")`);
    layout.style.setProperty("--chart-window-slice", legacy ? "6" : "8");
    layout.style.setProperty("--chart-text", getTextColor(TextStyle.WINDOW));
    layout.style.setProperty("--chart-shadow", getTextColor(TextStyle.WINDOW, true));
  };
  const onSettingsUpdate = ({ category, key }: SettingsUpdateEventArgs) => {
    if (category === "display" && (key === "uiTheme" || key === "uiWindowStyle")) {
      applyTheme();
    }
  };
  applyTheme();
  eventBus.on("settings/update/success", onSettingsUpdate);
  const panel = node("aside", "type-chart-panel");
  panel.id = "type-chart-panel";
  panel.dataset.gameTool = "";
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "type-chart-title");
  const heading = node("h2");
  heading.id = "type-chart-title";
  const close = node("button");
  close.type = "button";
  const header = node("div", "type-chart-header");
  header.append(heading, close);
  const scope = node("p", "type-chart-scope");
  const defender = node("h3");
  defender.id = "type-chart-defender";
  const grid = node("div", "type-chart-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-labelledby", defender.id);
  const clear = node("button");
  clear.type = "button";
  const hint = node("p", "type-chart-hint");
  hint.id = "type-chart-hint";
  hint.setAttribute("role", "status");
  grid.setAttribute("aria-describedby", hint.id);
  const attacker = node("h3");
  const results = node("div", "type-chart-results");
  results.setAttribute("aria-live", "polite");
  panel.append(header, scope, defender, grid, clear, hint, attacker, results);

  const shell = node("div", "game-shell");
  const toolbar = node("div", "game-tools");
  toolbar.dataset.gameTool = "";
  const toggle = node("button");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", panel.id);
  toggle.setAttribute("aria-expanded", "false");
  toolbar.append(toggle);
  const viewport = node("div");
  viewport.id = "game-viewport";
  app.tabIndex = -1;
  viewport.append(app, controls);
  shell.append(toolbar, viewport);
  layout.append(panel, shell);
  appMarker.after(layout);

  const selected = new Set<RegularPokemonType>();
  const buttons = new Map<RegularPokemonType, HTMLButtonElement>();
  const name = (type: RegularPokemonType) => String(i18next.t(getPokemonTypeLocaleKey(type)));
  const color = (element: HTMLElement, type: RegularPokemonType) => {
    const rgb = getTypeRgb(type);
    element.style.setProperty("--type-color", `rgb(${rgb.join(",")})`);
    // WCAG relative luminance: pick the higher-contrast black/white foreground.
    const linear = rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    element.style.setProperty("--type-text", (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000" : "#fff");
  };
  for (const type of regularTypes) {
    const button = node("button", "type-chart-type");
    button.type = "button";
    button.dataset.type = String(type);
    color(button, type);
    button.addEventListener("click", () => {
      if (selected.has(type)) {
        selected.delete(type);
      } else if (selected.size < 2) {
        selected.add(type);
      }
      render();
    });
    buttons.set(type, button);
    grid.append(button);
  }
  function render(): void {
    heading.textContent = t("title");
    toggle.textContent = t("title");
    close.textContent = t("close");
    clear.textContent = t("clear");
    clear.disabled = selected.size === 0;
    scope.textContent = t("scope");
    defender.textContent = t("defender");
    attacker.textContent = t("attacker");
    hint.textContent = t(selected.size === 2 ? "limit" : "choose");
    for (const [type, button] of buttons) {
      const active = selected.has(type);
      button.textContent = `${active ? "✓ " : ""}${name(type)}`;
      button.setAttribute("aria-pressed", String(active));
      // Keep choices focusable so the selection limit remains discoverable by keyboard.
      button.setAttribute("aria-disabled", String(selected.size === 2 && !active));
    }
    renderResults();
  }
  function renderResults(): void {
    results.replaceChildren();
    const { groups } = queryTypeChart([...selected]);
    for (const [multiplier, types] of groups) {
      const section = node("section", "type-chart-result");
      section.dataset.multiplier = String(multiplier);
      const title = node("h4");
      const labels = { 0.5: "½×", 0.25: "¼×" };
      title.textContent = labels[multiplier] ?? `${multiplier}×`;
      const list = node("ul", "type-chart-badges");
      for (const type of types) {
        const badge = node("li", "type-chart-type");
        badge.textContent = name(type);
        color(badge, type);
        list.append(badge);
      }
      section.append(title, list);
      results.append(section);
    }
    if (selected.size > 0 && groups.size === 0) {
      const neutral = node("p");
      neutral.textContent = t("neutral");
      results.append(neutral);
    }
  }
  const setOpen = (open: boolean) => {
    options.onToolFocus();
    panel.hidden = !open;
    layout.dataset.chartOpen = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      close.focus();
    } else {
      toggle.focus();
    }
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden === true));
  close.addEventListener("click", () => setOpen(false));
  clear.addEventListener("click", () => {
    selected.clear();
    // Clear becomes disabled after rendering. Move focus to a usable choice first.
    buttons.get(regularTypes[0])!.focus();
    render();
  });

  const isTool = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest("[data-game-tool]");
  const keyboard = (event: KeyboardEvent) => {
    if (!isTool(event.target)) {
      return;
    }
    // Phaser listens on window. Stop it before its keyboard queue or key capture runs;
    // leave native button activation and Tab navigation intact.
    event.stopImmediatePropagation();
    if (event.type === "keydown" && event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const focus = (event: FocusEvent) => {
    if (isTool(event.target) || isTool(event.relatedTarget)) {
      options.onToolFocus();
    }
  };
  const pointer = (event: PointerEvent) => {
    if (isTool(document.activeElement) && event.target instanceof Node && viewport.contains(event.target)) {
      options.onToolFocus();
      // Return keyboard ownership without stealing focus from login/name inputs.
      const editable =
        event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]");
      if (!editable) {
        app.focus({ preventScroll: true });
      }
    }
  };
  const toolPointer = (event: PointerEvent) => {
    options.onToolFocus();
    if (event.target instanceof Element && !event.target.closest("button")) {
      panel.focus({ preventScroll: true });
    }
  };
  window.addEventListener("keydown", keyboard, true);
  window.addEventListener("keyup", keyboard, true);
  document.addEventListener("focusin", focus);
  viewport.addEventListener("pointerdown", pointer, true);
  panel.addEventListener("pointerdown", toolPointer, true);

  const refresh = () => {
    const { width, height } = viewport.getBoundingClientRect();
    layout.dataset.wide = String(layout.getBoundingClientRect().width >= 960);
    viewport.style.setProperty("--game-width", `${width}px`);
    viewport.style.setProperty("--game-height", `${height}px`);
    if (width && height) {
      options.onResize(width, height);
    }
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(layout);
  observer.observe(viewport);
  i18next.on("languageChanged", render);
  i18next.on("loaded", render);
  render();
  refresh();
  return {
    refresh,
    destroy() {
      observer.disconnect();
      eventBus.off("settings/update/success", onSettingsUpdate);
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("keyup", keyboard, true);
      document.removeEventListener("focusin", focus);
      viewport.removeEventListener("pointerdown", pointer, true);
      i18next.off("languageChanged", render);
      i18next.off("loaded", render);
      appMarker.replaceWith(app);
      controlsMarker.replaceWith(controls);
      app.removeAttribute("tabindex");
      layout.remove();
    },
  };
}
