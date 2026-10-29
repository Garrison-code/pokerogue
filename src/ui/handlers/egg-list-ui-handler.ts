import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { PokemonIconAnimMode } from "#enums/pokemon-icon-anim-mode";
import { TextStyle } from "#enums/text-style";
import { MessageUiHandler } from "#ui/message-ui-handler";
import { PokemonIconAnimHelper } from "#ui/pokemon-icon-anim-helper";
import { ScrollBar } from "#ui/scroll-bar";
import { ScrollableGridHelper } from "#ui/scrollable-grid-helper";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";
import { UiPointerTargets } from "#ui/utils/ui-pointer-targets";
import i18next from "i18next";

export class EggListUiHandler extends MessageUiHandler {
  private pointerTargets: UiPointerTargets | undefined;

  private readonly ROWS = 9;
  private readonly COLUMNS = 11;

  private eggListContainer: Phaser.GameObjects.Container;
  private eggListIconContainer: Phaser.GameObjects.Container;
  private eggIcons: Phaser.GameObjects.Sprite[];
  private eggSprite: Phaser.GameObjects.Sprite;
  private eggNameText: Phaser.GameObjects.Text;
  private eggDateText: Phaser.GameObjects.Text;
  private eggHatchWavesText: Phaser.GameObjects.Text;
  private eggGachaInfoText: Phaser.GameObjects.Text;
  private eggListMessageBoxContainer: Phaser.GameObjects.Container;

  private cursorObj: Phaser.GameObjects.Image;
  private scrollGridHandler: ScrollableGridHelper;

  private iconAnimHandler: PokemonIconAnimHelper;

  setup() {
    const ui = this.getUi();

    this.eggListContainer = globalScene.add.container(0, -globalScene.scaledCanvas.height).setVisible(false);
    ui.add(this.eggListContainer);

    const bgColor = globalScene.add
      .rectangle(0, 0, globalScene.scaledCanvas.width, globalScene.scaledCanvas.height, 0x006860)
      .setOrigin(0);

    const eggListBg = globalScene.add.image(0, 0, "egg_list_bg").setOrigin(0);

    this.iconAnimHandler = new PokemonIconAnimHelper();

    this.eggNameText = addTextObject(8, 68, "", TextStyle.SUMMARY).setOrigin(0);

    this.eggDateText = addTextObject(8, 91, "", TextStyle.EGG_LIST);

    this.eggHatchWavesText = addTextObject(8, 108, "", TextStyle.EGG_LIST).setWordWrapWidth(540);

    this.eggGachaInfoText = addTextObject(8, 152, "", TextStyle.EGG_LIST).setWordWrapWidth(540);

    this.eggListIconContainer = globalScene.add.container(113, 5);

    this.cursorObj = globalScene.add.image(0, 0, "select_cursor").setOrigin(0);

    this.eggSprite = globalScene.add.sprite(54, 37, "egg");

    const scrollBar = new ScrollBar(310, 5, 4, 170, this.ROWS);

    this.scrollGridHandler = new ScrollableGridHelper(this, this.ROWS, this.COLUMNS)
      .withPointerSelection(visible => this.cursorObj.setVisible(visible))
      .withScrollBar(scrollBar)
      .withUpdateGridCallBack(() => this.updateEggIcons())
      .withUpdateSingleElementCallback((i: number) => this.setEggDetails(i));

    this.eggListMessageBoxContainer = globalScene.add.container(0, globalScene.scaledCanvas.height).setVisible(false);

    const eggListMessageBox = addWindow(1, -1, 318, 28).setOrigin(0, 1);
    this.eggListMessageBoxContainer.add(eggListMessageBox);

    // Message isn't used, but is expected to exist as this subclasses MessageUiHandler
    this.message = addTextObject(8, -8, "", TextStyle.WINDOW, { maxLines: 1 }).setActive(false).setVisible(false);

    this.cursor = -1;

    this.eggListContainer.add([
      bgColor,
      eggListBg,
      addWindow(1, 85, 106, 22),
      addWindow(1, 102, 106, 50, true),
      addWindow(1, 147, 106, 32, true),
      addWindow(107, 1, 212, 178),
      this.eggNameText,
      this.eggDateText,
      this.eggHatchWavesText,
      this.eggGachaInfoText,
      this.eggListIconContainer,
      this.cursorObj,
      this.eggSprite,
      scrollBar,
    ]);
  }

