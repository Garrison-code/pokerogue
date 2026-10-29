import { updateUserInfo } from "#app/account";
import { audioManager } from "#app/global-audio-manager";
import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import type { ModalConfig } from "#types/ui-types";
import { PointerModalUiHandler } from "#ui/pointer-modal-ui-handler";
import { addTextObject } from "#ui/text";
import { sessionIdKey } from "#utils/common";
import { removeCookie } from "#utils/cookies";
import i18next from "i18next";

export class UnavailableModalUiHandler extends PointerModalUiHandler {
  private reconnectDuration: number;
  private reconnectCallback: (() => void) | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private requesting = false;
  private completed = false;

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.active && !this.completed && this.getUi().getHandler() === this;
  }

  private stopReconnect(): void {
    this.generation++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.requesting = false;
    this.completed = true;
    this.reconnectCallback = undefined;
  }

  private scheduleReconnect(delay: number): void {
    clearTimeout(this.reconnectTimer);
    const generation = this.generation;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.isCurrent(generation)) {
        void this.tryReconnect();
      }
    }, delay);
  }

  override clear(): void {
    this.stopReconnect();
    super.clear();
  }

  private readonly minTime = 1000 * 5;
  private readonly maxTime = 1000 * 60 * 5;

  private readonly randVarianceTime = 1000 * 10;

  constructor() {
    super();

    this.reconnectDuration = this.minTime;
  }

  getModalTitle(): string {
    return "";
  }

  getWidth(): number {
    return 160;
  }

  getHeight(): number {
    return 64;
  }

  getMargin(): [number, number, number, number] {
    return [0, 0, 48, 0];
  }

  getButtonLabels(): string[] {
    return [];
  }

  setup(): void {
    super.setup();

    const label = addTextObject(
      this.getWidth() / 2,
      this.getHeight() / 2,
      i18next.t("menu:errorServerDown"),
      TextStyle.WINDOW,
      { fontSize: "48px", align: "center" },
    );
    label.setOrigin(0.5, 0.5);

    this.modalContainer.add(label);
  }

  async tryReconnect(): Promise<void> {
    const generation = this.generation;
    if (!this.isCurrent(generation) || this.requesting) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.requesting = true;
    let response: [boolean, number];
    try {
      response = await updateUserInfo();
    } catch {
      response = [false, 500];
    }
    if (!this.isCurrent(generation)) {
      return;
    }
    this.requesting = false;
    if (response[0] || [200, 400].includes(response[1])) {
      this.completed = true;
      this.reconnectDuration = this.minTime;
      audioManager.playSound("se/pb_bounce_1");
      this.reconnectCallback?.();
    } else if (response[1] === 401) {
      this.completed = true;
      removeCookie(sessionIdKey);
      globalScene.reset(true, true);
    } else {
      this.reconnectDuration = Math.min(this.reconnectDuration * 2, this.maxTime);
      this.scheduleReconnect(this.reconnectDuration + Math.random() * this.randVarianceTime);
    }
  }

  override show(args: any[]): boolean {
    this.stopReconnect();
    if (args.length === 0 || typeof args[0] !== "function") {
      return false;
    }
    const config: ModalConfig = { buttonActions: [] };
    if (!super.show([config])) {
      return false;
    }
    this.reconnectCallback = args[0];
    this.reconnectDuration = this.minTime;
    this.completed = false;
    this.scheduleReconnect(this.reconnectDuration);
    return true;
  }
}
