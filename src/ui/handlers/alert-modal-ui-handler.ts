import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import type { ModalConfig } from "#types/ui-types";
import { ModalUiHandler } from "#ui/modal-ui-handler";
import { addTextObject } from "#ui/text";
import { playTween } from "#utils/anim-utils";
import { fixedInt } from "#utils/common";

export class AlertModalUiHandler extends ModalUiHandler {
  private label: Phaser.GameObjects.Text;
  private allowClosing = false;
  private closing = false;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private readonly fadingOverlays = new Set<Phaser.GameObjects.Rectangle>();
  private closeDelayTimer: Phaser.Time.TimerEvent | null = null;
  private pointerZone: Phaser.GameObjects.Zone | null = null;

  private width = 250;
  private height = 32;

  public override getModalTitle(): string {
    return "";
  }

  public override getWidth(): number {
    return this.width;
  }

  public override getHeight(): number {
    return this.height;
  }

  public override getMargin(): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  public override getButtonLabels(): string[] {
    return [];
  }

  public override setup(): void {
    super.setup();
    // This modal uses its frame and full-screen overlay as explicit input targets.
    this.modalContainer.disableInteractive();

    this.label = addTextObject(
      this.getWidth() / 2,
      this.getHeight() / 2,
      "This is a placeholder message for the alert UI.\nIf you are reading this, someone forgot to set a message for this alert.",
      TextStyle.WINDOW,
      { fontSize: "48px", align: "center" },
    ) //
      .setOrigin(0.5, 0.5);

    this.modalContainer.add(this.label);
  }

  /**
   * Show the alert modal with the specified message.
   * @param args - \
   * `message`: The message that will be displayed in the alert box. \
   * `closeDelay`: Optional delay before allowing the user to close the modal. If not provided, the alert will be unclosable.
   */
  public override show(args: [message: string, closeDelay?: number]): boolean {
    this.clear();
    this.closing = false;
    const config: ModalConfig = { buttonActions: [] };

    const msg = args[0];
    if (msg) {
      this.label.setText(msg);

      this.width = Math.ceil(this.label.displayWidth) + 20;
      this.label.x = this.getWidth() / 2;

      this.height = Math.ceil(this.label.displayHeight) + 16;
      this.label.y = this.getHeight() / 2;
    }

    const { height, width } = globalScene.scaledCanvas;
    const { ui } = globalScene;

    const overlay = new Phaser.GameObjects.Rectangle(globalScene, 0, -height, width, height, 0x070707)
      .setName("egg-compensation-overlay")
      .setOrigin(0)
      .setAlpha(0)
      .setInteractive();
    overlay.on("pointerdown", this.consumePointerDown, this);
    overlay.on("wheel", this.consumeWheel, this);
    this.overlay = overlay;
    ui.add(overlay);

    playTween({ targets: overlay, alpha: 0.7, duration: 750, ease: "Sine.easeOut" });

    const shown = super.show([config]);
    this.pointerZone = globalScene.add
      .zone(0, 0, this.getWidth(), this.getHeight())
      .setName("alert-pointer-zone")
      .setOrigin(0)
      .setInteractive();
    this.pointerZone.on("pointerdown", this.onPointerDown, this);
    this.pointerZone.on("wheel", this.consumeWheel, this);
    this.modalContainer.add(this.pointerZone);

    const delay = args[1];
    this.allowClosing = false;
    if (delay != null) {
      this.closeDelayTimer = globalScene.time.delayedCall(fixedInt(delay), () => {
        if (this.overlay === overlay && this.active && !this.closing) {
          this.closeDelayTimer = null;
          this.allowClosing = true;
        }
      });
    }
    return shown;
  }

  public override processInput(): boolean {
    const ui = this.getUi();
    if (
      !this.allowClosing
      || this.closing
      || ui.mode !== UiMode.ALERT_MODAL
      || ui.modeChain.length === 0
      || !this.overlay
    ) {
      return false;
    }

    this.closing = true;
    // Transfer ownership before revertMode clears this handler; keep blocking the
    // background until this particular overlay has finished fading out.
    const overlay = this.overlay;
    this.overlay = null;
    const reverted = ui.revertMode();
    this.fadingOverlays.add(overlay);
    globalScene.tweens.killTweensOf(overlay);
    ui.bringToTop(overlay);
    reverted
      .then(() => {
        if (this.fadingOverlays.has(overlay)) {
          return playTween({ targets: overlay, alpha: 0, duration: 500, ease: "Sine.easeOut" });
        }
      })
      .then(() => {
        if (this.fadingOverlays.has(overlay)) {
          this.removeOverlay(overlay);
        }
      });
    return true;
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void {
    event.stopPropagation();
    const ui = this.getUi();
    if (pointer.leftButtonDown() && !pointer.wasTouch && ui.canProcessPointerInput(this)) {
      ui.processInput(Button.ACTION);
    }
  }

  private consumePointerDown(
    _pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void {
    event.stopPropagation();
  }

  private consumeWheel(
    _pointer: Phaser.Input.Pointer,
    _deltaX: number,
    _deltaY: number,
    _deltaZ: number,
    event: Phaser.Types.Input.EventData,
  ): void {
    event.stopPropagation();
  }

  private removeOverlay(overlay: Phaser.GameObjects.Rectangle): void {
    globalScene.tweens.killTweensOf(overlay);
    overlay.destroy();
    this.fadingOverlays.delete(overlay);
  }

  public override clear(): void {
    super.clear();
    this.allowClosing = false;
    this.closeDelayTimer?.remove();
    this.closeDelayTimer = null;
    this.pointerZone?.destroy();
    this.pointerZone = null;
    if (this.overlay) {
      this.removeOverlay(this.overlay);
      this.overlay = null;
    }
    for (const overlay of this.fadingOverlays) {
      this.removeOverlay(overlay);
    }
  }

  public override destroy(): void {
    this.clear();
    this.modalContainer.destroy();
    super.destroy();
  }
}
