import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { Device } from "#enums/devices";
import { TextStyle } from "#enums/text-style";
import type { CustomInterfaceConfig } from "#types/inputs";
import type { TabMenu } from "#ui/tab-menu";
import { addTextObject, getTextColor } from "#ui/text";
import { UiHandler } from "#ui/ui-handler";
import { UiPointerTargets } from "#ui/ui-pointer-targets";
import { addWindow } from "#ui/ui-theme";
import i18next from "i18next";

type CancelFn = (success?: boolean) => boolean;

/**
 * Abstract class for handling UI elements related to button bindings.
 */
export abstract class BaseBindingUiHandler extends UiHandler {
  protected abstract readonly device: Device;
  private pointerTargets: UiPointerTargets | null = null;
  private pointerBackdrop: Phaser.GameObjects.Zone | null = null;
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private displayId = 0;
  private closed = false;
  private boundDevice: string | undefined;
  private boundConfig: CustomInterfaceConfig | null = null;

  protected get supportsBindingPointer(): boolean {
    return this.device === Device.KEYBOARD;
  }

  protected isCurrentDevice(): boolean {
    const controller = globalScene.inputController;
    return (
      this.boundConfig != null
      && controller.selectedDevice[this.device] === this.boundDevice
      && controller.getActiveConfig(this.device) === this.boundConfig
      && (this.device !== Device.GAMEPAD
        || controller.getGamepadsName().some(name => name.toLowerCase() === this.boundDevice?.toLowerCase()))
    );
  }

  protected canCaptureInput(): boolean {
    return (
      this.listening
      && this.buttonPressed === null
      && !this.closed
      && this.isCurrentDevice()
      && this.getUi().canProcessPointerInput(this)
    );
  }

  // Containers for different segments of the UI.
  protected optionSelectContainer: Phaser.GameObjects.Container;
  protected actionsContainer: Phaser.GameObjects.Container;

  // Background elements for titles and action areas.
  protected titleBg: Phaser.GameObjects.NineSlice;
  protected actionBg: Phaser.GameObjects.NineSlice;
  protected optionSelectBg: Phaser.GameObjects.NineSlice;

  // Text elements for displaying instructions and actions.
  protected unlockText: Phaser.GameObjects.Text;
  protected timerText: Phaser.GameObjects.Text;
  protected swapText: Phaser.GameObjects.Text;
  protected actionLabel: Phaser.GameObjects.Text;
  protected cancelLabel: Phaser.GameObjects.Text;

  protected listening = false;
  protected buttonPressed: number | null = null;

  // Icons for displaying current and new button assignments.
  protected newButtonIcon: Phaser.GameObjects.Sprite;
  protected targetButtonIcon: Phaser.GameObjects.Sprite;

  // Function to call on cancel or completion of binding.
  protected cancelFn: CancelFn | null;
  abstract swapAction(): boolean;

  protected timeLeftAutoClose = 5;
  protected countdownTimer: ReturnType<typeof setTimeout> | null = null;

  // The specific setting being modified.
  protected target;
  protected tabMenu: TabMenu | undefined;

  public override setup(): void {
    const ui = this.getUi();
    this.optionSelectContainer = globalScene.add.container(0, 0);
    this.actionsContainer = globalScene.add.container(0, 0);
    // Initially, containers are not visible.
    this.optionSelectContainer.setVisible(false);
    this.actionsContainer.setVisible(false);

    // Add containers to the UI.
    ui.add(this.optionSelectContainer);
    ui.add(this.actionsContainer);

    // Setup backgrounds and text objects for UI.
    this.titleBg = addWindow(
      globalScene.scaledCanvas.width - this.getWindowWidth(),
      -globalScene.scaledCanvas.height + 28 + 21,
      this.getWindowWidth(),
      24,
    );
    this.titleBg.setOrigin(0.5);
    this.optionSelectContainer.add(this.titleBg);

    this.actionBg = addWindow(
      globalScene.scaledCanvas.width - this.getWindowWidth(),
      -globalScene.scaledCanvas.height + this.getWindowHeight() + 28 + 21 + 21,
      this.getWindowWidth(),
      24,
    );
    this.actionBg.setOrigin(0.5);
    this.actionsContainer.add(this.actionBg);

    // Text prompts and instructions for the user.
    this.unlockText = addTextObject(0, 0, i18next.t("settings:pressButton"), TextStyle.WINDOW);
    this.unlockText.setOrigin(0, 0);
    this.unlockText.setPositionRelative(this.titleBg, 36, 4);
    this.optionSelectContainer.add(this.unlockText);

    this.timerText = addTextObject(0, 0, "(5)", TextStyle.WINDOW);
    this.timerText.setOrigin(0, 0);
    this.timerText.setPositionRelative(this.unlockText, this.unlockText.width / 6 + 5, 0);
    this.optionSelectContainer.add(this.timerText);

    this.optionSelectBg = addWindow(
      globalScene.scaledCanvas.width - this.getWindowWidth(),
      -globalScene.scaledCanvas.height + this.getWindowHeight() + 28,
      this.getWindowWidth(),
      this.getWindowHeight(),
    );
    this.optionSelectBg.setOrigin(0.5);
    this.optionSelectContainer.add(this.optionSelectBg);

    this.cancelLabel = addTextObject(0, 0, i18next.t("settings:back"), TextStyle.SETTINGS_LABEL);
    this.cancelLabel.setOrigin(0, 0.5);
    this.cancelLabel.setPositionRelative(this.actionBg, 10, this.actionBg.height / 2);
    this.actionsContainer.add(this.cancelLabel);
  }

