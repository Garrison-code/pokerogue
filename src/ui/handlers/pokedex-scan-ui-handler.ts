import { speciesDataRegistry } from "#app/global-species-data-registry";
import { allAbilities, allMoves } from "#data/data-lists";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import type { PlayerPokemon } from "#field/pokemon";
import type { ModalConfig, OptionSelectItem } from "#types/ui-types";
import type { AutoCompleteUiHandler } from "#ui/autocomplete-ui-handler";
import { FilterTextRow } from "#ui/filter-text";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { PointerFormModalUiHandler } from "#ui/pointer-form-modal-ui-handler";
import i18next from "i18next";

export class PokedexScanUiHandler extends PointerFormModalUiHandler {
  private displayId = 0;
  private candidateId = 0;
  private acceptingCandidate = false;
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
      }
      this.getUi()
        .revertMode()
        .then(() => {
          if (this.active && this.getUi().getHandler() === this) {
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
    for (const cleanup of this.inputCleanups) {
      cleanup();
    }
    this.inputCleanups = [];
  }

  private updateCandidates(): void {
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
      const keys = text ? this.reducedKeys.filter(value => value.toLowerCase().includes(text.toLowerCase())) : [];
      const options: OptionSelectItem[] = keys.map(value => ({
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
          this.acceptingCandidate = true;
          input.setText(value);
          this.acceptingCandidate = false;
          ui.revertMode().then(() => {
            if (this.active && displayId === this.displayId && ui.getHandler() === this) {
              input.setFocus();
            }
          });
          return true;
        },
      }));
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

  keys: string[];
  reducedKeys: string[];
  parallelKeys: string[];
  nameKeys: string[];
  moveKeys: string[];
  abilityKeys: string[];
  row: number;

  setup() {
    super.setup();

    this.nameKeys = [...new Set(speciesDataRegistry.getAllSpecies().map(s => s.name))];
    this.moveKeys = allMoves.map(a => a.name);
    this.abilityKeys = allAbilities.map(a => a.name);
  }

  getModalTitle(_config?: ModalConfig): string {
    return i18next.t("pokedexUiHandler:scanChooseOption");
  }

  getWidth(_config?: ModalConfig): number {
    return 300;
  }

  getMargin(_config?: ModalConfig): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(_config?: ModalConfig): string[] {
    return [i18next.t("pokedexUiHandler:scanSelect"), i18next.t("pokedexUiHandler:scanCancel")];
  }

  getReadableErrorMessage(error: string): string {
    const colonIndex = error?.indexOf(":");
    if (colonIndex > 0) {
      error = error.slice(0, colonIndex);
    }

    return super.getReadableErrorMessage(error);
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    switch (this.row) {
      case FilterTextRow.NAME: {
        return [{ label: i18next.t("pokedexUiHandler:scanLabelName") }];
      }
      case FilterTextRow.MOVE_1:
      case FilterTextRow.MOVE_2: {
        return [{ label: i18next.t("pokedexUiHandler:scanLabelMove") }];
      }
      case FilterTextRow.ABILITY_1: {
        return [{ label: i18next.t("pokedexUiHandler:scanLabelAbility") }];
      }
      case FilterTextRow.ABILITY_2: {
        return [{ label: i18next.t("pokedexUiHandler:scanLabelPassive") }];
      }
      default: {
        return [{ label: "" }];
      }
    }
  }

  reduceKeys(): void {
    switch (this.row) {
      case FilterTextRow.NAME: {
        this.reducedKeys = this.nameKeys;
        break;
      }
      case FilterTextRow.MOVE_1:
      case FilterTextRow.MOVE_2: {
        this.reducedKeys = this.moveKeys;
        break;
      }
      case FilterTextRow.ABILITY_1:
      case FilterTextRow.ABILITY_2: {
        this.reducedKeys = this.abilityKeys;
        break;
      }
      default: {
        this.reducedKeys = this.keys;
      }
    }
  }

  // args[2] is an index of FilterTextRow
  show(args: any[]): boolean {
    this.stopInputListeners();
    this.stopPointerInput();
    for (const container of this.inputContainers) {
      container.destroy();
    }
    for (const label of this.formLabels) {
      label.destroy();
    }
    this.row = args[2];
    const ui = this.getUi();
    const hasTitle = !!this.getModalTitle();
    this.updateFields(this.getInputFieldConfigs(), hasTitle);
    this.updateContainer(args[0] as ModalConfig);
    const input = this.inputs[0];
    input.setMaxLength(255);

    this.reduceKeys();

    if (super.show(args)) {
      const changed = () => this.updateCandidates();
      input.on("textchange", changed);
      this.inputCleanups.push(() => input.off("textchange", changed));
      const config = args[0] as ModalConfig;
      const label = this.formLabels[0];

      const inputWidth = label.width < 420 ? 200 : 200 - (label.width - 420) / 5.75;
      this.inputs[0].resize(inputWidth * 5.75, 116);
      // TODO: Figure out what the type of `this.inputContainers.list` is
      this.inputContainers[0].list[0]["width"] = inputWidth;
      // TODO: shouldn't this be `const playerPokemon: PlayerPokemon | undefined = args[1];` and `if (playerPokemon)`?
      if (args[1] && typeof (args[1] as PlayerPokemon).getNameToRender === "function") {
        this.inputs[0].text = (args[1] as PlayerPokemon).getNameToRender();
      } else {
        this.inputs[0].text = args[1];
      }
      this.submitAction = () => {
        if (ui.mode === UiMode.POKEDEX_SCAN) {
          this.sanitizeInputs();
          const outputName = this.reducedKeys.includes(this.inputs[0].text) ? this.inputs[0].text : "";
          const sanitizedName = btoa(unescape(encodeURIComponent(outputName)));
          config.buttonActions[0](sanitizedName);
          return true;
        }
        return false;
      };
      return true;
    }
    return false;
  }

  override destroy(): void {
    this.stopInputListeners();
    super.destroy();
  }

  clear(): void {
    this.stopInputListeners();
    super.clear();

    // Clearing the labels so they don't appear again and overlap
    this.formLabels.forEach(label => {
      label.destroy();
    });
  }
}
