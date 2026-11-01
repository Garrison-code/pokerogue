import { MockContainer } from "#test/mocks/mocks-container/mock-container";
import Phaser from "phaser";

export class MockImage extends MockContainer {
  private readonly events = new Phaser.Events.EventEmitter();

  override on(event: string | symbol, callback: (...args: any[]) => void, context?: any): this {
    this.events.on(event, callback, context);
    return this;
  }
  override off(event: string | symbol, callback?: (...args: any[]) => void, context?: any): this {
    this.events.off(event, callback, context);
    return this;
  }
  emit(event: string | symbol, ...args: any[]): boolean {
    return this.events.emit(event, ...args);
  }
  listenerCount(event: string | symbol): number {
    return this.events.listenerCount(event);
  }
  override destroy(): void {
    this.events.removeAllListeners();
    super.destroy();
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: this is intentional (?)
  private texture;

  constructor(textureManager, x, y, texture) {
    super(textureManager, x, y);
    this.texture = texture;
  }
}
