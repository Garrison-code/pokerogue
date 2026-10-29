import { audioManager } from "#app/global-audio-manager";
import { globalScene } from "#app/global-scene";
import { settings } from "#app/global-settings-manager";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { AwaitableUiHandler } from "#ui/awaitable-ui-handler";
import { addBBCodeTextObject } from "#ui/text";
import { hasSpecialWrapSpace, wrapTextAtSpaces } from "#ui/utils/text-wrap";
import { getFrameMs } from "#utils/common";
import type BBCodeText from "phaser3-rex-plugins/plugins/bbcodetext";

export abstract class MessageUiHandler extends AwaitableUiHandler {
  protected textTimer: Phaser.Time.TimerEvent | null;
  protected textCallbackTimer: Phaser.Time.TimerEvent | null;
  public pendingPrompt = false;
  private textDisplayId = 0;
  private pointerMessagePending = false;
  private finishText: (() => void) | null = null;
  protected promptTimer: Phaser.Time.TimerEvent | null = null;
  private releaseFade: (() => void) | null = null;
  private pauseTween: Phaser.Tweens.Tween | null = null;
  private readonly messageTimers = new Set<Phaser.Time.TimerEvent>();

  /** Internal mouse state: ordinary description text never becomes an action. */
  get hasPointerMessage(): boolean {
    return this.pointerMessagePending || (!!this.awaitingActionInput && !!this.onActionInput);
  }

  processPointerMessage(): boolean {
    if (this.finishText && this.pointerMessagePending) {
      this.finishText();
      return true;
    }
    if (this.pendingPrompt || !this.awaitingActionInput || !this.onActionInput) {
      return false;
    }
    return this.getUi().processInput(Button.ACTION);
  }

  private stopMessage(): void {
    ++this.textDisplayId;
    this.releaseFade?.();
    this.releaseFade = null;
    this.textTimer?.remove(false);
    this.textTimer = null;
    this.textCallbackTimer?.remove(false);
    this.textCallbackTimer = null;
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    this.pauseTween?.remove();
    this.pauseTween = null;
    for (const timer of this.messageTimers) {
      timer.remove(false);
    }
    this.messageTimers.clear();
    this.finishText = null;
    this.pointerMessagePending = false;
    this.pendingPrompt = false;
    this.awaitingActionInput = false;
    this.onActionInput = null;
    this.prompt?.setVisible(false);
  }

  public message: Phaser.GameObjects.Text;
  public prompt: Phaser.GameObjects.Sprite;
  /**
   * The container for the name box
   * @remarks This will be undefined unless `this.initNameBox()` was called
   */
  public nameBoxContainer?: Phaser.GameObjects.Container;
  private nameBox: Phaser.GameObjects.NineSlice;
  private nameIcon: Phaser.GameObjects.Sprite;
  private nameText: BBCodeText;

  public readonly wordWrapWidth: number = 1780;

  /**
   * Add the name box shown by {@linkcode showDialogue} to the given message container.
   * @param container - The container holding the message text
   * @param x - The x position of the name box
   * @param y - The y position of the name box
   * @remarks
   * If this method is not called, the name box will not be displayed.
   */
  public initNameBox(container: Phaser.GameObjects.Container, x = 0, y = -16): void {
    this.nameBoxContainer = globalScene.add.container(x, y);
    this.nameBoxContainer.setVisible(false);

    this.nameBox = globalScene.add.nineslice(0, 0, "namebox", settings.display.uiWindowStyle, 72, 16, 8, 8, 5, 5);
    this.nameBox.setOrigin(0, 0);

    this.nameIcon = globalScene.add.sprite(8, 0, "items", "");
    this.nameIcon.setOrigin(0, 0);
    this.nameIcon.setVisible(false);

    this.nameText = addBBCodeTextObject(8, 0, "Rival", TextStyle.MESSAGE, { maxLines: 1 });

    this.nameBoxContainer.add(this.nameBox);
    this.nameBoxContainer.add(this.nameIcon);
    this.nameBoxContainer.add(this.nameText);
    container.add(this.nameBoxContainer);
  }

