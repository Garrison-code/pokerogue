import { MockText } from "#test/mocks/mocks-container/mock-text";
import Phaser from "phaser";

export class MockInputText extends MockText {
  private readonly events = new Phaser.Events.EventEmitter();
  public node = document.createElement("input");

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
  setMaxLength(length: number): this {
    this.node.maxLength = length;
    return this;
  }
  setFocus(): this {
    this.node.focus();
    return this;
  }
  override destroy(): void {
    this.events.removeAllListeners();
    this.node.remove();
    super.destroy();
  }

  public inputType: string;
  public selectionStart: number;
  public selectionEnd: number;
  public selectedText: string;

  constructor(textureManager, x, y, _w, _h, content, styleOptions) {
    super(textureManager, x, y, content, styleOptions);
  }

  selectText(_selectionStart?: number, _selectionEnd?: number) {}

  selectAll() {}

  setCursorPosition(_value: number) {}

  scrollToBottom() {}

  resize(_width: number, _height: number) {}

  setElement(_element, _style, _innerText) {}
}
