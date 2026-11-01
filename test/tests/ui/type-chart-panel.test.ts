import { eventBus } from "#app/event-bus";
import { settings } from "#app/global-settings-manager";
import { PokemonType } from "#enums/pokemon-type";
import { UiTheme } from "#enums/ui-theme";
import { UiWindowStyle } from "#enums/ui-window-style";
import { createTypeChartPanel } from "#ui/type-chart-panel";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - Type chart panel", () => {
  let panel: ReturnType<typeof createTypeChartPanel>;
  let container: HTMLDivElement;
  let focus: ReturnType<typeof vi.fn<() => void>>;
  let resize: ReturnType<typeof vi.fn<(width: number, height: number) => void>>;
  let originalTheme: UiTheme;
  let originalWindowStyle: UiWindowStyle;
  const element = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const choice = (type: PokemonType) => element<HTMLButtonElement>(`[data-type="${type}"]`);
  const toggle = () => element<HTMLButtonElement>(".game-tools button");

  beforeEach(async () => {
    originalTheme = settings.display.uiTheme;
    originalWindowStyle = settings.display.uiWindowStyle;
    await i18next.changeLanguage("en");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    container = document.createElement("div");
    container.innerHTML = '<div id="app"></div><div id="touchControls"></div>';
    document.body.append(container);
    focus = vi.fn();
    resize = vi.fn();
    panel = createTypeChartPanel({ onToolFocus: focus, onResize: resize });
  });

  afterEach(() => {
    panel.destroy();
    settings.display.uiTheme = originalTheme;
    settings.display.uiWindowStyle = originalWindowStyle;
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each([UiTheme.DEFAULT, UiTheme.LEGACY])("initializes theme %s from settings without touch controls", theme => {
    panel.destroy();
    settings.display.uiTheme = theme;
    settings.display.uiWindowStyle = UiWindowStyle.TEAL;
    panel = createTypeChartPanel({ onToolFocus: focus, onResize: resize });
    const layout = element("#game-layout");
    const legacy = theme === UiTheme.LEGACY;
    expect(layout.dataset.theme).toBe(legacy ? "legacy" : "default");
    expect(layout.style.getPropertyValue("--chart-window")).toContain(
      `images/ui/${legacy ? "legacy/" : ""}windows/window_2.png`,
    );
    expect(layout.style.getPropertyValue("--chart-window-slice")).toBe(legacy ? "6" : "8");
    expect(layout.style.getPropertyValue("--chart-text")).toBe(legacy ? "#484848" : "#f8f8f8");
  });

  it("follows display setting changes without losing the query", () => {
    toggle().click();
    choice(PokemonType.WATER).click();
    for (const theme of [UiTheme.DEFAULT, UiTheme.LEGACY]) {
      settings.display.uiTheme = theme;
      eventBus.emit("settings/update/success", { category: "display", key: "uiTheme", value: theme });
      for (const style of Object.values(UiWindowStyle)) {
        settings.display.uiWindowStyle = style;
        eventBus.emit("settings/update/success", { category: "display", key: "uiWindowStyle", value: style });
        expect(element("#game-layout").style.getPropertyValue("--chart-window")).toContain(
          `images/ui/${theme === UiTheme.LEGACY ? "legacy/" : ""}windows/window_${style}.png`,
        );
        expect(choice(PokemonType.WATER).getAttribute("aria-pressed")).toBe("true");
        expect(element("aside").hidden).toBe(false);
      }
    }
  });

  it("removes its settings listener on destroy", () => {
    const layout = element("#game-layout");
    const originalStyles = layout.getAttribute("style");
    const count = eventBus.listenerCount("settings/update/success");
    panel.destroy();
    expect(eventBus.listenerCount("settings/update/success")).toBe(count - 1);
    settings.display.uiWindowStyle = UiWindowStyle.TEAL;
    eventBus.emit("settings/update/success", { category: "display", key: "uiWindowStyle", value: UiWindowStyle.TEAL });
    expect(layout.getAttribute("style")).toBe(originalStyles);
    // Recreate so the shared cleanup still exercises a live instance.
    panel = createTypeChartPanel({ onToolFocus: focus, onResize: resize });
    expect(eventBus.listenerCount("settings/update/success")).toBe(count);
  });

  it("keeps the game and controls, opens and closes, and retains the query", () => {
    const game = element("#app");
    expect(element("aside").hidden).toBe(true);
    toggle().click();
    expect(element("aside").hidden).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(element("#app")).toBe(game);
    choice(PokemonType.WATER).click();
    choice(PokemonType.FLYING).click();
    expect(element('[data-multiplier="4"]').textContent).toContain("Electric");
    element<HTMLButtonElement>(".type-chart-header button").click();
    expect(document.activeElement).toBe(toggle());
    toggle().click();
    expect(choice(PokemonType.WATER).getAttribute("aria-pressed")).toBe("true");
    expect(element("#game-viewport #touchControls")).toBeTruthy();
  });

  it("limits selection to two, supports deselection and clears results", () => {
    toggle().click();
    expect(container.querySelectorAll("[data-type]")).toHaveLength(18);
    expect(element(".type-chart-results").children).toHaveLength(0);
    choice(PokemonType.WATER).click();
    choice(PokemonType.FLYING).click();
    expect(choice(PokemonType.FIRE).getAttribute("aria-disabled")).toBe("true");
    choice(PokemonType.FIRE).click();
    expect(choice(PokemonType.FIRE).getAttribute("aria-pressed")).toBe("false");
    expect(element(".type-chart-hint").textContent).toContain("Deselect");
    choice(PokemonType.FLYING).click();
    expect(choice(PokemonType.FIRE).getAttribute("aria-disabled")).toBe("false");
    choice(PokemonType.FIRE).click();
    expect(choice(PokemonType.FIRE).getAttribute("aria-pressed")).toBe("true");
    element<HTMLButtonElement>(".type-chart-panel > button").click();
    expect(element(".type-chart-results").children).toHaveLength(0);
    expect(element(".type-chart-hint").textContent).toContain("Choose");
    expect(document.activeElement).toBe(choice(PokemonType.NORMAL));
  });

  it("isolates tool keys before game handlers without blocking native button actions", () => {
    const gameKey = vi.fn();
    window.addEventListener("keydown", gameKey);
    toggle().click();
    choice(PokemonType.WATER).focus();
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    choice(PokemonType.WATER).dispatchEvent(space);
    expect(gameKey).not.toHaveBeenCalled();
    expect(space.defaultPrevented).toBe(false);
    const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    choice(PokemonType.WATER).dispatchEvent(escapeEvent);
    expect(element("aside").hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
    expect(escapeEvent.defaultPrevented).toBe(true);
    element("#app").dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(gameKey).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalled();
    window.removeEventListener("keydown", gameKey);
  });

  it("returns keyboard focus when the game canvas is clicked", () => {
    const canvas = document.createElement("canvas");
    element("#app").append(canvas);
    toggle().focus();
    canvas.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.activeElement).toBe(element("#app"));
  });

  it("owns keyboard focus when panel background is touched and preserves editable game inputs", () => {
    toggle().click();
    element("#app").focus();
    element(".type-chart-scope").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.activeElement).toBe(element("aside"));
    const input = document.createElement("input");
    element("#app").append(input);
    input.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.activeElement).toBe(element("aside"));
    // Native pointer focusing remains free to focus the editable element afterward.
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("uses the available width boundary and reports game viewport dimensions", () => {
    const layout = element("#game-layout");
    const viewport = element("#game-viewport");
    vi.spyOn(layout, "getBoundingClientRect").mockReturnValue({ width: 960 } as DOMRect);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ width: 720, height: 500 } as DOMRect);
    panel.refresh();
    expect(layout.dataset.wide).toBe("true");
    expect(resize).toHaveBeenLastCalledWith(720, 500);
    vi.spyOn(layout, "getBoundingClientRect").mockReturnValue({ width: 959 } as DOMRect);
    panel.refresh();
    expect(layout.dataset.wide).toBe("false");
  });

  it("updates Traditional Chinese labels without losing selection", async () => {
    // The test backend supplies English files only; supply the existing translated type name.
    i18next.addResourceBundle("zh-Hant", "pokemonInfo", { type: { water: "水" } }, true, true);
    toggle().click();
    choice(PokemonType.WATER).click();
    await i18next.changeLanguage("zh-Hant");
    expect(toggle().textContent).toBe("屬性相剋");
    expect(choice(PokemonType.WATER).getAttribute("aria-pressed")).toBe("true");
    expect(choice(PokemonType.WATER).textContent).toContain("水");
  });
});
