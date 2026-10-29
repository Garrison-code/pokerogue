import { globalScene } from "#app/global-scene";
import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { MessageUiHandler } from "#ui/message-ui-handler";
import { addTextObject } from "#ui/text";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";

export class EvolutionSceneUiHandler extends MessageUiHandler {
  public evolutionContainer: Phaser.GameObjects.Container;
  public messageBg: Phaser.GameObjects.Image;
  public messageContainer: Phaser.GameObjects.Container;
  public canCancel: boolean;
  public cancelled: boolean;
  private pointerTargets: UiPointerTargets | undefined;
  private pointerPromptReady = false;
  private promptTimer: Phaser.Time.TimerEvent | null = null;
  private promptDelay: number | null | undefined;

  setup() {
    this.canCancel = false;
    this.cancelled = false;

    const ui = this.getUi();

    this.evolutionContainer = globalScene.add.container(0, -globalScene.scaledCanvas.height);

    const messageBg = globalScene.add
      .sprite(0, 0, "bg", settings.display.uiWindowStyle)
      .setOrigin(0, 1)
      .setVisible(false);

    this.messageBg = messageBg;

    this.messageContainer = globalScene.add.container(12, -39).setVisible(false);

    const message = addTextObject(0, 0, "", TextStyle.MESSAGE, {
      maxLines: 2,
      wordWrap: {
        width: 1780,
      },
    });
    this.messageContainer.add(message);

    ui.add([this.evolutionContainer, this.messageBg, this.messageContainer]);

    this.message = message;

    this.initPromptSprite(this.messageContainer);
  }

  show(_args: any[]): boolean {
    super.show(_args);

    globalScene.ui.bringToTop(this.evolutionContainer);
    globalScene.ui.bringToTop(this.messageBg.setVisible(true));
    globalScene.ui.bringToTop(this.messageContainer.setVisible(true));

    this.pointerTargets?.destroy();
    const targets = (this.pointerTargets = new UiPointerTargets(this));
    const ui = this.getUi();
    targets.add(ui, "evolution-page", () => ({
      x: 0,
      y: -globalScene.scaledCanvas.height,
      width: globalScene.scaledCanvas.width,
      height: globalScene.scaledCanvas.height,
    }));
    targets.add(
      ui,
      "evolution-message",
      () =>
        this.messageBg.visible
          ? {
              x: this.messageBg.x,
              y: this.messageBg.y - this.messageBg.displayHeight,
              width: this.messageBg.displayWidth,
              height: this.messageBg.displayHeight,
            }
          : null,
      () => {
        if (!this.pointerPromptReady || this.pendingPrompt || !this.awaitingActionInput || !this.onActionInput) {
          return;
        }
        this.pointerPromptReady = false;
        ui.processInput(Button.ACTION);
      },
    );

    return true;
  }

  override showText(...args: Parameters<MessageUiHandler["showText"]>): void {
    this.pointerPromptReady = false;
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    const [text, delay, callback, callbackDelay, prompt, promptDelay] = args;
    this.promptDelay = promptDelay;
    // Own the prompt delay so clearing or replacing a message cannot revive an old prompt.
    super.showText(text, delay, callback, callbackDelay, prompt, null);
  }

  override showPrompt(callback?: (() => void) | null, callbackDelay?: number | null): void {
    if (this.promptDelay) {
      this.promptTimer = globalScene.time.delayedCall(this.promptDelay, () => {
        this.promptTimer = null;
        super.showPrompt(callback, callbackDelay);
        this.pointerPromptReady = true;
      });
    } else {
      super.showPrompt(callback, callbackDelay);
      this.pointerPromptReady = true;
    }
  }

  override clearText(): void {
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    this.pointerPromptReady = false;
    super.clearText();
  }

  private stopInput(): void {
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    this.textTimer?.remove(false);
    this.textTimer = null;
    this.textCallbackTimer?.remove(false);
    this.textCallbackTimer = null;
    this.awaitingActionInput = false;
    this.onActionInput = null;
    this.pointerPromptReady = false;
    this.pendingPrompt = false;
    this.prompt.setVisible(false);
  }

  override destroy(): void {
    this.stopInput();
    this.active = false;
  }

  processInput(button: Button): boolean {
    if (this.canCancel && !this.cancelled && button === Button.CANCEL) {
      this.cancelled = true;
      return true;
    }

    const ui = this.getUi();
    if (this.awaitingActionInput && (button === Button.CANCEL || button === Button.ACTION) && this.onActionInput) {
      ui.playSelect();
      const originalOnActionInput = this.onActionInput;
      this.onActionInput = null;
      originalOnActionInput();
      return true;
    }

    return false;
  }

  setCursor(_cursor: number): boolean {
    return false;
  }

  clear() {
    this.stopInput();
    super.clear();
    this.clearText();
    this.canCancel = false;
    this.cancelled = false;
    this.evolutionContainer.removeAll(true);
    this.messageContainer.setVisible(false);
    this.messageBg.setVisible(false);
  }
}
