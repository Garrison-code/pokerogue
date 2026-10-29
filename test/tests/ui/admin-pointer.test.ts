/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { pokerogueApi } from "#api/api";
import * as appConstants from "#constants/app-constants";
import { AdminMode } from "#enums/admin-mode";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { SearchAccountResponse } from "#types/api";
import type { AdminUiHandler } from "#ui/admin-ui-handler";
import { UiHandler } from "#ui/ui-handler";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("UI - admin form pointer input", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  let handler: AdminUiHandler;
  let pointer: Phaser.Input.Pointer;
  const done = vi.fn();
  const cancel = vi.fn();
  const result: SearchAccountResponse = {
    registered: "2026",
    googleId: "",
    lastLoggedIn: "2025",
    username: "Fixture",
    discordId: "123",
  };
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });
  beforeEach(async () => {
    vi.spyOn(UiHandler.prototype as any, "setMouseCursorStyle").mockImplementation(() => {});
    game = new GameManager(phaserGame);
    await game.runToTitle();
    vi.spyOn(appConstants, "bypassLogin", "get").mockReturnValue(false);
    vi.spyOn(pokerogueApi.admin, "searchAccount").mockResolvedValue([result, undefined]);
    vi.spyOn(pokerogueApi.admin, "linkUnlinkRequest").mockResolvedValue(null);
    await game.scene.ui.setOverlayMode(UiMode.ADMIN, { buttonActions: [done, cancel] }, AdminMode.SEARCH, result);
    handler = game.scene.ui.getHandler() as AdminUiHandler;
    pointer = new Phaser.Input.Pointer(game.scene.input.manager, 0);
    pointer.buttons = 1;
  });
  afterEach(() => {
    handler.clear();
    game.scene.ui["overlayActive"] = false;
    game.scene.ui["_mode"] = UiMode.COMMAND;
    done.mockReset();
    cancel.mockReset();
  });
  function click(index = 0) {
    handler["onButtonPointer"](index, pointer, { stopPropagation: vi.fn() } as unknown as Phaser.Types.Input.EventData);
  }
  function show(mode: AdminMode, actions: (() => void)[] = [done, cancel]) {
    handler.clear();
    handler.show([{ buttonActions: actions }, mode, result]);
  }
  function service(key: string) {
    const icon = handler["modalContainer"].list.find(o => o.name === `adminBtn_${key}`)!;
    icon?.emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
  }
  it("searches once and enters the returned account", async () => {
    click();
    click();
    game.scene.ui.processInput(Button.SUBMIT);
    await vi.waitFor(() => expect(handler["adminMode"]).toBe(AdminMode.ADMIN));
    expect(pokerogueApi.admin.searchAccount).toHaveBeenCalledExactlyOnceWith({ username: "Fixture" });
    expect(handler["inputs"].map(i => i.text)).toEqual(["Fixture", "123", "", "2025", "2026"]);
  });
  it.each(["button", "body", "input", "keyboard"])("shares original cancellation from %s", source => {
    if (source === "button") {
      click(1);
    }
    if (source === "body") {
      pointer.buttons = 2;
      handler["pointerTargets"]!.zones[0].emit("pointerdown", pointer, 0, 0, { stopPropagation: vi.fn() });
    }
    if (source === "input") {
      handler["inputs"][0].node.dispatchEvent(new MouseEvent("pointerdown", { button: 2 }));
    }
    if (source === "keyboard") {
      game.scene.ui.processInput(Button.CANCEL);
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(pokerogueApi.admin.searchAccount).not.toHaveBeenCalled();
  });
  it("keeps LINK fields and API service mapping", async () => {
    show(AdminMode.LINK);
    click();
    await vi.waitFor(() => expect(pokerogueApi.admin.linkUnlinkRequest).toHaveBeenCalledOnce());
    expect(pokerogueApi.admin.linkUnlinkRequest).toHaveBeenCalledWith(
      "Link",
      "discord",
      expect.objectContaining({ username: "Fixture", discordId: "123" }),
    );
    await vi.waitFor(() => expect(handler["errorMessage"].text).toContain("successfully"));
  });
  it.each(["discordId", "googleId"])("uses %s icon once and refreshes the same account", async key => {
    show(AdminMode.ADMIN);
    if (key === "googleId") {
      handler["inputs"][2].text = "456";
    }
    service(key);
    service(key);
    await vi.waitFor(() => expect(pokerogueApi.admin.searchAccount).toHaveBeenCalledOnce());
    expect(pokerogueApi.admin.linkUnlinkRequest).toHaveBeenCalledExactlyOnceWith(
      key === "discordId" ? "Unlink" : "Link",
      key === "discordId" ? "discord" : "google",
      expect.objectContaining({ username: "Fixture" }),
    );
  });
  it("does not modify a service from right click", () => {
    show(AdminMode.ADMIN);
    pointer.buttons = 2;
    service("discordId");
    expect(cancel).toHaveBeenCalledOnce();
    expect(pokerogueApi.admin.linkUnlinkRequest).not.toHaveBeenCalled();
  });
  it("validates a missing service id before requests", async () => {
    show(AdminMode.ADMIN);
    service("googleId");
    await vi.waitFor(() => expect(handler["errorMessage"].text).toContain("required"));
    expect(pokerogueApi.admin.linkUnlinkRequest).not.toHaveBeenCalled();
  });
  it.each(["touch", "middle", "upper", "transition", "tween"])("blocks %s", kind => {
    if (kind === "touch") {
      pointer.wasTouch = true;
    }
    if (kind === "middle") {
      pointer.buttons = 4;
    }
    if (kind === "transition") {
      game.scene.ui["overlayActive"] = true;
    }
    if (kind === "upper") {
      vi.spyOn(game.scene.ui, "getHandler").mockReturnValue(game.scene.ui.handlers[UiMode.CONFIRM]);
    }
    if (kind === "tween") {
      vi.spyOn(game.scene.tweens, "getTweensOf").mockReturnValue([{} as Phaser.Tweens.Tween]);
    }
    click();
    expect(pokerogueApi.admin.searchAccount).not.toHaveBeenCalled();
  });
  it("keeps hidden information buttons inert", () => {
    click(2);
    click(3);
    expect(pokerogueApi.admin.searchAccount).not.toHaveBeenCalled();
    expect(handler.active).toBe(true);
  });
  it("allows information entry again after unhide", () => {
    const stats = vi.fn(() => handler.hide());
    const dex = vi.fn(() => handler.hide());
    show(AdminMode.ADMIN, [done, cancel, stats, dex]);
    click(2);
    click(2);
    expect(stats).toHaveBeenCalledOnce();
    handler.unhide();
    click(3);
    expect(dex).toHaveBeenCalledOnce();
  });
  it("keeps a failed information entry available", () => {
    const failure = vi.fn();
    show(AdminMode.ADMIN, [done, cancel, failure, failure]);
    click(2);
    click(2);
    expect(failure).toHaveBeenCalledTimes(2);
  });
  it("does not reopen from an obsolete search result", async () => {
    let resolve!: (value: [SearchAccountResponse, undefined]) => void;
    vi.mocked(pokerogueApi.admin.searchAccount).mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );
    click();
    await vi.waitFor(() => expect(pokerogueApi.admin.searchAccount).toHaveBeenCalledOnce());
    await game.scene.ui.setMode(UiMode.MESSAGE);
    resolve([result, undefined]);
    await new Promise(r => setTimeout(r, 0));
    expect(game.scene.ui.mode).toBe(UiMode.MESSAGE);
    expect(handler["tempGameData"]).toBeNull();
  });
  it("does not refresh after an obsolete link result", async () => {
    let resolve!: (value: string | null) => void;
    vi.mocked(pokerogueApi.admin.linkUnlinkRequest).mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );
    show(AdminMode.ADMIN);
    service("discordId");
    await vi.waitFor(() => expect(pokerogueApi.admin.linkUnlinkRequest).toHaveBeenCalledOnce());
    await game.scene.ui.setMode(UiMode.MESSAGE);
    resolve(null);
    await new Promise(r => setTimeout(r, 0));
    expect(pokerogueApi.admin.searchAccount).not.toHaveBeenCalled();
  });
  it("retries a failed search and reports thrown requests", async () => {
    vi.mocked(pokerogueApi.admin.searchAccount).mockRejectedValueOnce(new Error("offline"));
    click();
    await vi.waitFor(() => expect(handler["errorMessage"].text).toContain("offline"));
    click();
    await vi.waitFor(() => expect(handler["adminMode"]).toBe(AdminMode.ADMIN));
  });
  it("destroys old dynamic fields and service listeners on reopen", () => {
    show(AdminMode.ADMIN);
    const nodes = handler["inputs"].map(i => i.node);
    const icons = handler["modalContainer"].list.filter(o => o.name?.startsWith("adminBtn_"));
    show(AdminMode.SEARCH);
    for (const node of nodes) {
      node.dispatchEvent(new MouseEvent("pointerdown", { button: 2 }));
    }
    expect(cancel).not.toHaveBeenCalled();
    expect(handler["inputs"]).toHaveLength(1);
    for (const icon of icons) {
      expect(icon.listenerCount("pointerdown")).toBe(0);
    }
  });
});
