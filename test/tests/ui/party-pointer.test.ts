import { Button } from "#enums/buttons";
import { LearnableMoveSource } from "#enums/learnable-move-source";
import { MoveId } from "#enums/move-id";
import { PartyUiMode } from "#enums/party-ui-mode";
import { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { PartyOption, type PartyUiHandler } from "#ui/party-ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - party pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: PartyUiHandler;
  let pointer: Phaser.Input.Pointer;
  let callback: ReturnType<typeof vi.fn>;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    game = new GameManager(phaserGame);
    game.override
      .enemySpecies(SpeciesId.MAGIKARP)
      .battleStyle("single")
      .moveset([MoveId.TACKLE, MoveId.GROWL])
      .startingHeldItems([{ name: "LEFTOVERS", count: 3 }]);
    await game.classicMode.startBattle(SpeciesId.BULBASAUR, SpeciesId.CHARMANDER, SpeciesId.SQUIRTLE);
    callback = vi.fn();
    await game.scene.ui.setMode(UiMode.PARTY, PartyUiMode.CHECK, 0, callback);
    handler = game.scene.ui.handlers[UiMode.PARTY] as PartyUiHandler;
    handler.tutorialActive = false;
    game.scene.ui["overlayActive"] = false;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler?.clear();
    game.scene.ui["_mode"] = UiMode.COMMAND;
  });
  function zone(name: string) {
    return [...handler["pointerTargets"]!.zones, ...(handler["optionPointerTargets"]?.zones ?? [])].find(
      z => z.name === name,
    )!;
  }
  function click(name: string) {
    const stopPropagation = vi.fn();
    zone(name).emit("pointerdown", pointer, 0, 0, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  }
  function wheel(name: string, dy: number) {
    zone(name).emit("wheel", pointer, 0, dy, 0, { stopPropagation: vi.fn() });
  }
  it.each(Object.values(PartyUiMode))("selects a card without confirming in mode %s", mode => {
    handler["partyUiMode"] = mode;
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("party-slot-1");
    expect(handler.getCursor()).toBe(1);
    expect(action).not.toHaveBeenCalled();
    click("party-slot-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
  });
  it("opens the preselected card's menu and separates menu selection and confirmation", () => {
    click("party-slot-0");
    expect(handler["optionsMode"]).toBe(true);
    const action = vi.spyOn(game.scene.ui, "processInput").mockReturnValue(true);
    click("party-option-1");
    expect(handler["optionsCursor"]).toBe(1);
    expect(action).not.toHaveBeenCalled();
    click("party-option-1");
    expect(action).toHaveBeenCalledExactlyOnceWith(Button.ACTION);
    click("party-slot-2");
    expect(handler.getCursor()).toBe(0);
  });
  it("scrolls cards without wrapping or selecting buttons", () => {
    wheel("party-slot-0", -120);
    expect(handler.getCursor()).toBe(0);
    for (let i = 0; i < 5; i++) {
      wheel("party-slot-0", 120);
    }
    expect(handler.getCursor()).toBe(2);
    wheel("party-slot-0", -120);
    expect(handler.getCursor()).toBe(1);
  });
  it.each([PartyUiMode.FAINT_SWITCH, PartyUiMode.REVIVAL_BLESSING])("right cancel retains forced mode %s", mode => {
    handler["partyUiMode"] = mode;
    pointer.buttons = 2;
    click("party-page");
    expect(callback).not.toHaveBeenCalled();
    expect(handler.active).toBe(true);
  });
  it("right click closes a menu before returning and preserves callback arguments", () => {
    click("party-slot-0");
    pointer.buttons = 2;
    click("party-option-1");
    expect(handler["optionsMode"]).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    click("party-page");
    expect(callback).toHaveBeenCalledExactlyOnceWith(6, PartyOption.CANCEL);
  });
  it("routes waiting messages through ACTION or CANCEL without selecting a card", () => {
    const completed = vi.fn();
    handler["awaitingActionInput"] = true;
    handler["onActionInput"] = completed;
    click("party-slot-1");
    expect(handler.getCursor()).toBe(0);
    expect(completed).not.toHaveBeenCalled();
    click("party-message");
    expect(completed).toHaveBeenCalledOnce();
  });
  it.each(["prompt", "blocked", "transition", "tutorial", "touch", "upper"])("blocks %s input", kind => {
    if (kind === "prompt") {
      handler["pendingPrompt"] = true;
    }
    if (kind === "blocked") {
      handler["blockInput"] = true;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "tutorial") {
      handler.tutorialActive = true;
    }
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    click("party-slot-1");
    wheel("party-slot-0", 120);
    expect(handler.getCursor()).toBe(0);
  });
  it("adjusts item quantities with arrows, keeps keyboard wrapping and resets quantities when leaving a transfer row", () => {
    handler["partyUiMode"] = PartyUiMode.MODIFIER_TRANSFER;
    click("party-slot-0");
    expect(handler["transferQuantities"][0]).toBe(3);
    click("party-quantity-0--1");
    expect(handler["transferQuantities"][0]).toBe(2);
    click("party-quantity-0-1");
    click("party-quantity-0-1");
    expect(handler["transferQuantities"][0]).toBe(1);
    click("party-option-1");
    expect(handler["transferQuantities"][0]).toBe(3);
    expect(callback).not.toHaveBeenCalled();
  });
  it("scrolls a long move menu by real option identity and stops at cancel", () => {
    handler["partyUiMode"] = PartyUiMode.REMEMBER_MOVE_MODIFIER;
    vi.spyOn(game.scene.getPlayerParty()[0], "getLearnableLevelMoves").mockReturnValue(
      Array.from({ length: 20 }, () => [1, MoveId.TACKLE, LearnableMoveSource.LEVEL]),
    );
    click("party-slot-0");
    for (let i = 1; i < 20; i++) {
      wheel("party-options", 120);
      expect(handler["options"][handler["optionsCursor"]]).toBe(i);
    }
    wheel("party-options", 120);
    expect(handler["options"][handler["optionsCursor"]]).toBe(PartyOption.CANCEL);
    wheel("party-options", 120);
    expect(handler["options"][handler["optionsCursor"]]).toBe(PartyOption.CANCEL);
    wheel("party-options", -120);
    expect(handler["options"][handler["optionsCursor"]]).toBe(19);
    expect(callback).not.toHaveBeenCalled();
  });
  it("resets the original item quantity when scrolling changes the visible option indexes", () => {
    const original = game.scene.modifiers.find(m => m.is("PokemonHeldItemModifier"))!;
    const items = Array.from({ length: 20 }, () => original.clone());
    vi.spyOn(game.scene, "findModifiers").mockReturnValue(items);
    handler["partyUiMode"] = PartyUiMode.MODIFIER_TRANSFER;
    click("party-slot-0");
    for (let i = 0; i < 7; i++) {
      wheel("party-options", 120);
    }
    const selected = handler["options"][handler["optionsCursor"]];
    expect(selected).toBe(7);
    click(`party-quantity-${handler["optionsCursor"]}--1`);
    expect(handler["transferQuantities"][7]).toBe(2);
    wheel("party-options", 120);
    expect(handler["transferQuantities"][7]).toBe(3);
    expect(handler["options"][handler["optionsCursor"]]).toBe(8);
  });
  it("cleans page and option regions on clear and reopen", () => {
    click("party-slot-0");
    const targets = handler["optionPointerTargets"]!;
    handler.clearOptions();
    expect(targets.zones).toHaveLength(0);
    const pageTargets = handler["pointerTargets"]!;
    handler.clear();
    expect(pageTargets.zones).toHaveLength(0);
    handler.show([PartyUiMode.CHECK, 0, callback]);
    expect(handler["pointerTargets"]!.zones).toHaveLength(7);
    handler.destroy();
    expect(handler["optionPointerTargets"]).toBeNull();
  });
});
