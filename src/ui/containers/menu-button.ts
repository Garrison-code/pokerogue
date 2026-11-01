import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { getTextColor } from "#ui/text";
import { addWindow } from "#ui/ui-theme";

/** A mouse entry to the same MENU action used by keyboard and gamepad. */
export class MenuButton extends Phaser.GameObjects.Container {
  constructor() {
    super(globalScene, globalScene.scaledCanvas.width - 22, -globalScene.scaledCanvas.height + 2);
    this.setName("mouse-menu-button");
    const background = addWindow(0, 0, 20, 20);
    const color = Number.parseInt(getTextColor(TextStyle.WINDOW).replace("#", ""), 16);
    const lines = [7, 9, 11].map(y => globalScene.add.rectangle(6, y, 8, 1, color).setOrigin(0));
    const target = globalScene.add.zone(0, 0, 20, 20).setOrigin(0).setInteractive();
    target.setName("mouse-menu-entry");
    target.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (pointer.wasTouch || !this.available()) {
          return;
        }
        if (pointer.rightButtonDown()) {
          globalScene.ui.processInput(Button.CANCEL);
        } else if (pointer.leftButtonDown()) {
          globalScene.uiInputs.buttonMenu();
        }
        this.refresh();
      },
    );
    target.on(
      "wheel",
      (_p: Phaser.Input.Pointer, _x: number, _y: number, _z: number, event: Phaser.Types.Input.EventData) =>
        event.stopPropagation(),
    );
    this.add([background, ...lines, target]);
    globalScene.events.on("preupdate", this.refresh, this);
    this.refresh();
  }

  private available(): boolean {
    const { ui, uiInputs } = globalScene;
    return !!uiInputs?.canOpenMenu() && ui.canProcessPointerInput(ui.getHandler());
  }

  private refresh(): void {
    const visible = this.available();
    this.setVisible(visible);
    const target = this.getByName("mouse-menu-entry") as Phaser.GameObjects.Zone;
    if (visible) {
      target.setInteractive();
      this.parentContainer?.bringToTop(this);
    } else {
      target.disableInteractive();
    }
    globalScene.reserveMenuButtonSpace(visible);
  }

  public override destroy(fromScene?: boolean): void {
    globalScene.events.off("preupdate", this.refresh, this);
    globalScene.reserveMenuButtonSpace(false);
    super.destroy(fromScene);
  }
}
