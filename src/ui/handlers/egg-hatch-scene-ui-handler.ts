import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiHandler } from "#ui/ui-handler";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";

export class EggHatchSceneUiHandler extends UiHandler {
  private pointerTargets: UiPointerTargets | undefined;
  private pointerCleanups: (() => void)[] = [];
  private pointerVisited = new WeakSet<Phaser.GameObjects.GameObject>();

  private stopPointerInput(): void {
    globalScene.events.off("preupdate", this.bindHoverClicks, this);
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    for (const cleanup of this.pointerCleanups) {
      cleanup();
    }
    this.pointerCleanups = [];
    this.pointerVisited = new WeakSet();
  }

  /** Phase-owned information objects arrive after show; retain their existing hover. */
  private bindHoverClicks(): void {
    const visit = (object: Phaser.GameObjects.GameObject) => {
      if (object.input && !(object instanceof Phaser.GameObjects.Zone) && !this.pointerVisited.has(object)) {
        this.pointerVisited.add(object);
        const down = (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (pointer.wasTouch || !this.getUi().canProcessPointerInput(this)) {
            return;
          }
          if (pointer.rightButtonDown()) {
            this.getUi().processInput(Button.CANCEL);
          } else if (pointer.leftButtonDown()) {
            this.getUi().processInput(Button.ACTION);
          }
        };
        object.on("pointerdown", down);
        this.pointerCleanups.push(() => object.off("pointerdown", down));
      }
      if (object instanceof Phaser.GameObjects.Container) {
        object.list.forEach(visit);
      }
    };
    visit(this.eggHatchContainer);
  }

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
    this.stopPointerInput();
    super.show(_args);
    this.pointerTargets = new UiPointerTargets(this);
    this.pointerTargets.add(
      this.eggHatchContainer,
      "egg-hatch-page",
      () => ({
        x: 0,
        y: 0,
        width: globalScene.scaledCanvas.width,
        height: globalScene.scaledCanvas.height,
      }),
      () => this.getUi().processInput(Button.ACTION),
    );

    this.eggHatchContainer.moveTo(this.pointerTargets.zones[0], 0);
    this.pointerTargets.add(
      this.getUi(),
      "egg-hatch-message",
      () => ({ x: 0, y: -49, width: globalScene.scaledCanvas.width, height: 49 }),
      () => this.getUi().processInput(Button.ACTION),
    );
    globalScene.events.on("preupdate", this.bindHoverClicks, this);
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
    this.stopPointerInput();
    super.clear();
    this.eggHatchContainer.removeAll(true);
    this.getUi().hideTooltip();
  }
}
