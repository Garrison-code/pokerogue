import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import type { UiHandler } from "#ui/ui-handler";

interface PointerArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Local-coordinate hit areas owned by a single visible UI handler. */
export class UiPointerTargets {
  readonly zones: Phaser.GameObjects.Zone[] = [];
  private readonly updates: (() => void)[] = [];

  private readonly handler: UiHandler;

  constructor(handler: UiHandler) {
    this.handler = handler;
    globalScene.events.on("preupdate", this.update, this);
  }

  add(
    parent: Phaser.GameObjects.Container,
    name: string,
    area: () => PointerArea | null,
    action?: () => void,
    wheel?: (direction: number) => void,
  ): Phaser.GameObjects.Zone {
    const zone = globalScene.add.zone(0, 0, 1, 1).setOrigin(0).setName(name);
    parent.add(zone);
    const update = () => {
      const bounds = area();
      zone.setVisible(!!bounds);
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        zone.setPosition(bounds.x, bounds.y).setSize(bounds.width, bounds.height).setInteractive();
      } else {
        zone.disableInteractive();
      }
    };
    zone.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (pointer.wasTouch || !area() || !this.handler.getUi().canProcessPointerInput(this.handler)) {
          return;
        }
        if (pointer.rightButtonDown()) {
          this.handler.getUi().processInput(Button.CANCEL);
        } else if (pointer.leftButtonDown()) {
          action?.();
        }
        this.update();
      },
    );
    zone.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _dx: number, dy: number, _dz: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (!pointer.wasTouch && dy && area() && this.handler.getUi().canProcessPointerInput(this.handler)) {
          wheel?.(Math.sign(dy));
          this.update();
        }
      },
    );
    this.zones.push(zone);
    this.updates.push(update);
    update();
    return zone;
  }

  update(): void {
    for (const update of this.updates) {
      update();
    }
  }

  destroy(): void {
    globalScene.events.off("preupdate", this.update, this);
    for (const zone of this.zones) {
      zone.destroy();
    }
    this.zones.length = 0;
    this.updates.length = 0;
  }
}

/** Convert an object's rendered world bounds to a UI container's local coordinates. */
export function getPointerBounds(
  object: { visible: boolean; getBounds(): Phaser.Geom.Rectangle },
  parent: Phaser.GameObjects.Container,
): PointerArea | null {
  if (!object.visible) {
    return null;
  }
  const bounds = object.getBounds();
  const matrix = parent.getWorldTransformMatrix();
  const start = matrix.applyInverse(bounds.x, bounds.y);
  const end = matrix.applyInverse(bounds.right, bounds.bottom);
  return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
}
