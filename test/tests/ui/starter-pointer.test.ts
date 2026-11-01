import { getGameMode } from "#app/game-mode";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { GameModes } from "#enums/game-modes";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { StarterContainer } from "#ui/starter-container";
import type { StarterSelectUiHandler } from "#ui/starter-select-ui-handler";
import Phaser from "phaser";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - starter selection with a mouse", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: StarterSelectUiHandler;
  let pointer: Phaser.Input.Pointer;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    await game.runToTitle();
    game.scene.gameMode = getGameMode(GameModes.CLASSIC);
    handler = game.scene.ui.handlers[UiMode.STARTER_SELECT] as StarterSelectUiHandler;
    // MockText.setVisible is a no-op; retain visibility for hit-target assertions.
    for (const { label } of handler["instructionsContainer"].getPointerTargets()) {
      vi.spyOn(label, "setVisible").mockImplementation(function (this: Phaser.GameObjects.Text, visible) {
        this.visible = visible;
        return this;
      });
    }
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
    // Headless sprite mocks lack Container lifecycle methods; keep only their rendering unchanged.
    vi.spyOn(StarterContainer.prototype, "setSpecies").mockImplementation(function (this: StarterContainer, id) {
      this.species = speciesDataRegistry.getSpecies(id);
    });
    await game.scene.ui.setMode(UiMode.STARTER_SELECT, vi.fn());
    handler.tutorialActive = false;
    handler["filteredStarterIds"] = speciesDataRegistry.getAllStarters();
    handler["scrollCursor"] = 0;
    handler["updateScroll"]();
    handler.setCursor(0);
    sync();
  });
  function sync() {
    game.scene.events.emit(Phaser.Scenes.Events.PRE_UPDATE);
  }
  function zone(index: number) {
    return handler["pointerZones"][index];
  }
  function row(index = 0) {
    return zone(index + 2);
  }
  function click(target = row()) {
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    sync();
  }
  function wheel(dy: number, target = row()) {
    const stopPropagation = vi.fn();
    target.emit("wheel", pointer, 0, dy, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    sync();
  }
  function filter(index = 0) {
    return handler["filterBar"].getPointerTargets()[index];
  }
  function targetZones(parent: Phaser.GameObjects.Container) {
    return handler["pointerZones"].filter(z => z.parentContainer === parent);
  }
  function label(index = 0) {
    return targetZones(handler["filterBar"])[index];
  }
  function option(index = 0, col = 0) {
    return targetZones(filter(col).dropDown)[index + 1];
  }

  it("selects a different species, then opens its existing menu once", () => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    click(row(1));
    expect(handler["lastStarterId"]).toBe(handler["filteredStarterIds"][1]);
    expect(action).not.toHaveBeenCalled();
    click(row(1));
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("confirms the initially selected species through ACTION", () => {
    const action = vi.spyOn(game.scene.ui, "processInput");
    click();
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("scrolls one row without changing the selected species or confirming a replacement", () => {
    const id = handler["lastStarterId"];
    const action = vi.spyOn(game.scene.ui, "processInput");
    wheel(300);
    expect(handler["scrollCursor"]).toBe(1);
    expect(handler["lastStarterId"]).toBe(id);
    expect(handler.cursorObj.visible).toBe(false);
    click();
    expect(handler["lastStarterId"]).toBe(handler["filteredStarterIds"][9]);
    expect(action).not.toHaveBeenCalled();
  });
  it("restores the remembered cursor when scrolling back, and stops at both boundaries", () => {
    wheel(-1);
    expect(handler["scrollCursor"]).toBe(0);
    wheel(1);
    wheel(-1);
    expect(handler.cursorObj.visible).toBe(true);
    const max = Math.max(0, Math.ceil(handler["filteredStarterIds"].length / 9) - 9);
    for (let i = 0; i < max + 2; i++) {
      wheel(1);
    }
    expect(handler["scrollCursor"]).toBe(max);
  });
  it("does not use horizontal wheel, hover, middle buttons or touch", () => {
    const id = handler["lastStarterId"];
    row(1).emit("pointerover", pointer);
    wheel(0);
    pointer.buttons = 4;
    click(row(1));
    pointer.buttons = 1;
    pointer.wasTouch = true;
    click(row(1));
    wheel(1);
    expect(handler["lastStarterId"]).toBe(id);
    expect(handler["scrollCursor"]).toBe(0);
  });
  it.each(["tutorial", "transition", "upper", "blocked"])("blocks background left input during %s", state => {
    const id = handler["lastStarterId"];
    if (state === "tutorial") {
      handler.tutorialActive = true;
    }
    if (state === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (state === "upper") {
      game.scene.ui["_mode"] = UiMode.CONFIRM;
    }
    if (state === "blocked") {
      handler["blockInput"] = true;
    }
    click(row(1));
    wheel(1);
    expect(handler["lastStarterId"]).toBe(id);
    expect(handler["scrollCursor"]).toBe(0);
  });
  it("opens, switches and closes filter labels without activating the background", () => {
    click(label());
    expect(handler["filterBar"].openDropDown).toBe(true);
    click(label(1));
    expect(handler["filterBarCursor"]).toBe(1);
    expect(filter(1).dropDown.visible).toBe(true);
    const id = handler["lastStarterId"];
    click(row(1));
    expect(handler["filterBar"].openDropDown).toBe(false);
    expect(handler["lastStarterId"]).toBe(id);
    expect(handler["filterMode"]).toBe(true);
  });
  it("selects a dropdown option first and toggles it only on the next click", () => {
    click(label(1));
    const dd = filter(1).dropDown;
    const toggle = vi.spyOn(dd, "toggleOptionState");
    click(option(1, 1));
    expect(dd.cursor).toBe(1);
    expect(toggle).not.toHaveBeenCalled();
    click(option(1, 1));
    expect(toggle).toHaveBeenCalledOnce();
  });
  it("routes dropdown wheel only to that dropdown, clamps it and preserves HYBRID changes", () => {
    click(label());
    const dd = filter().dropDown;
    wheel(1, option());
    expect(dd.cursor).toBe(1);
    wheel(1, row());
    expect(handler["scrollCursor"]).toBe(0);
    for (let i = 0; i < 30; i++) {
      wheel(-1, targetZones(dd)[0]);
    }
    expect(dd.cursor).toBe(0);
    for (let i = 0; i < 30; i++) {
      wheel(1, targetZones(dd)[0]);
    }
    expect(dd.cursor).toBe(dd.options.length - 1);
  });
  it("clears a filtered-out grid identity and requires selection after returning", () => {
    const old = handler["pointerGridId"];
    handler["filteredStarterIds"] = handler["filteredStarterIds"].filter(id => id !== old);
    handler["updateScroll"]();
    handler["restorePointerGridSelection"]();
    expect(handler["pointerGridId"]).toBeNull();
    const action = vi.spyOn(game.scene.ui, "processInput");
    click();
    expect(action).not.toHaveBeenCalled();
    expect(handler["pointerGridId"]).not.toBe(old);
  });
  it.each([89, 90])("selects button %i before sending ACTION, including keyboard-preselected controls", index => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(zone(index));
    expect(input).not.toHaveBeenCalled();
    click(zone(index));
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    input.mockClear();
    click(zone(index));
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("does not confirm the same species when returning from another region", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(zone(90));
    click();
    expect(input).not.toHaveBeenCalled();
    expect(handler["gridHasFocus"]()).toBe(true);
  });
  it("ignores empty party positions", () => {
    const input = vi.spyOn(game.scene.ui, "processInput");
    click(zone(83));
    expect(handler["partyCursorObj"].visible).toBe(false);
    expect(input).not.toHaveBeenCalled();
  });
  it("selects an existing team member before opening its menu", () => {
    const id = handler["filteredStarterIds"][0];
    handler.partyStarterIds.push(id);
    const display = vi.spyOn(handler as any, "setPartyStarter").mockImplementation(() => {});
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(zone(83));
    expect(display).toHaveBeenCalledWith(id);
    expect(input).not.toHaveBeenCalled();
    click(zone(83));
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    handler.partyStarterIds.length = 0;
  });
  it("only activates visible instruction controls through their existing buttons", () => {
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    const instructions = handler["instructionsContainer"].getPointerTargets();
    instructions[0].icon.setVisible(true);
    instructions[0].label.setVisible(true);
    sync();
    click(zone(91));
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CYCLE_SHINY);
    input.mockClear();
    instructions[0].icon.setVisible(false);
    sync();
    click(zone(91));
    expect(input).not.toHaveBeenCalled();
  });
  it("forwards right click before applying left-click input locks or changing focus", () => {
    handler["blockInput"] = true;
    pointer.buttons = 2;
    const input = vi.spyOn(game.scene.ui, "processInput");
    const id = handler["lastStarterId"];
    click(row(1));
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler["lastStarterId"]).toBe(id);
  });
  it("right click closes the active dropdown via existing CANCEL", () => {
    click(label());
    pointer.buttons = 2;
    const input = vi.spyOn(game.scene.ui, "processInput");
    click(option());
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler["filterBar"].openDropDown).toBe(false);
  });
  it("cleans zones and frame listeners on clear and rebuilds without duplicate input", async () => {
    const old = [...handler["pointerZones"]];
    handler.clear();
    expect(handler["pointerZones"]).toHaveLength(0);
    expect(old.every(z => z.listenerCount("pointerdown") === 0)).toBe(true);
    await game.scene.ui.setMode(UiMode.TITLE);
    await game.scene.ui.setMode(UiMode.STARTER_SELECT, vi.fn());
    handler.tutorialActive = false;
    const input = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click();
    expect(input).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it.each([0, 1, 2, 3, 4, 5])("keeps dropdown %i state transitions behind the existing ACTION", column => {
    click(label(column));
    const dd = filter(column).dropDown;
    const toggle = vi.spyOn(dd, "toggleOptionState");
    click(option(dd.cursor, column));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it.each(["ivs", "party", "exit", "filter-reset"])(
    "matches keyboard CANCEL for %s without selecting the clicked species",
    state => {
      const pop = vi.spyOn(handler as any, "popPartyStarter").mockImplementation(() => {});
      const exit = vi.spyOn(handler as any, "tryExit").mockImplementation(() => {});
      const ivs = vi.spyOn(handler as any, "toggleShowIvsMode").mockImplementation(() => {});
      const reset = vi.spyOn(handler["filterBar"], "resetSelection");
      const prepare = () => {
        handler["showIvsMode"] = state === "ivs";
        handler.partyStarterIds = state === "party" ? [handler["filteredStarterIds"][0]] : [];
        if (state === "filter-reset") {
          click(label(1));
          filter(1).dropDown.options[1].toggleOptionState();
          handler["filterBar"].hideDropDowns();
        }
      };
      prepare();
      game.scene.ui.processInput(Button.CANCEL);
      const keyboard = [pop.mock.calls.length, exit.mock.calls.length, ivs.mock.calls.length, reset.mock.calls.length];
      pop.mockClear();
      exit.mockClear();
      ivs.mockClear();
      reset.mockClear();
      prepare();
      pointer.buttons = 2;
      click(row(1));
      expect([pop.mock.calls.length, exit.mock.calls.length, ivs.mock.calls.length, reset.mock.calls.length]).toEqual(
        keyboard,
      );
      handler.partyStarterIds = [];
      handler["showIvsMode"] = false;
    },
  );

  it("blocks duplicate random requests, adds through the existing flow and handles failures", async () => {
    const id = handler["filteredStarterIds"][0];
    handler["filteredStarterIds"] = [id];
    vi.spyOn(handler as any, "setStarter").mockImplementation(() => {});
    const form = speciesDataRegistry.getPokemonSpeciesForm(id, 0);
    let resolve!: () => void;
    const load = vi.spyOn(form, "loadAssets").mockImplementation(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
    );
    const add = vi.spyOn(handler as any, "addToParty").mockImplementation(() => {});
    click(zone(89));
    click(zone(89));
    click(zone(89));
    expect(load).toHaveBeenCalledOnce();
    expect(handler["blockInput"]).toBe(true);
    resolve();
    await vi.waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(handler["blockInput"]).toBe(false);
    load.mockRejectedValueOnce(new Error("fixture asset failure"));
    const error = vi.spyOn(game.scene.ui, "playError");
    click(zone(89));
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(handler["blockInput"]).toBe(false);
  });

  it("ignores a random result after clear, including the next page's input lock", async () => {
    const id = handler["filteredStarterIds"][0];
    handler["filteredStarterIds"] = [id];
    vi.spyOn(handler as any, "setStarter").mockImplementation(() => {});
    let resolve!: () => void;
    vi.spyOn(speciesDataRegistry.getPokemonSpeciesForm(id, 0), "loadAssets").mockImplementation(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
    );
    const add = vi.spyOn(handler as any, "addToParty").mockImplementation(() => {});
    click(zone(89));
    click(zone(89));
    handler.clear();
    handler["blockInput"] = true;
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(add).not.toHaveBeenCalled();
    expect(handler["blockInput"]).toBe(true);
  });

  it("ignores stale summary sprites after a newer request or clear", async () => {
    const summary = handler["starterSummary"];
    const species = speciesDataRegistry.getSpecies(handler["filteredStarterIds"][0]);
    const resolvers: (() => void)[] = [];
    vi.spyOn(species, "loadAssets").mockImplementation(() => new Promise<void>(r => resolvers.push(r)));
    const play = vi.spyOn(summary["pokemonSprite"], "play");
    summary["updateSprite"](species, false, 0, false, 0);
    summary["updateSprite"](species, false, 0, false, 0);
    resolvers[0]();
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
    summary.clear();
    resolvers[1]();
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
  });

  it("preserves empty-party start errors and rejects random selection without eligible species", () => {
    const error = vi.spyOn(game.scene.ui, "playError");
    click(zone(90));
    click(zone(90));
    expect(error).toHaveBeenCalledOnce();
    handler["filteredStarterIds"] = [];
    click(zone(89));
    click(zone(89));
    expect(error).toHaveBeenCalledTimes(2);
    expect(handler["blockInput"]).toBe(false);
  });
  it("rejects random selection at the six-member limit", () => {
    handler.partyStarterIds = new Array(6).fill(handler["filteredStarterIds"][0]);
    const error = vi.spyOn(game.scene.ui, "playError");
    click(zone(89));
    click(zone(89));
    expect(error).toHaveBeenCalledOnce();
    expect(handler["blockInput"]).toBe(false);
    handler.partyStarterIds = [];
  });

  it("keeps invalid challenge teams in the existing message flow", () => {
    handler.partyStarterIds = [handler["filteredStarterIds"][0]];
    vi.spyOn(handler as any, "isPartyValid").mockReturnValue(false);
    click(zone(90));
    click(zone(90));
    expect(game.scene.ui.mode).toBe(UiMode.STARTER_SELECT);
    expect(handler.tutorialActive).toBe(true);
    expect(handler["blockInput"]).toBe(false);
    handler.partyStarterIds = [];
  });

  it("keeps start confirmation, its cancellation, and one-time callback", () => {
    handler.partyStarterIds = [handler["filteredStarterIds"][0]];
    vi.spyOn(handler as any, "isPartyValid").mockReturnValue(true);
    vi.spyOn(game.scene.ui, "showText").mockImplementation((_text, _delay, callback) => {
      callback?.();
    });
    const start = vi.fn();
    handler["starterSelectCallback"] = start;
    click(zone(90));
    click(zone(90));
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    game.scene.ui.processInput(Button.CANCEL);
    expect(start).not.toHaveBeenCalled();
    expect(game.scene.ui.mode).toBe(UiMode.STARTER_SELECT);
    click(zone(90));
    expect(game.scene.ui.mode).toBe(UiMode.CONFIRM);
    game.scene.ui.processInput(Button.ACTION);
    expect(start).toHaveBeenCalledOnce();
    handler.partyStarterIds = [];
  });
  it("reveals the remembered species before keyboard confirmation after scrolling", () => {
    const id = handler["pointerGridId"];
    wheel(1);
    expect(handler.cursorObj.visible).toBe(false);
    game.scene.ui.processInput(Button.ACTION);
    expect(handler["scrollCursor"]).toBe(0);
    expect(handler["starterContainers"][handler.getCursor()].species.speciesId).toBe(id);
    expect(handler.cursorObj.visible).toBe(true);
  });
  it("shows the existing clickable instructions before any keyboard or gamepad input", () => {
    game.scene.inputMethod = undefined!;
    handler["instructionsContainer"].updateInstructions(
      { shiny: true, form: true, ability: true, gender: true, nature: true, tera: true },
      true,
      false,
    );
    expect(
      handler["instructionsContainer"]
        .getPointerTargets()
        .map(({ button, icon, label }) => [button, icon.visible, label.visible]),
    ).toEqual([9, 10, 11, 12, 13, 14, 8].map(button => [button, true, true]));
  });
});
