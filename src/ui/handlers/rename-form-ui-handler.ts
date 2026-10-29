import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import type { PlayerPokemon } from "#field/pokemon";
import type { ModalConfig } from "#types/ui-types";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { FormModalUiHandler } from "#ui/form-modal-ui-handler";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";
import i18next from "i18next";

export class RenameFormUiHandler extends FormModalUiHandler {
  private pointerTargets: UiPointerTargets | undefined;
  private backdrop: Phaser.GameObjects.Zone | undefined;
  private domCleanups: (() => void)[] = [];
  private handled = false;
  private composing = false;

  private onButtonPointer(index: number, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    event.stopPropagation();
    if (pointer.wasTouch || !this.getUi().canProcessPointerInput(this)) {
      return;
    }
    if (pointer.rightButtonDown()) {
      this.getUi().processInput(Button.CANCEL);
    } else if (pointer.leftButtonDown()) {
      this.getUi().processInput(index === 0 ? Button.SUBMIT : Button.CANCEL);
    }
  }

  private bindInputEvents(): void {
    const node = this.inputs[0]?.node;
    if (!(node instanceof HTMLInputElement)) {
      return;
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
    });
    listen("keydown", event => {
      // Keep text-editing keys from becoming gameplay CANCEL/ACTION or direction inputs.
      event.stopPropagation();
      if (event.isComposing || this.composing || event.keyCode === 229 || event.repeat) {
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

  private createPointerTargets(): void {
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

  private stopPointerInput(): void {
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
    const node = this.inputs[0]?.node;
    if (node instanceof HTMLElement) {
      node.blur();
    }
  }

  override processInput(button: Button): boolean {
    if (
      !this.getUi().canProcessPointerInput(this)
      || this.handled
      || globalScene.tweens.getTweensOf(this.modalContainer).length > 0
    ) {
      return false;
    }
    const action =
      button === Button.SUBMIT ? this.submitAction : button === Button.CANCEL ? this.cancelAction : undefined;
    if (!action || (button === Button.SUBMIT && this.composing)) {
      return false;
    }
    this.handled = true;
    action();
    return true;
  }

  override clear(): void {
    this.stopPointerInput();
    super.clear();
  }

  override destroy(): void {
    this.stopPointerInput();
    super.destroy();
    this.active = false;
  }

  getModalTitle(_config?: ModalConfig): string {
    return i18next.t("menu:renamePokemon");
  }

  getWidth(_config?: ModalConfig): number {
    return 160;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return [i18next.t("menu:rename"), i18next.t("menu:cancel")];
  }

  getReadableErrorMessage(error: string): string {
    const colonIndex = error?.indexOf(":");
    if (colonIndex > 0) {
      error = error.slice(0, colonIndex);
    }

    return super.getReadableErrorMessage(error);
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    return [{ label: i18next.t("menu:nickname") }];
  }

  show(args: any[]): boolean {
    this.stopPointerInput();
    if (super.show(args)) {
      this.handled = false;
      const config = args[0] as ModalConfig;
      // TODO: shouldn't this be `const playerPokemon: PlayerPokemon | undefined = args[1];` and `if (playerPokemon)`?
      if (args[1] && typeof (args[1] as PlayerPokemon).getNameToRender === "function") {
        this.inputs[0].text = (args[1] as PlayerPokemon).getNameToRender({ useIllusion: false });
      } else {
        this.inputs[0].text = args[1];
      }
      this.submitAction = () => {
        this.sanitizeInputs();
        const sanitizedName = btoa(unescape(encodeURIComponent(this.inputs[0].text)));
        config.buttonActions[0](sanitizedName);
        return true;
      };
      this.createPointerTargets();
      return true;
    }
    return false;
  }
}