  override show(args: any[]): boolean {
    super.show(args);

    this.pointerTargets?.destroy();
    this.eggListIconContainer.removeAll(true);
    this.iconAnimHandler.removeAll();
    this.cursor = -1;
    this.initEggIcons();

    this.getUi().bringToTop(this.eggListContainer);

    this.eggListContainer.setVisible(true);

    this.scrollGridHandler.setTotalElements(globalScene.gameData.eggs.length);

    this.updateEggIcons();
    if (this.eggIcons.length > 0) {
      this.scrollGridHandler.selectIndex(0);
    } else {
      this.cursorObj.setVisible(false);
      this.eggSprite.setVisible(false);
      for (const text of [this.eggNameText, this.eggDateText, this.eggHatchWavesText, this.eggGachaInfoText]) {
        text.setText("");
      }
    }
    this.pointerTargets = new UiPointerTargets(this);
    const page = this.pointerTargets.add(this.eggListContainer, "egg-list-page", () => ({
      x: 0,
      y: 0,
      width: globalScene.scaledCanvas.width,
      height: globalScene.scaledCanvas.height,
    }));
    this.eggListContainer.moveTo(page, 1);
    const wheel = (direction: number) => this.scrollGridHandler.scrollByPointer(direction);
    this.pointerTargets.add(
      this.eggListIconContainer,
      "egg-list-grid",
      () => ({ x: -3, y: 0, width: 198, height: 162 }),
      undefined,
      wheel,
    );
    this.eggIcons.forEach((_icon, i) =>
      this.pointerTargets!.add(
        this.eggListIconContainer,
        `egg-list-cell-${i}`,
        () =>
          i + this.scrollGridHandler.getItemOffset() < globalScene.gameData.eggs.length
            ? { x: (i % this.COLUMNS) * 18 - 3, y: Math.floor(i / this.COLUMNS) * 18, width: 18, height: 18 }
            : null,
        () => {
          if (this.scrollGridHandler.selectIndex(i + this.scrollGridHandler.getItemOffset())) {
            this.getUi().playSelect();
          }
        },
        wheel,
      ),
    );

    return true;
  }

  /**
   * Create the grid of egg icons to display
   */
  private initEggIcons() {
    this.eggIcons = [];
    for (let i = 0; i < Math.min(this.ROWS * this.COLUMNS, globalScene.gameData.eggs.length); i++) {
      const x = (i % this.COLUMNS) * 18;
      const y = Math.floor(i / this.COLUMNS) * 18;
      const icon = globalScene.add
        .sprite(x - 2, y + 2, "egg_icons")
        .setScale(0.5)
        .setOrigin(0);
      this.eggListIconContainer.add(icon);
      this.eggIcons.push(icon);
    }
  }

  /**
   * Show the grid of egg icons
   */
  private updateEggIcons() {
    const indexOffset = this.scrollGridHandler.getItemOffset();
    const eggsToShow = Math.min(this.eggIcons.length, globalScene.gameData.eggs.length - indexOffset);
    this.eggIcons.forEach((icon, i) => {
      this.iconAnimHandler.addOrUpdate(
        icon,
        i + indexOffset === this.scrollGridHandler.getSelectedIndex()
          ? PokemonIconAnimMode.ACTIVE
          : PokemonIconAnimMode.NONE,
      );
      if (i < eggsToShow) {
        const egg = globalScene.gameData.eggs[i + indexOffset];
        icon.setFrame(egg.getKey()).setVisible(true);
      } else {
        icon.setVisible(false);
      }
    });
  }

  /**
   * Update the information panel with the information of the given egg
   * @param index which egg in the list to display the info for
   */
  private setEggDetails(index: number): void {
    const egg = globalScene.gameData.eggs[index];
    if (!egg) {
      return;
    }
    this.eggSprite.setVisible(true);
    this.eggSprite.setFrame(`egg_${egg.getKey()}`);
    this.eggNameText.setText(`${i18next.t("egg:egg")} (${egg.getEggDescriptor()})`);
    this.eggDateText.setText(
      new Date(egg.timestamp).toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "numeric",
      }),
    );
    this.eggHatchWavesText.setText(egg.getEggHatchWavesMessage());
    this.eggGachaInfoText.setText(egg.getEggTypeDescriptor());
  }

  processInput(button: Button): boolean {
    const ui = this.getUi();

    let success = false;

    if (button === Button.CANCEL) {
      ui.revertMode();
      success = true;
    } else {
      success = this.scrollGridHandler.processInput(button);
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  setCursor(cursor: number): boolean {
    if (cursor < 0 || !this.eggIcons[cursor]) {
      return false;
    }
    let changed = false;

    const lastCursor = this.cursor;

    changed = super.setCursor(cursor);

    if (changed) {
      const icon = this.eggIcons[cursor];
      this.cursorObj.setPositionRelative(icon, 114, 5);

      if (lastCursor > -1) {
        this.iconAnimHandler.addOrUpdate(this.eggIcons[lastCursor], PokemonIconAnimMode.NONE);
      }
      this.iconAnimHandler.addOrUpdate(icon, PokemonIconAnimMode.ACTIVE);

      this.setEggDetails(cursor + this.scrollGridHandler.getItemOffset());
    }

    return changed;
  }

  override destroy(): void {
    this.clear();
    this.eggListContainer.destroy();
    super.destroy();
  }

  clear(): void {
    this.pointerTargets?.destroy();
    this.pointerTargets = undefined;
    super.clear();
    this.scrollGridHandler.reset();
    this.cursor = -1;
    this.eggListContainer.setVisible(false);
    this.iconAnimHandler.removeAll();
    this.eggListIconContainer.removeAll(true);
    this.eggIcons = [];
  }
}