  /**
   * Add the sprite to be displayed at the end of messages with prompts
   * @param container the container to add the sprite to
   */
  public initPromptSprite(container: Phaser.GameObjects.Container) {
    if (!this.prompt) {
      const promptSprite = globalScene.add.sprite(0, 0, "prompt");
      promptSprite.setVisible(false);
      promptSprite.setOrigin(0, 0);
      this.prompt = promptSprite;
    }

    if (container) {
      container.add(this.prompt);
    }
  }

  showText(
    text: string,
    delay?: number | null,
    callback?: (() => void) | null,
    callbackDelay?: number | null,
    prompt?: boolean | null,
    promptDelay?: number | null,
  ) {
    this.hideNameText();
    this.showTextInternal(text, delay, callback, callbackDelay, prompt, promptDelay);
  }

  showDialogue(
    text: string,
    name?: string,
    delay?: number | null,
    callback?: (() => void) | null,
    callbackDelay?: number | null,
    prompt?: boolean | null,
    promptDelay?: number | null,
  ) {
    this.showText(text, delay, callback, callbackDelay, prompt, promptDelay);
    if (name) {
      this.showNameText(name);
    }
  }

  private showTextInternal(
    text: string,
    delay?: number | null,
    callback?: (() => void) | null,
    callbackDelay?: number | null,
    prompt?: boolean | null,
    promptDelay?: number | null,
  ) {
    this.stopMessage();
    const textDisplayId = this.textDisplayId;
    const current = () => textDisplayId === this.textDisplayId;
    this.pointerMessagePending = !!prompt;
    if (delay === null || delay === undefined) {
      delay = 20;
    }

    // Pattern matching regex that checks for @c{}, @f{}, @s{}, and @f{} patterns within message text and parses them to their respective behaviors.
    const effects = new Map<number, (() => void)[]>();
    const delayMap = new Map<number, number>();
    const fadeMap = new Map<number, number>();
    const actionPattern = /@(c|d|s|f)\{(.*?)\}/;
    let actionMatch: RegExpExecArray | null;
    const pokename: string[] = [];
    const repname = ["#POKEMON1", "#POKEMON2"];
    for (let p = 0; p < globalScene.getPlayerField().length; p++) {
      pokename.push(globalScene.getPlayerField()[p].getNameToRender());
      text = text.split(pokename[p]).join(repname[p]);
    }
    while ((actionMatch = actionPattern.exec(text))) {
      const value = actionMatch[2];
      switch (actionMatch[1]) {
        case "c":
          effects.set(actionMatch.index, [
            ...(effects.get(actionMatch.index) ?? []),
            () => globalScene.charSprite.setVariant(value),
          ]);
          break;
        case "d":
          delayMap.set(actionMatch.index, Number.parseInt(actionMatch[2]));
          break;
        case "s":
          effects.set(actionMatch.index, [
            ...(effects.get(actionMatch.index) ?? []),
            () => audioManager.playSound(value),
          ]);
          break;
        case "f":
          fadeMap.set(actionMatch.index, Number.parseInt(actionMatch[2]));
          break;
      }
      text = text.slice(0, actionMatch.index) + text.slice(actionMatch.index + actionMatch[2].length + 4);
    }

    for (let p = 0; p < globalScene.getPlayerField().length; p++) {
      text = text.split(repname[p]).join(pokename[p]);
    }
    if (text) {
      if (hasSpecialWrapSpace(text)) {
        const wordWrapWidth = this.message.style.wordWrapWidth ?? this.wordWrapWidth;
        text = wrapTextAtSpaces(text, wordWrapWidth, line => this.message.context.measureText(line).width);
      } else {
        // Predetermine overflow line breaks to avoid words breaking while displaying
        const textWords = text.split(" ");
        let lastLineCount = 1;
        let newText = "";
        for (const textWord of textWords) {
          const nextWordText = newText ? `${newText} ${textWord}` : textWord;

          if (textWord.includes("\n")) {
            newText = nextWordText;
            lastLineCount++;
          } else {
            const lineCount = this.message.runWordWrap(nextWordText).split(/\n/g).length;
            if (lineCount > lastLineCount) {
              lastLineCount = lineCount;
              newText = `${newText}\n${textWord}`;
            } else {
              newText = nextWordText;
            }
          }
        }

        text = newText;
      }
    }

    const originalCallback = callback;
    const later = (duration: number, action: () => void) => {
      const timer = globalScene.time.delayedCall(duration, () => {
        this.messageTimers.delete(timer);
        if (current()) {
          action();
        }
      });
      this.messageTimers.add(timer);
      return timer;
    };
    const completed = () => {
      if (!current()) {
        return;
      }
      if (prompt) {
        const show = () => {
          this.promptTimer = null;
          if (current()) {
            this.showPrompt(originalCallback, callbackDelay);
          }
        };
        if (promptDelay) {
          this.promptTimer = later(promptDelay, show);
        } else {
          show();
        }
      } else if (originalCallback) {
        if (delay && callbackDelay) {
          this.textCallbackTimer = later(callbackDelay, () => {
            this.textCallbackTimer = null;
            originalCallback();
          });
        } else {
          originalCallback();
        }
      }
    };
    let processed = -1;
    let done = false;
    let revealing = false;
    let fading = false;
    const finish = () => {
      if (done || !current()) {
        return;
      }
      done = true;
      this.textTimer?.remove(false);
      this.textTimer = null;
      this.finishText = null;
      completed();
    };
    const apply = (index: number) => {
      if (!current() || index <= processed) {
        return;
      }
      processed = index;
      for (const effect of effects.get(index) ?? []) {
        effect();
      }
    };
    const fade = (index: number, frames: number) => {
      fading = true;
      if (this.textTimer) {
        this.textTimer.paused = true;
      }
      later(150, () => {
        const ui = this.getUi();
        const fadeOut = ui.fadeOut(750);
        const fadeId = ui.currentFadeId;
        this.releaseFade = () => ui.cancelMessageFade(fadeId);
        fadeOut.then(() => {
          if (!current()) {
            return;
          }
          later(getFrameMs(frames), () => {
            const fadeIn = ui.fadeIn(500);
            const fadeInId = ui.currentFadeId;
            this.releaseFade = () => ui.cancelMessageFade(fadeInId);
            fadeIn.then(() => {
              if (!current()) {
                return;
              }
              this.releaseFade = null;
              fading = false;
              apply(index);
              if (revealing) {
                reveal();
              } else if (index === text.length) {
                finish();
              } else if (this.textTimer) {
                this.textTimer.paused = false;
              }
            });
          });
        });
      });
    };
    const reveal = () => {
      if (!current() || done) {
        return;
      }
      revealing = true;
      this.textTimer?.remove(false);
      this.textTimer = null;
      this.pauseTween?.remove();
      this.pauseTween = null;
      if (fading) {
        return;
      }
      for (let index = processed + 1; index <= text.length; index++) {
        this.message.setText(text.slice(0, index));
        const frames = fadeMap.get(index);
        if (frames) {
          fade(index, frames);
          return;
        }
        apply(index);
      }
      finish();
    };
    this.pendingPrompt = !!prompt;
    if (delay) {
      this.message.setText("");
      this.finishText = reveal;
      this.textTimer = globalScene.time.addEvent({
        delay,
        callback: () => {
          if (!current() || done || !this.textTimer) {
            return;
          }
          const index = text.length - this.textTimer.repeatCount;
          this.message.setText(text.slice(0, index));
          const advance = () => {
            if (!current()) {
              return;
            }
            apply(index);
            if (index === text.length) {
              finish();
            }
          };
          const charDelay = delayMap.get(index);
          const frames = fadeMap.get(index);
          if (charDelay) {
            this.textTimer.paused = true;
            this.pauseTween = globalScene.tweens.addCounter({
              duration: getFrameMs(charDelay),
              onComplete: () => {
                if (current()) {
                  this.pauseTween = null;
                  if (this.textTimer) {
                    this.textTimer.paused = false;
                  }
                  advance();
                }
              },
            });
          } else if (frames) {
            fade(index, frames);
          } else {
            advance();
          }
        },
        repeat: text.length,
      });
    } else {
      this.message.setText(text);
      finish();
    }
    this.getUi().updateMessagePointer?.();
  }

