/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { MessageUiHandler } from "#ui/message-ui-handler";
import type { UI } from "#ui/ui";

/** One temporary input surface above the current message, never above another mode. */
export class MessagePointerController {
  readonly zone: Phaser.GameObjects.Zone;

  private readonly ui: UI;

  constructor(ui: UI) {
    this.ui = ui;
    this.zone = globalScene.add.zone(0, 0, 1, 1).setOrigin(0).setName("message-canvas-pointer");
    ui.add(this.zone);
    this.zone.on("pointerdown", this.onPointerDown, this);
    this.zone.on("wheel", (_pointer, _dx, _dy, _dz, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    globalScene.events.on("preupdate", this.update, this);
    this.update();
  }

  private getMessage(): MessageUiHandler | null {
    const session = this.ui.tutorialSession;
    if (session) {
      return session.message;
    }
    const handler = this.ui.getHandler();
    return handler instanceof MessageUiHandler
      && handler.active
      && (handler.hasPointerMessage || handler.tutorialActive || this.ui.mode === UiMode.MESSAGE)
      ? handler
      : null;
  }

  update(): void {
    const message = this.getMessage();
    const visible = !!message || !!this.ui.tutorialSession;
    this.zone.setVisible(visible);
    if (visible) {
      this.zone.setPosition(0, -globalScene.scaledCanvas.height);
      this.zone.setSize(globalScene.scaledCanvas.width, globalScene.scaledCanvas.height).setInteractive();
      this.ui.bringToTop(this.zone);
    } else {
      this.zone.disableInteractive();
    }
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void {
    event.stopPropagation();
    const message = this.getMessage();
    const tutorial = !!this.ui.tutorialSession || !!message?.tutorialActive;
    const allowed = tutorial
      ? this.ui.canProcessTutorialPointerInput()
      : !!message && this.ui.canProcessPointerInput(message);
    if (!message || pointer.wasTouch || !allowed) {
      return;
    }
    if (pointer.rightButtonDown()) {
      this.ui.processInput(Button.CANCEL);
    } else if (pointer.leftButtonDown()) {
      message.processPointerMessage();
    }
    this.update();
  }

  destroy(): void {
    globalScene.events.off("preupdate", this.update, this);
    this.zone.destroy();
  }
}
