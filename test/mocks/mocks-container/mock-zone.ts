import type { MockGameObject } from "#test/mocks/mock-game-object";
import Phaser from "phaser";

/** Non-rendering input target; real geometry and hit testing are checked in the browser. */
export class MockZone extends Phaser.Events.EventEmitter implements MockGameObject {
  public name: string;
  public active = true;
  public visible = true;

  public setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  public setOrigin(_x: number): this {
    return this;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  public setPosition(_x: number, _y: number): this {
    return this;
  }

  public setSize(_width: number, _height: number): this {
    return this;
  }

  public setInteractive(): this {
    return this;
  }

  public addedToScene(): void {}

  public removedFromScene(): void {}

  public removeFromDisplayList(): this {
    return this;
  }

  public addToDisplayList(): this {
    return this;
  }

  public disableInteractive(): this {
    return this;
  }

  public destroy(): void {
    this.active = false;
    this.removeAllListeners();
  }
}
