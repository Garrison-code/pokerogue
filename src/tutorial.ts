import { globalScene } from "#app/global-scene";
import { settings } from "#app/global-settings-manager";
import { activeOverrides } from "#app/overrides";
import { UiMode } from "#enums/ui-mode";
import { AwaitableUiHandler } from "#ui/awaitable-ui-handler";
import { MessageUiHandler } from "#ui/message-ui-handler";
import type { UiHandler } from "#ui/ui-handler";
import i18next from "i18next";

export enum Tutorial {
  INTRO = "INTRO",
  ACCESS_MENU = "ACCESS_MENU",
  MENU = "MENU",
  STARTER_SELECT = "STARTER_SELECT",
  POKEDEX = "POKEDEX",
  POKERUS = "POKERUS",
  STAT_CHANGE = "STAT_CHANGE",
  SELECT_ITEM = "SELECT_ITEM",
  EGG_GACHA = "EGG_GACHA",
}

/** Internal lifetime of one tutorial, including its overlay and delegated message handler. */
export class TutorialRun {
  readonly owner: UiHandler;
  readonly scene = globalScene;
  readonly ui = globalScene.ui;
  message: MessageUiHandler | null = null;
  inputReady = false;
  private active = true;
  private expectedMode: UiMode | null = null;
  private readonly originalDisableMenu: boolean;
  private readonly handlers = new Map<AwaitableUiHandler, boolean>();
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  private readonly pending = new Set<(success: boolean) => void>();
  private fieldOverlay: Phaser.GameObjects.Rectangle | null = null;
  private fieldAlpha = 0;

  constructor(owner: UiHandler) {
    this.owner = owner;
    this.ui.tutorialSession?.cancel();
    this.originalDisableMenu = this.scene.disableMenu;
    this.ui.tutorialSession = this;
    this.scene.disableMenu = true;
    this.adopt(owner);
    this.ui.updateMessagePointer();
  }

  private adopt(handler: UiHandler): void {
    if (handler instanceof AwaitableUiHandler && !this.handlers.has(handler)) {
      this.handlers.set(handler, handler.tutorialActive);
      handler.tutorialActive = true;
    }
  }

  private current(): boolean {
    return this.active && this.ui.tutorialSession === this && globalScene === this.scene;
  }

  get valid(): boolean {
    return this.current();
  }

  /** Only the explicit SELECT_ITEM handoff may change modes during a tutorial. */
  onModeChange(mode: UiMode): void {
    if (mode !== this.expectedMode) {
      this.cancel();
    }
  }

  onHandlerCleared(handler: UiHandler): void {
    if (handler === this.owner || handler === this.message) {
      this.cancel();
    }
  }

  onHandlerShown(handler: UiHandler): void {
    if (this.expectedMode === null && (handler === this.owner || handler === this.message)) {
      this.cancel();
    }
  }

  private wait(start: (complete: () => void) => void): Promise<boolean> {
    if (!this.current()) {
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      const finish = (success: boolean) => {
        this.pending.delete(finish);
        resolve(success);
      };
      this.pending.add(finish);
      start(() => finish(this.current()));
    });
  }

  private animate(
    target: Phaser.GameObjects.Rectangle | undefined,
    alpha: number,
    duration: number,
    ease: string,
  ): Promise<boolean> {
    if (!target) {
      return Promise.resolve(this.current());
    }
    return this.wait(complete => {
      let completed = false;
      const tween = this.scene.tweens.add({
        targets: target,
        alpha,
        duration,
        ease,
        onComplete: () => {
          completed = true;
          complete();
        },
      });
      if (!completed) {
        this.tweens.add(tween);
      }
    });
  }

  overlay(visible: boolean): Promise<boolean> {
    this.inputReady = false;
    this.ui.updateMessagePointer();
    const target = this.owner instanceof AwaitableUiHandler ? this.owner.tutorialOverlay : undefined;
    return this.animate(target, visible ? 0.6 : 0, visible ? 750 : 500, "Sine.easeOut");
  }

  field(visible: boolean): Promise<boolean> {
    this.inputReady = false;
    if (!this.fieldOverlay) {
      this.fieldOverlay = this.scene.fieldUI.getByName("rect-field-overlay") as Phaser.GameObjects.Rectangle | null;
      this.fieldAlpha = this.fieldOverlay?.alpha ?? 0;
    }
    return this.animate(
      this.fieldOverlay ?? undefined,
      visible ? 0.5 : 0,
      1000,
      visible ? "Sine.easeOut" : "Cubic.easeIn",
    );
  }

  text(text: string, dialogue = false, prompt = true): Promise<boolean> {
    if (!this.current()) {
      return Promise.resolve(false);
    }
    this.message = this.ui.getCurrentMessageHandler();
    this.adopt(this.message);
    this.inputReady = true;
    return this.wait(complete => {
      if (dialogue) {
        this.ui.showDialogue(text, i18next.t("tutorial:name"), null, complete);
      } else {
        this.ui.showText(text, null, complete, null, prompt);
      }
      this.ui.updateMessagePointer();
    });
  }

  setMode(mode: UiMode): Promise<boolean> {
    if (!this.current()) {
      return Promise.resolve(false);
    }
    this.inputReady = false;
    this.expectedMode = mode;
    return this.wait(complete => {
      this.ui.setModeWithoutClear(mode).then(
        () => {
          if (this.current()) {
            this.adopt(this.ui.getHandler());
            this.expectedMode = null;
          }
          complete();
        },
        () => this.cancel(),
      );
    });
  }

  finish(): void {
    this.dispose(false);
  }

  cancel(): void {
    this.dispose(true);
  }

  private dispose(cancelled: boolean): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.inputReady = false;
    for (const tween of this.tweens) {
      tween.remove();
    }
    this.tweens.clear();
    for (const complete of [...this.pending]) {
      complete(false);
    }
    if (this.ui.tutorialSession === this) {
      this.ui.tutorialSession = null;
      for (const [handler, original] of this.handlers) {
        handler.tutorialActive = original;
        if (cancelled && handler instanceof MessageUiHandler) {
          handler.showText("", 0);
        }
      }
      if (this.owner instanceof AwaitableUiHandler) {
        this.owner.tutorialOverlay?.setAlpha(0);
      }
      if (cancelled) {
        this.fieldOverlay?.setAlpha(this.fieldAlpha);
      }
      if (globalScene === this.scene) {
        this.scene.disableMenu = this.originalDisableMenu;
      }
      this.ui.updateMessagePointer();
    }
  }
}

