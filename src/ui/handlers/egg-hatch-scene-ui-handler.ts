import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiHandler } from "#ui/ui-handler";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";

export class EggHatchSceneUiHandler extends UiHandler {
  private pointerTargets: UiPointerTargets | undefined;
  public eggHatchContainer: Phaser.GameObjects.Container;

  /**
   * Allows subscribers to listen for events
   *
   * Current Events:
   * - {@linkcode EggEventType.EGG_COUNT_CHANGED} {@linkcode EggCountChangedEvent}
   */
  public readonly eventTarget: EventTarget = new EventTarget();

  setup() {
    this.eggHatchContainer = globalScene.add.container(0, -globalScene.scaledCanvas.height);
    globalScene.fieldUI.add(this.eggHatchContainer);

    const eggLightraysAnimFrames = globalScene.anims.generateFrameNames("egg_lightrays", { start: 0, end: 3 });
    if (!globalScene.anims.exists("egg_lightrays")) {
      globalScene.anims.create({
        key: "egg_lightrays",
        frames: eggLightraysAnimFrames,
        frameRate: 32,
      });
    }
  }

  show(_args: any[]): boolean {
    this.pointerTargets?.destroy();
    super.show(_args);
    this.pointerTargets = new UiPointerTargets(this);
    this.pointerTargets.add(
      this.getUi(),
      "egg-hatch-page",
      () => ({
        x: 0,
        y: -globalScene.scaledCanvas.height,
        width: globalScene.scaledCanvas.width,
        height: globalScene.scaledCanvas.height,
      }),
      () => this.getUi().processInput(Button.ACTION),
    );

    this.getUi().showText("", 0);

    globalScene.setModifiersVisible(false);

    return true;
  }

  processInput(button: Button): boolean {
    if (button === Button.ACTION || button === Button.CANCEL) {
      const phase = globalScene.phaseManager.getCurrentPhase();
      if (phase.is("EggHatchPhase") && phase.trySkip()) {
        return true;
      }
    }

    return globalScene.ui.getMessageHandler().processInput(button);
  }

  setCursor(_cursor: number): boolean {
    return false;
  }

  override destroy(): void {
    this.clear();
    this.eggHatchContainer.destroy();
    super.destroy();
  }

  clear() {
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    super.clear();
    this.eggHatchContainer.removeAll(true);
    this.getUi().hideTooltip();
  }
}
