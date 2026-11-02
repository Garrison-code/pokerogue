import { MockContainer } from "#test/mocks/mocks-container/mock-container";

export class MockNineslice extends MockContainer {
  readonly type = "NineSlice";
  private originX = 0.5;
  private originY = 0.5;
  override setOrigin(x = 0.5, y = x): this {
    this.originX = x;
    this.originY = y;
    return this;
  }
  override setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }
  getTopRight() {
    return { x: this.x + this.width * (1 - this.originX), y: this.y - this.height * this.originY };
  }
  getBottomRight() {
    return { x: this.x + this.width * (1 - this.originX), y: this.y + this.height * (1 - this.originY) };
  }
  getTopCenter() {
    return { x: this.x + this.width * (0.5 - this.originX), y: this.y - this.height * this.originY };
  }
  getBottomCenter() {
    return { x: this.x + this.width * (0.5 - this.originX), y: this.y + this.height * (1 - this.originY) };
  }
  getCenter() {
    return { x: this.x + this.width * (0.5 - this.originX), y: this.y + this.height * (0.5 - this.originY) };
  }

  private texture;
  private leftWidth;
  private rightWidth;
  private topHeight;
  private bottomHeight;

  constructor(textureManager, x, y, texture, frame, _width, _height, leftWidth, rightWidth, topHeight, bottomHeight) {
    super(textureManager, x, y);
    this.width = _width;
    this.height = _height;
    this.texture = texture;
    this.frame = frame;
    this.leftWidth = leftWidth;
    this.rightWidth = rightWidth;
    this.topHeight = topHeight;
    this.bottomHeight = bottomHeight;
  }
}
