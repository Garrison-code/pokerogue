/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { globalScene } from "#app/global-scene";
import { ModalUiHandler } from "#ui/modal-ui-handler";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";

/** Explicit opt-in shielding for passive status modals. */
export abstract class PointerModalUiHandler extends ModalUiHandler {
  private displayGeneration = 0;
  private pointerTargets: UiPointerTargets | undefined;
  private backdrop: Phaser.GameObjects.Zone | undefined;

  private stopPointerInput(): void {
    this.displayGeneration++;
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    this.backdrop?.destroy();
    this.backdrop = undefined;
    for (const overlay of [...this.modalContainer.list]) {
      if (overlay.name === "rect-ui-overlay-modal") {
        globalScene.tweens.killTweensOf(overlay);
        overlay.destroy();
      }
    }
  }

  override show(args: any[]): boolean {
    this.stopPointerInput();
    const displayGeneration = this.displayGeneration;
    const fadeOut = args[0]?.fadeOut;
    let completed = false;
    const showArgs =
      typeof fadeOut === "function"
        ? [
            {
              ...args[0],
              fadeOut: () => {
                if (
                  !completed
                  && this.active
                  && this.getUi().getHandler() === this
                  && displayGeneration === this.displayGeneration
                ) {
                  completed = true;
                  fadeOut();
                }
              },
            },
            ...args.slice(1),
          ]
        : args;
    if (!super.show(showArgs)) {
      return false;
    }
    const ui = this.getUi();
    this.backdrop = globalScene.add
      .zone(0, -globalScene.scaledCanvas.height, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height)
      .setOrigin(0)
      .setName("status-backdrop")
      .setInteractive();
    const consume = (...args: unknown[]) => (args.at(-1) as Phaser.Types.Input.EventData).stopPropagation();
    this.backdrop.on("pointerdown", consume).on("wheel", consume);
    ui.add(this.backdrop);
    ui.moveTo(this.backdrop, ui.getIndex(this.modalContainer));
    this.pointerTargets = new UiPointerTargets(this);
    const body = this.pointerTargets.add(this.modalContainer, "status-body", () =>
      this.modalContainer.visible ? { x: 0, y: 0, width: this.modalBg.width, height: this.modalBg.height } : null,
    );
    this.modalContainer.moveTo(body, 1);
    return true;
  }

  override clear(): void {
    this.stopPointerInput();
    super.clear();
  }

  override destroy(): void {
    this.clear();
    this.modalContainer.destroy();
  }
}
