import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { PointerModalUiHandler } from "#ui/pointer-modal-ui-handler";
import { addTextObject } from "#ui/text";
import i18next from "i18next";

export class LoadingModalUiHandler extends PointerModalUiHandler {
  private generation = 0;
  private readonly operationTimers = new Set<Phaser.Time.TimerEvent>();

  /** Timers belonging to this waiting display are canceled when it is replaced. */
  public addOperationTimer(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    const displayId = this.displayId;
    const timer = globalScene.time.delayedCall(delay, () => {
      this.operationTimers.delete(timer);
      if (this.active && this.getUi().getHandler() === this && displayId === this.displayId) {
        callback();
      }
    });
    this.operationTimers.add(timer);
    return timer;
  }

  public get displayId(): number {
    return this.generation;
  }

  override show(args: any[]): boolean {
    this.clear();
    this.generation++;
    return super.show(args);
  }

  override clear(): void {
    this.generation++;
    for (const timer of this.operationTimers) {
      timer.remove();
    }
    this.operationTimers.clear();
    super.clear();
  }

  override destroy(): void {
    this.clear();
    this.modalContainer.destroy();
  }

  getModalTitle(): string {
    return "";
  }

  getWidth(): number {
    return 80;
  }

  getHeight(): number {
    return 32;
  }

  getMargin(): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(): string[] {
    return [];
  }

  setup(): void {
    super.setup();

    const label = addTextObject(this.getWidth() / 2, this.getHeight() / 2, i18next.t("menu:loading"), TextStyle.WINDOW);
    label.setOrigin(0.5, 0.5);

    this.modalContainer.add(label);
  }
}