async function playTutorial(run: TutorialRun, tutorial: Tutorial): Promise<boolean> {
  if (tutorial === Tutorial.INTRO) {
    return run.text(i18next.t("tutorial:intro"));
  }
  if (tutorial === Tutorial.ACCESS_MENU && settings.general.enableTouchControls) {
    return true;
  }
  if ((tutorial === Tutorial.ACCESS_MENU || tutorial === Tutorial.STAT_CHANGE) && !(await run.field(true))) {
    return false;
  }
  if (tutorial === Tutorial.SELECT_ITEM && !(await run.setMode(UiMode.MESSAGE))) {
    return false;
  }
  const keys: Partial<Record<Tutorial, string>> = {
    [Tutorial.ACCESS_MENU]: "accessMenu",
    [Tutorial.MENU]: "menu",
    [Tutorial.STARTER_SELECT]: "starterSelect",
    [Tutorial.POKERUS]: "pokerus",
    [Tutorial.STAT_CHANGE]: "statChange",
    [Tutorial.SELECT_ITEM]: "selectItem",
    [Tutorial.EGG_GACHA]: "eggGacha",
  };
  const key = keys[tutorial];
  if (!key || !(await run.text(i18next.t(`tutorial:${key}`), true))) {
    return false;
  }
  if (tutorial !== Tutorial.ACCESS_MENU && !(await run.text("", false, false))) {
    return false;
  }
  if ((tutorial === Tutorial.ACCESS_MENU || tutorial === Tutorial.STAT_CHANGE) && !(await run.field(false))) {
    return false;
  }
  if (tutorial === Tutorial.SELECT_ITEM && !(await run.setMode(UiMode.MODIFIER_SELECT))) {
    return false;
  }
  return true;
}

/** Run an unseen tutorial; interruption resolves false without recording it as seen. */
export async function handleTutorial(tutorial: Tutorial): Promise<boolean> {
  if (tutorial === Tutorial.POKEDEX) {
    // This enum entry has no tutorial content or caller yet.
    return false;
  }
  if (
    !activeOverrides.BYPASS_TUTORIAL_SKIP_OVERRIDE
    && (!settings.general.enableTutorials || globalScene.gameData.getTutorialFlags()[tutorial])
  ) {
    return false;
  }
  const run = new TutorialRun(globalScene.ui.getHandler());
  let completed = false;
  try {
    if (
      !(await run.overlay(true))
      || !(await playTutorial(run, tutorial))
      || !(await run.overlay(false))
      || !run.valid
    ) {
      return false;
    }
    if (tutorial === Tutorial.MENU) {
      run.scene.gameData.saveTutorialFlag(Tutorial.ACCESS_MENU, true);
    }
    run.scene.gameData.saveTutorialFlag(tutorial, true);
    completed = true;
    return true;
  } finally {
    if (completed) {
      run.finish();
    } else {
      run.cancel();
    }
  }
}