  private manageAutoCloseTimer(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }
    const displayId = this.displayId;
    this.countdownTimer = setTimeout(() => {
      if (!this.active || this.closed || displayId !== this.displayId) {
        return;
      }
      this.timeLeftAutoClose -= 1;
      this.timerText.setText(`(${this.timeLeftAutoClose})`);
      if (this.timeLeftAutoClose >= 0) {
        this.manageAutoCloseTimer();
      } else {
        this.finish();
      }
    }, 1000);
  }

  /**
   * Show the UI with the provided arguments.
   *
   * @param args - Arguments to be passed to the show method.
   * @returns `true` if successful.
   */
  public override show(args: any[]): boolean {
    this.stopDisplay();
    super.show(args);
    this.closed = false;
    this.boundDevice = globalScene.inputController.selectedDevice[this.device];
    this.boundConfig = globalScene.inputController.getActiveConfig(this.device);
    this.buttonPressed = null;
    this.timeLeftAutoClose = 5;
    this.cancelFn = args[0].cancelHandler;
    this.target = args[0].target;

    // Bring the option and action containers to the front of the UI.
    this.getUi().bringToTop(this.optionSelectContainer);
    this.getUi().bringToTop(this.actionsContainer);

    this.optionSelectContainer.setVisible(true);
    this.listening = false;
    this.timerText.setText("(5)");
    this.newButtonIcon.setVisible(false);
    this.targetButtonIcon?.setVisible(false);
    this.swapText?.setVisible(false);
    this.actionsContainer.setVisible(false);
    const displayId = this.displayId;
    this.listenTimer = setTimeout(() => {
      if (!this.active || this.closed || displayId !== this.displayId) {
        return;
      }
      this.listening = true;
      this.manageAutoCloseTimer();
    }, 100);
    this.setupPointerTargets();
    return true;
  }

  /**
   * Get the width of the window.
   *
   * @returns The window width.
   */
  protected getWindowWidth(): number {
    return 160;
  }

  /**
   * Get the height of the window.
   *
   * @returns The window height.
   */
  protected getWindowHeight(): number {
    return 64;
  }

  /**
   * Process the input for the given button.
   *
   * @param button - The button to process.
   * @returns `true` if the input was processed successfully.
   */
  public override processInput(button: Button): boolean {
    if (this.buttonPressed === null || this.closed) {
      return false; // TODO: is false correct as default? (previously was `undefined`)
    }
    const ui = this.getUi();
    let success = false;
    switch (button) {
      case Button.LEFT:
      case Button.RIGHT: {
        // Toggle between action and cancel options.
        success = this.setCursor(this.cursor ? 0 : 1);
        break;
      }
      case Button.ACTION:
        // Process actions based on current cursor position.
        if (this.cursor === 0) {
          this.finish();
        } else {
          success = this.swapAction();
          this.tabMenu?.updateIcons();
          this.finish(success);
        }
        break;
    }

    // Plays a select sound effect if an action was successfully processed.
    if (success) {
      ui.playSelect();
    } else {
      ui.playError();
    }

    return success;
  }

  private finish(success?: boolean): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.listening = false;
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }
    if (this.listenTimer) {
      clearTimeout(this.listenTimer);
    }
    this.cancelFn?.(success);
  }

  private setupPointerTargets(): void {
    if (!this.supportsBindingPointer) {
      return;
    }
    this.pointerTargets = new UiPointerTargets(this);
    this.pointerBackdrop = globalScene.add
      .zone(0, -globalScene.scaledCanvas.height, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height)
      .setOrigin(0)
      .setInteractive();
    const consume = (...args: unknown[]) => (args.at(-1) as Phaser.Types.Input.EventData).stopPropagation();
    this.pointerBackdrop.on("pointerdown", consume).on("wheel", consume);
    this.optionSelectContainer.addAt(this.pointerBackdrop, 0);
    const area = (bg: Phaser.GameObjects.NineSlice) => ({
      x: bg.x - bg.width / 2,
      y: bg.y - bg.height / 2,
      width: bg.width,
      height: bg.height,
    });
    this.pointerTargets.add(this.optionSelectContainer, "binding-title", () => area(this.titleBg));
    this.pointerTargets.add(this.optionSelectContainer, "binding-body", () => area(this.optionSelectBg));
    this.pointerTargets.add(this.actionsContainer, "binding-actions", () =>
      this.buttonPressed === null ? null : area(this.actionBg),
    );
    for (const index of [0, 1]) {
      this.pointerTargets.add(
        this.actionsContainer,
        `binding-choice-${index}`,
        () => {
          if (this.buttonPressed === null) {
            return null;
          }
          const bounds = area(this.actionBg);
          return { ...bounds, x: bounds.x + (index * bounds.width) / 2, width: bounds.width / 2 };
        },
        () => {
          if (this.closed) {
            return;
          }
          if (this.cursor === index) {
            this.getUi().processInput(Button.ACTION);
          } else if (this.setCursor(index)) {
            this.getUi().playSelect();
          }
        },
      );
    }
  }

  private stopDisplay(): void {
    ++this.displayId;
    this.listening = false;
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }
    if (this.listenTimer) {
      clearTimeout(this.listenTimer);
    }
    this.countdownTimer = null;
    this.listenTimer = null;
    this.pointerTargets?.destroy();
    this.pointerTargets = null;
    this.pointerBackdrop?.destroy();
    this.pointerBackdrop = null;
  }

  public override destroy(): void {
    this.clear();
    this.optionSelectContainer.destroy();
    this.actionsContainer.destroy();
    super.destroy();
  }

  /**
   * Set the cursor to the specified position.
   *
   * @param cursor - The cursor position to set.
   * @returns `true` if the cursor was set successfully.
   */
  public override setCursor(cursor: number): boolean {
    this.cursor = cursor;
    if (cursor === 1) {
      this.actionLabel.setColor(getTextColor(TextStyle.SETTINGS_SELECTED));
      this.actionLabel.setShadowColor(getTextColor(TextStyle.SETTINGS_SELECTED, true));
      this.cancelLabel.setColor(getTextColor(TextStyle.WINDOW));
      this.cancelLabel.setShadowColor(getTextColor(TextStyle.WINDOW, true));
      return true;
    }
    this.actionLabel.setColor(getTextColor(TextStyle.WINDOW));
    this.actionLabel.setShadowColor(getTextColor(TextStyle.WINDOW, true));
    this.cancelLabel.setColor(getTextColor(TextStyle.SETTINGS_SELECTED));
    this.cancelLabel.setShadowColor(getTextColor(TextStyle.SETTINGS_SELECTED, true));
    return true;
  }

  /**
   * Clear the UI elements and state.
   */
  public override clear(): void {
    this.stopDisplay();
    this.closed = true;
    this.boundConfig = null;
    super.clear();
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }
    this.timerText.setText("(5)");
    this.timeLeftAutoClose = 5;
    this.listening = false;
    this.target = null;
    this.cancelFn = null;
    this.optionSelectContainer.setVisible(false);
    this.actionsContainer.setVisible(false);
    this.newButtonIcon.setVisible(false);
    this.buttonPressed = null;
  }

  /**
   * Handle input down events.
   *
   * @param buttonIcon - The icon of the button that was pressed.
   * @param assignedButtonIcon - The icon of the button that is assigned.
   * @param type - The type of button press.
   */
  protected onInputDown(buttonIcon: string, assignedButtonIcon: string | null, type: string): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }
    globalScene.inputController.deactivatePressedKey();
    this.timerText.setText("");
    this.newButtonIcon.setTexture(type);
    this.newButtonIcon.setFrame(buttonIcon);
    if (assignedButtonIcon) {
      this.targetButtonIcon.setTexture(type);
      this.targetButtonIcon.setFrame(assignedButtonIcon);
      this.targetButtonIcon.setVisible(true);
      this.swapText.setVisible(true);
    }
    this.newButtonIcon.setVisible(true);
    this.setCursor(0);
    this.actionsContainer.setVisible(true);
  }
}