  showPrompt(callback?: (() => void) | null, callbackDelay?: number | null) {
    const textDisplayId = this.textDisplayId;
    this.pointerMessagePending = true;
    const wrappedTextLines = this.message.runWordWrap(this.message.text).split(/\n/g);
    const textLinesCount = wrappedTextLines.length;
    const lastTextLine = wrappedTextLines.at(-1) ?? "";
    const lastLineTest = globalScene.add.text(0, 0, lastTextLine, {
      font: "96px emerald",
    });
    lastLineTest.setScale(this.message.scale);
    const lastLineWidth = lastLineTest.displayWidth;
    lastLineTest.destroy();
    if (this.prompt) {
      this.prompt.setPosition(this.message.x + lastLineWidth + 2, this.message.y + (textLinesCount - 1) * 18 + 2);
      this.prompt.play("prompt");
    }
    this.pendingPrompt = false;
    this.awaitingActionInput = true;
    this.onActionInput = () => {
      if (textDisplayId !== this.textDisplayId) {
        return;
      }
      this.awaitingActionInput = false;
      this.onActionInput = null;
      this.prompt?.anims.stop();
      this.prompt?.setVisible(false);
      const complete = () => {
        if (textDisplayId === this.textDisplayId) {
          this.pointerMessagePending = false;
          this.textCallbackTimer = null;
          callback?.();
          this.getUi().updateMessagePointer?.();
        }
      };
      if (callback && callbackDelay) {
        this.textCallbackTimer = globalScene.time.delayedCall(callbackDelay, complete);
      } else {
        complete();
      }
    };
    this.getUi().updateMessagePointer?.();
  }

