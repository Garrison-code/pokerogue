/*
 * SPDX-FileCopyrightText: 2026 Garrison-code
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import { FormModalUiHandler } from "#ui/form-modal-ui-handler";
import type { LoadingModalUiHandler } from "#ui/loading-modal-ui-handler";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";

/** Explicit opt-in mouse/DOM lifecycle for player text forms. */
export abstract class PointerFormModalUiHandler extends FormModalUiHandler {
  private pointerTargets: UiPointerTargets | undefined;
  private backdrop: Phaser.GameObjects.Zone | undefined;
  private domCleanups: (() => void)[] = [];
  private handled = false;
  private operationId = 0;

  /** Keep the submitted work alive across its own clear-to-LOADING, but never another display. */
  protected async beginLoadingOperation(): Promise<() => boolean> {
    const operationId = ++this.operationId;
    const scene = globalScene;
    const ui = this.getUi();
    await ui.setMode(UiMode.LOADING, { buttonActions: [] });
    const loading = ui.handlers[UiMode.LOADING] as LoadingModalUiHandler;
    const displayId = loading.displayId;
    return () =>
      globalScene === scene
      && operationId === this.operationId
      && loading.active
      && ui.getHandler() === loading
      && displayId === loading.displayId;
  }

  protected get pointerFormEnabled(): boolean {
    return true;
  }

  protected processFormButton(index: number): void {
    this.getUi().processInput(index === 0 ? Button.SUBMIT : Button.CANCEL);
  }

  protected releaseFormInput(): void {
    this.handled = false;
  }

  protected invokeFormAction(action: (() => void) | undefined, submitting = false): boolean {
    if (
      !action
      || !this.getUi().canProcessPointerInput(this)
      || !this.modalContainer.visible
      || this.handled
      || globalScene.tweens.getTweensOf(this.modalContainer).length > 0
      || (submitting && this.composing)
    ) {
      return false;
    }
    this.handled = true;
    action();
    return true;
  }
  protected composing = false;

  private onButtonPointer(index: number, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    event.stopPropagation();
    if (pointer.wasTouch || !this.getUi().canProcessPointerInput(this)) {
      return;
    }
    if (pointer.rightButtonDown()) {
      this.getUi().processInput(Button.CANCEL);
    } else if (pointer.leftButtonDown()) {
      this.processFormButton(index);
    }
  }

  private bindInputEvents(): void {
    for (const input of this.inputs) {
      const node = input.node;
      if (!(node instanceof HTMLInputElement)) {
        continue;
      }
      const listen = <K extends keyof HTMLElementEventMap>(
        name: K,
        callback: (event: HTMLElementEventMap[K]) => void,
      ) => {
        node.addEventListener(name, callback);
        this.domCleanups.push(() => node.removeEventListener(name, callback));
      };
      listen("pointerdown", event => {
        event.stopPropagation();
        if (event.pointerType && event.pointerType !== "mouse") {
          return;
        }
        if (event.button === 2) {
          event.preventDefault();
          if (this.getUi().canProcessPointerInput(this)) {
            this.getUi().processInput(Button.CANCEL);
          }
        }
      });
      listen("contextmenu", event => {
        event.stopPropagation();
        event.preventDefault();
      });
      listen("compositionstart", () => {
        this.composing = true;
      });
      listen("compositionend", () => {
        this.composing = false;
        this.onFormCompositionEnd();
      });
      listen("keydown", event => {
        // Keep text-editing keys from becoming gameplay CANCEL/ACTION or direction inputs.
        event.stopPropagation();
        if (event.isComposing || this.composing || event.keyCode === 229 || event.repeat) {
          return;
        }
        if (this.handleFormKeyDown(event)) {
          return;
        }
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          if (this.getUi().canProcessPointerInput(this)) {
            this.getUi().processInput(event.key === "Enter" ? Button.SUBMIT : Button.CANCEL);
          }
        }
      });
    }
  }

  protected createPointerTargets(): void {
    const ui = this.getUi();
    this.backdrop = globalScene.add
      .zone(0, -globalScene.scaledCanvas.height, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height)
      .setOrigin(0)
      .setName("rename-backdrop")
      .setInteractive();
    this.backdrop.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) =>
        event.stopPropagation(),
    );
    this.backdrop.on(
      "wheel",
      (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, _dz: number, event: Phaser.Types.Input.EventData) =>
        event.stopPropagation(),
    );
    ui.add(this.backdrop);
    ui.moveTo(this.backdrop, ui.getIndex(this.modalContainer));
    this.pointerTargets = new UiPointerTargets(this);
    const body = this.pointerTargets.add(this.modalContainer, "rename-body", () =>
      this.modalContainer.visible
        ? {
            x: 0,
            y: 0,
            width: this.modalBg.width,
            height: this.modalBg.height,
          }
        : null,
    );
    this.modalContainer.moveTo(body, 1);
    this.buttonBgs.forEach((button, index) => {
      button
        .off("pointerdown")
        .on(
          "pointerdown",
          (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            this.onButtonPointer(index, pointer, event);
          },
        );
    });
    this.bindInputEvents();
  }

  protected stopPointerInput(): void {
    for (const button of this.buttonBgs) {
      button.off("pointerdown");
    }
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    this.backdrop?.destroy();
    this.backdrop = undefined;
    for (const cleanup of this.domCleanups) {
      cleanup();
    }
    this.domCleanups.length = 0;
    this.composing = false;
    for (const input of this.inputs) {
      const node = input.node;
      if (node instanceof HTMLElement) {
        node.blur();
      }
    }
  }

  override processInput(button: Button): boolean {
    if (!this.pointerFormEnabled) {
      return super.processInput(button);
    }
    return this.invokeFormAction(
      button === Button.SUBMIT ? this.submitAction : button === Button.CANCEL ? this.cancelAction : undefined,
      button === Button.SUBMIT,
    );
  }

  override clear(): void {
    this.stopPointerInput();
    super.clear();
  }

  override destroy(): void {
    this.operationId++;
    this.stopPointerInput();
    super.destroy();
    this.active = false;
  }

  protected handleFormKeyDown(_event: KeyboardEvent): boolean {
    return false;
  }
  protected onFormCompositionEnd(): void {}

  override show(args: any[]): boolean {
    this.operationId++;
    this.stopPointerInput();
    if (!super.show(args)) {
      return false;
    }
    this.handled = false;
    if (this.pointerFormEnabled) {
      this.createPointerTargets();
    }
    return true;
  }
}
