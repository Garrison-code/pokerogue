import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import type { PlayerPokemon } from "#field/pokemon";
import type { ModalConfig, OptionSelectItem } from "#types/ui-types";
import type { AutoCompleteUiHandler } from "#ui/autocomplete-ui-handler";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { PointerFormModalUiHandler } from "#ui/pointer-form-modal-ui-handler";
import i18next from "i18next";

/** Handler for the i18n testing menu used by the localization team. */
export class TestDialogueUiHandler extends PointerFormModalUiHandler {
  keys: string[];
  private displayId = 0;
  private candidateId = 0;
  private acceptingCandidate = false;
  private dismissSpace = false;
  private inputCleanups: (() => void)[] = [];

  private ownsCandidate(): boolean {
    return (
      this.getUi().mode === UiMode.AUTO_COMPLETE
      && (this.getUi().getHandler() as AutoCompleteUiHandler).parentModal === this.modalContainer
    );
  }

  protected override handleFormKeyDown(event: KeyboardEvent): boolean {
    if (!this.ownsCandidate()) {
      return false;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.getUi().processInput(Button.SUBMIT);
      return true;
    }
    if (event.key === "Escape" || event.code === "Space") {
      if (event.key === "Escape") {
        event.preventDefault();
      } else {
        this.dismissSpace = true;
      }
      const displayId = this.displayId;
      this.candidateId++;
      this.getUi()
        .revertMode()
        .then(() => {
          if (this.active && this.displayId === displayId && this.getUi().getHandler() === this) {
            this.inputs[0]?.setFocus();
          }
        });
      return true;
    }
    return false;
  }

  protected override onFormCompositionEnd(): void {
    this.updateCandidates();
  }

  private stopInputListeners(): void {
    this.displayId++;
    this.candidateId++;
    this.dismissSpace = false;
    for (const cleanup of this.inputCleanups) {
      cleanup();
    }
    this.inputCleanups = [];
  }

  private updateCandidates(): void {
    if (this.dismissSpace) {
      this.dismissSpace = false;
      return;
    }
    if (this.composing || this.acceptingCandidate || !this.active) {
      return;
    }
    const ui = this.getUi();
    if (ui.getHandler() !== this && !this.ownsCandidate()) {
      return;
    }
    const displayId = this.displayId;
    const candidateId = ++this.candidateId;
    const input = this.inputs[0];
    const text = input.text;
    const open = () => {
      if (
        !this.active
        || displayId !== this.displayId
        || candidateId !== this.candidateId
        || ui.getHandler() !== this
      ) {
        return;
      }
      const token = text.split(" ").at(-1)!.toLowerCase();
      const options: OptionSelectItem[] = (text ? this.keys.filter(key => key.toLowerCase().includes(token)) : []).map(
        value => ({
          label: value,
          handler: () => {
            if (
              !this.active
              || displayId !== this.displayId
              || candidateId !== this.candidateId
              || !this.ownsCandidate()
            ) {
              return false;
            }
            const words = input.text.split(" ");
            words[words.length - 1] = value;
            this.acceptingCandidate = true;
            input.setText(words.join(" "));
            this.acceptingCandidate = false;
            ui.revertMode().then(() => {
              if (this.active && displayId === this.displayId && ui.getHandler() === this) {
                input.setFocus();
              }
            });
            return true;
          },
        }),
      );
      if (options.length > 0) {
        ui.setOverlayMode(UiMode.AUTO_COMPLETE, { options, maxOptions: 5, modalContainer: this.modalContainer });
      }
    };
    if (this.ownsCandidate()) {
      ui.revertMode().then(open);
    } else {
      open();
    }
  }

  setup() {
    super.setup();

    const flattenKeys = (object?: any, topKey?: string, middleKey?: string[]): any[] => {
      return Object.keys(object ?? {})
        .map((t, i) => {
          const value = Object.values(object)[i];

          if (typeof value === "object" && value != null) {
            // we check for not null or undefined here because if the language json file has a null key, the typeof will still be an object, but that object will be null, causing issues
            // If the value is an object, execute the same process
            // si el valor es un objeto ejecuta el mismo proceso

            return flattenKeys(value, topKey ?? t, topKey ? (middleKey ? [...middleKey, t] : [t]) : undefined).filter(
              t => t.length > 0,
            );
          }
          if (typeof value === "string" || value == null) {
            // we check for null or undefined here as per above - the typeof is still an object but the value is null so we need to exit out of this and pass the null key

            // Return in the format expected by i18next
            return middleKey ? `${topKey}:${middleKey.join(".")}.${t}` : `${topKey}:${t}`;
          }
        })
        .filter(t => t);
    };

    const keysInArrays = flattenKeys(i18next.getDataByLanguage(String(i18next.resolvedLanguage))).filter(
      t => t.length > 0,
    ); // Array of arrays
    const keys = keysInArrays.flat(Number.POSITIVE_INFINITY).map(String); // One array of string
    this.keys = keys;
  }

  getModalTitle(_config?: ModalConfig): string {
    return "Test Dialogue";
  }

  getWidth(_config?: ModalConfig): number {
    return 300;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return ["Check", "Cancel"];
  }

  getReadableErrorMessage(error: string): string {
    const colonIndex = error?.indexOf(":");
    if (colonIndex > 0) {
      error = error.slice(0, colonIndex);
    }

    return super.getReadableErrorMessage(error);
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    return [{ label: "Dialogue" }];
  }

  show(args: any[]): boolean {
    this.stopInputListeners();
    this.stopPointerInput();
    for (const container of this.inputContainers) {
      container.destroy();
    }
    for (const label of this.formLabels) {
      label.destroy();
    }
    this.updateFields(this.getInputFieldConfigs(), !!this.getModalTitle());
    const input = this.inputs[0];
    input.setMaxLength(255);
    if (!super.show(args)) {
      return false;
    }
    const changed = () => this.updateCandidates();
    input.on("textchange", changed);
    this.inputCleanups.push(() => input.off("textchange", changed));
    const node = input.node;
    const keyup = () => {
      this.dismissSpace = false;
    };
    node.addEventListener("keyup", keyup);
    this.inputCleanups.push(() => node.removeEventListener("keyup", keyup));
    input.resize(1150, 116);
    (this.inputContainers[0].list[0] as Phaser.GameObjects.NineSlice).setSize(200, 16);
    const initial: PlayerPokemon | string | undefined = args[1];
    input.text =
      initial && typeof (initial as PlayerPokemon).getNameToRender === "function"
        ? (initial as PlayerPokemon).getNameToRender()
        : ((initial as string | undefined) ?? "");
    const config = args[0] as ModalConfig;
    this.submitAction = () => {
      this.sanitizeInputs();
      const encoded = btoa(unescape(encodeURIComponent(input.text)));
      config.buttonActions[0](encoded);
    };
    return true;
  }

  override clear(): void {
    this.stopInputListeners();
    super.clear();
  }

  override destroy(): void {
    this.stopInputListeners();
    super.destroy();
  }
}