  /**
   * Show a name above the text.
   * @param name - The name to show
   * @param iconFrame - The frame of the icon to display next to the name
   * @remarks
   * the icon must be from the `items` atlas
   */
  public showNameText(name: string, iconFrame?: string): void {
    if (!this.nameBoxContainer) {
      console.warn("Called `showNameText` without initializing the name box");
      return;
    }
    this.nameBoxContainer.setVisible(true);
    this.nameText.setText(name);

    if (iconFrame) {
      this.nameIcon.setTexture("items", iconFrame);
      this.nameIcon.setVisible(true);
      this.nameIcon.setScale(0.5);
      this.nameText.x = this.nameIcon.x + this.nameIcon.displayWidth + 4;
    } else {
      this.nameIcon.setVisible(false);
      this.nameText.x = 8;
    }

    this.nameBox.width = this.nameText.displayWidth + (this.nameIcon.visible ? this.nameIcon.displayWidth + 4 : 0) + 16;
  }

  public hideNameText(): void {
    this.nameBoxContainer?.setVisible(false);
  }

  isTextAnimationInProgress() {
    return !!this.finishText;
  }

  clearText() {
    this.stopMessage();
    this.message.setText("");
    this.getUi().updateMessagePointer?.();
  }

  clear() {
    this.stopMessage();
    super.clear();
    this.getUi().updateMessagePointer?.();
  }

  override destroy(): void {
    this.stopMessage();
    this.active = false;
    this.getUi().updateMessagePointer?.();
    super.destroy();
  }
}
