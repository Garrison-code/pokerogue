import { Button } from "#enums/buttons";
import { MysteryEncounterOptionMode } from "#enums/mystery-encounter-option-mode";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { MysteryEncounter } from "#mystery-encounters/mystery-encounter";
import { MysteryEncounterOption } from "#mystery-encounters/mystery-encounter-option";
import { MysteryEncounterPhase } from "#phases/mystery-encounter-phases";
import { GameManager } from "#test/framework/game-manager";
import { initSceneWithoutEncounterPhase } from "#test/utils/game-manager-utils";
import type { MysteryEncounterUiHandler } from "#ui/mystery-encounter-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - mystery encounter pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: MysteryEncounterUiHandler;
  let pointer: Phaser.Input.Pointer;
  let encounter: MysteryEncounter;
  const selected = vi.fn(() => false);
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  function populate(count: number) {
    const options = Array.from({ length: count }, (_, i) => {
      const option = new MysteryEncounterOption(null);
      option.optionMode = MysteryEncounterOptionMode.DEFAULT;
      option.dialogue = {
        buttonLabel: `Option ${i}`,
        buttonTooltip: `Tooltip ${i}`,
        disabledButtonTooltip: "Requires item",
      };
      return option;
    });
    encounter.options = options as typeof encounter.options;
  }
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    initSceneWithoutEncounterPhase(game.scene, [SpeciesId.ABRA]);
    encounter = new MysteryEncounter(null);
    encounter.dialogue = { encounterOptionsDialogue: { title: "Test", description: "Description" } };
    populate(2);
    game.scene.currentBattle.mysteryEncounter = encounter;
    const phase = new MysteryEncounterPhase();
    vi.spyOn(phase, "handleOptionSelect").mockImplementation(selected);
    vi.spyOn(game.scene.phaseManager, "getCurrentPhase").mockReturnValue(phase);
    await game.scene.ui.setMode(UiMode.MYSTERY_ENCOUNTER, { slideInDescription: false });
    handler = game.scene.ui.handlers[UiMode.MYSTERY_ENCOUNTER] as MysteryEncounterUiHandler;
    handler.unblockInput();
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    selected.mockReset().mockReturnValue(false);
  });
  function click(index: number | "page" = 0) {
    const target = handler["pointerTargets"]!.zones.find(
      z => z.name === (index === "page" ? "mystery-page" : `mystery-option-${index}`),
    )!;
    const stopPropagation = vi.fn();
    target.emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  it.each([2, 3, 4])("selects and confirms %s-option layouts with stable hit areas", count => {
    populate(count);
    handler.show([{ slideInDescription: false, startingCursorIndex: 0 }]);
    handler.unblockInput();
    click(count - 1);
    expect(handler.getCursor()).toBe(count - 1);
    expect(selected).not.toHaveBeenCalled();
    const zone = handler["pointerTargets"]!.zones.find(z => z.name === "mystery-option-0")!;
    const x = zone.x;
    handler["optionsContainer"].getAt<Phaser.GameObjects.Text>(0).x -= 100;
    handler["pointerTargets"]!.update();
    expect(zone.x).toBe(x);
    click(count - 1);
    expect(selected).toHaveBeenCalledExactlyOnceWith(encounter.options[count - 1], count - 1);
  });
  it("confirms preselection once after acceptance and retries after failure", () => {
    click();
    expect(selected).toHaveBeenCalledOnce();
    selected.mockReturnValue(true);
    click();
    click();
    expect(selected).toHaveBeenCalledTimes(2);
  });
  it.each(Object.values(MysteryEncounterOptionMode).filter(v => typeof v === "number"))(
    "keeps requirement mode %s semantics",
    mode => {
      const option = encounter.options[1];
      option.optionMode = mode;
      vi.spyOn(option, "meetsRequirements").mockReturnValue(false);
      handler.show([{ slideInDescription: false }]);
      handler.unblockInput();
      click(1);
      expect(handler.getCursor()).toBe(1);
      expect(selected).not.toHaveBeenCalled();
      click(1);
      expect(selected).toHaveBeenCalledTimes(
        mode === MysteryEncounterOptionMode.DISABLED_OR_DEFAULT
          || mode === MysteryEncounterOptionMode.DISABLED_OR_SPECIAL
          ? 0
          : 1,
      );
    },
  );
  it("retains entrance lock for options while allowing the original party entry", () => {
    handler["blockInput"] = true;
    click(1);
    expect(handler.getCursor()).toBe(0);
    click(2);
    expect(handler.getCursor()).toBe(2);
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click(2);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("right click delegates CANCEL without selecting or leaving the event", () => {
    pointer.buttons = 2;
    const action = vi.spyOn(game.scene.ui, "processInput");
    click(1);
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.CANCEL);
    expect(handler.getCursor()).toBe(0);
    expect(game.scene.ui.mode).toBe(UiMode.MYSTERY_ENCOUNTER);
    expect(handler.processInput(Button.CANCEL)).toBe(false);
    expect(selected).not.toHaveBeenCalled();
  });
  it.each(["upper", "transition", "touch", "middle"])("blocks %s input", kind => {
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.PARTY]);
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    click(1);
    expect(handler.getCursor()).toBe(0);
  });
  it("ignores wheel and invalidates a previous entrance unlock after reopen", () => {
    const delayed = vi.spyOn(globalThis, "setTimeout");
    handler["blockInput"] = true;
    handler.show([{ slideInDescription: false }]);
    const unlock = delayed.mock.calls.find(call => call[1] === 1000)![0] as () => void;
    handler.show([{ slideInDescription: false }]);
    unlock();
    expect(handler["blockInput"]).toBe(true);
    const target = handler["pointerTargets"]!.zones[0]!;
    target.emit("wheel", pointer, 0, 999, 0, { stopPropagation: vi.fn() });
    expect(handler.getCursor()).toBe(0);
    expect(selected).not.toHaveBeenCalled();
  });
  it("cleans targets, masks, hover and old unlock timers on reopen", () => {
    const targets = handler["pointerTargets"]!;
    const id = handler["displayId"];
    handler.show([{ slideInDescription: false }]);
    expect(targets.zones).toHaveLength(0);
    expect(handler["displayId"]).toBeGreaterThan(id);
    expect(handler["textMasks"]).toHaveLength(3);
    handler["onDexPointer"](pointer, 0, 0, { stopPropagation: vi.fn() } as Phaser.Types.Input.EventData);
    handler.destroy();
    expect(handler["displayTimers"]).toHaveLength(0);
    expect(handler["textMasks"]).toHaveLength(0);
    expect(handler["pointerTargets"]).toBeUndefined();
  });
});
