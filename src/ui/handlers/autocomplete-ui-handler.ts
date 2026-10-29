import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";
import type { UIOptionSelectItem } from "#types/ui-types";
import { OptionSelectUiHandler } from "#ui/option-select-ui-handler";
import type Phaser from "phaser";

export class AutoCompleteUiHandler extends OptionSelectUiHandler {
  private modalContainer: Phaser.GameObjects.Container | undefined;
  private backdrop: Phaser.GameObjects.Zone | undefined;

  protected override get pointerConfirmButton(): Button {
    return Button.SUBMIT;
  }

  public get parentModal(): Phaser.GameObjects.Container | undefined {
    return this.modalContainer;
  }

  constructor() {
    super(UiMode.AUTO_COMPLETE);
  }

  public override show(args: any[]): boolean {
    if (args[0]?.modalContainer) {
      const { modalContainer } = args[0];
      this.modalContainer = modalContainer;

      this.backdrop?.destroy();
      const shown = super.show(args);
      if (shown) {
        const ui = this.getUi();
        this.backdrop = globalScene.add
          .zone(0, -globalScene.scaledCanvas.height, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height)
          .setOrigin(0)
          .setInteractive();
        const consume = (...args: unknown[]) => (args.at(-1) as Phaser.Types.Input.EventData).stopPropagation();
        this.backdrop.on("pointerdown", consume).on("wheel", consume);
        ui.add(this.backdrop);
        ui.moveTo(this.backdrop, ui.getIndex(this.optionSelectContainer));
      }
      return shown;
    }

    return false;
  }

  protected override updateSizeForOptions(options: UIOptionSelectItem[]): void {
    super.updateSizeForOptions(options);

    if (this.modalContainer) {
      this.optionSelectContainer.setPositionRelative(
        this.modalContainer,
        this.optionSelectBg.width,
        this.optionSelectBg.height + 50,
      );
    }
  }

  override clear(): void {
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.modalContainer = undefined;
    super.clear();
  }

  override destroy(): void {
    this.clear();
    super.destroy();
  }

  public override processInput(button: Button): boolean {
    const ui = this.getUi();

    if (button === Button.SUBMIT) {
      const option = this.currentOption;

      if (option?.handler()) {
        if (!option.keepOpen) {
          this.clear();
        }
        if (!option.noSoundEffects) {
          ui.playSelect();
        }
      } else {
        ui.playError();
      }

      return true;
    }

    if (button !== Button.CANCEL && button !== Button.ACTION) {
      return super.processInput(button);
    }

    return false;
  }
}
