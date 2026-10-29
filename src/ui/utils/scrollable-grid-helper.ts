import { Button } from "#enums/buttons";
import type { ScrollBar } from "#ui/scroll-bar";
import type { UiHandler } from "#ui/ui-handler";

type UpdateGridCallbackFunction = () => void;
type UpdateDetailsCallbackFunction = (index: number) => void;

/**
 * A helper class to handle navigation through a grid of elements that can scroll vertically
 * Needs to be used by a {@linkcode UiHandler}
 * How to use:
 * - in `UiHandler.setup`: Initialize with the {@linkcode UiHandler} that handles the grid,
 * the number of rows and columns that can be shown at once,
 * an optional {@linkcode ScrollBar}, and optional callbacks that will get called after scrolling
 * - in `UiHandler.show`: Set `setTotalElements` to the total number of elements in the list to display
 * - in `UiHandler.processInput`: call `processNavigationInput` to have it handle the cursor updates while calling the defined callbacks
 * - in `UiHandler.clear`: call `reset`
 */
export class ScrollableGridHelper {
  private readonly ROWS: number;
  private readonly COLUMNS: number;
  private handler: UiHandler;
  private totalElements: number;
  private cursor: number;
  private scrollCursor: number;
  private scrollBar?: ScrollBar;
  /** Optional function that will get called if the whole grid needs to get updated */
  private updateGridCallback?: UpdateGridCallbackFunction;
  /** Optional function that will get called if a single element's information needs to get updated */
  private updateDetailsCallback?: UpdateDetailsCallbackFunction;

  /**
   * @param rows the maximum number of rows shown at once
   * @param columns the maximum number of columns shown at once
   */
  constructor(handler: UiHandler, rows: number, columns: number) {
    this.handler = handler;
    this.ROWS = rows;
    this.COLUMNS = columns;
    this.scrollCursor = 0;
    this.cursor = 0;
    this.totalElements = rows * columns; // default value for the number of elements
  }

  /** Pointer browsing preserves the selected absolute item instead of selecting a recycled cell. */
  private pointerVisibility?: (visible: boolean) => void;

  withPointerSelection(callback: (visible: boolean) => void): ScrollableGridHelper {
    this.pointerVisibility = callback;
    return this;
  }

  getSelectedIndex(): number {
    return this.cursor + this.getItemOffset();
  }

  selectIndex(index: number): boolean {
    if (index < 0 || index >= this.totalElements) {
      return false;
    }
    const changed = this.setCursor(index - this.getItemOffset());
    this.pointerVisibility?.(true);
    return changed;
  }

  scrollByPointer(direction: number): boolean {
    const maxScroll = Math.max(0, Math.ceil(this.totalElements / this.COLUMNS) - this.ROWS);
    const next = Math.max(0, Math.min(maxScroll, this.scrollCursor + Math.sign(direction)));
    if (next === this.scrollCursor) {
      return false;
    }
    const selected = this.cursor + this.getItemOffset();
    this.scrollCursor = next;
    this.cursor = selected - this.getItemOffset();
    this.scrollBar?.setScrollCursor(next);
    this.updateGridCallback?.();
    const visible = this.cursor >= 0 && this.cursor < this.ROWS * this.COLUMNS;
    if (visible) {
      this.handler.setCursor(this.cursor);
    }
    this.pointerVisibility?.(visible);
    return true;
  }

  /**
   * Set a scrollBar to get updated with the scrolling
   * @param scrollBar {@linkcode ScrollBar}
   * @returns this
   */
  withScrollBar(scrollBar: ScrollBar): ScrollableGridHelper {
    this.scrollBar = scrollBar;
    this.scrollBar.setTotalRows(Math.ceil(this.totalElements / this.COLUMNS));
    return this;
  }

  /**
   * Set function that will get called if the whole grid needs to get updated
   * @param callback {@linkcode UpdateGridCallbackFunction}
   * @returns this
   */
  withUpdateGridCallBack(callback: UpdateGridCallbackFunction): ScrollableGridHelper {
    this.updateGridCallback = callback;
    return this;
  }

  /**
   * Set function that will get called if a single element in the grid needs to get updated
   * @param callback {@linkcode UpdateDetailsCallbackFunction}
   * @returns this
   */
  withUpdateSingleElementCallback(callback: UpdateDetailsCallbackFunction): ScrollableGridHelper {
    this.updateDetailsCallback = callback;
    return this;
  }

  /**
   * @param totalElements the total number of elements that the grid needs to display
   */
  setTotalElements(totalElements: number) {
    this.totalElements = totalElements;
    if (this.scrollBar) {
      this.scrollBar.setTotalRows(Math.ceil(this.totalElements / this.COLUMNS));
    }
    this.setScrollCursor(0);
  }

  /**
   * @returns how many elements are hidden due to scrolling
   */
  getItemOffset(): number {
    return this.scrollCursor * this.COLUMNS;
  }

  /**
   * Update the cursor and scrollCursor based on user input
   * @param button the button that was pressed
   * @returns `true` if either the cursor or scrollCursor was updated
   */
  processInput(button: Button): boolean {
    if (!this.totalElements) {
      return false;
    }
    if (this.pointerVisibility && [Button.UP, Button.DOWN, Button.LEFT, Button.RIGHT].includes(button)) {
      const selected = this.cursor + this.getItemOffset();
      if (this.cursor < 0 || this.cursor >= this.ROWS * this.COLUMNS) {
        const scroll = Math.max(
          0,
          Math.min(Math.floor(selected / this.COLUMNS), Math.ceil(this.totalElements / this.COLUMNS) - this.ROWS),
        );
        this.setScrollCursor(scroll, selected - scroll * this.COLUMNS);
      }
      this.pointerVisibility(true);
    }
    let success = false;
    const onScreenRows = Math.min(this.ROWS, Math.ceil(this.totalElements / this.COLUMNS));
    const maxScrollCursor = Math.max(0, Math.ceil(this.totalElements / this.COLUMNS) - onScreenRows);
    const currentRowIndex = Math.floor(this.cursor / this.COLUMNS);
    const currentColumnIndex = this.cursor % this.COLUMNS;
    const itemOffset = this.scrollCursor * this.COLUMNS;
    const lastVisibleIndex = Math.min(this.totalElements - 1, this.totalElements - maxScrollCursor * this.COLUMNS - 1);
    switch (button) {
      case Button.UP:
        if (currentRowIndex > 0) {
          success = this.setCursor(this.cursor - this.COLUMNS);
        } else if (this.scrollCursor > 0) {
          success = this.setScrollCursor(this.scrollCursor - 1);
        } else {
          // wrap around to the last row
          let newCursor = this.cursor + (onScreenRows - 1) * this.COLUMNS;
          if (newCursor > lastVisibleIndex) {
            newCursor -= this.COLUMNS;
          }
          success = this.setScrollCursor(maxScrollCursor, newCursor);
        }
        break;
      case Button.DOWN:
        if (currentRowIndex < onScreenRows - 1) {
          // Go down one row
          success = this.setCursor(Math.min(this.cursor + this.COLUMNS, this.totalElements - itemOffset - 1));
        } else if (this.scrollCursor < maxScrollCursor) {
          // Scroll down one row
          success = this.setScrollCursor(this.scrollCursor + 1);
        } else {
          // Wrap around to the top row
          success = this.setScrollCursor(0, this.cursor % this.COLUMNS);
        }
        break;
      case Button.LEFT:
        if (currentColumnIndex > 0) {
          success = this.setCursor(this.cursor - 1);
        } else if (this.scrollCursor === maxScrollCursor && currentRowIndex === onScreenRows - 1) {
          success = this.setCursor(lastVisibleIndex);
        } else {
          success = this.setCursor(this.cursor + this.COLUMNS - 1);
        }
        break;
      case Button.RIGHT:
        if (currentColumnIndex < this.COLUMNS - 1 && this.cursor + itemOffset < this.totalElements - 1) {
          success = this.setCursor(this.cursor + 1);
        } else {
          success = this.setCursor(this.cursor - currentColumnIndex);
        }
        break;
    }
    return success;
  }

  /**
   * Reset the scrolling
   */
  reset(): void {
    this.cursor = 0;
    this.setScrollCursor(0);
    this.setCursor(0);
  }

  private setCursor(cursor: number): boolean {
    const changed = this.cursor !== cursor;
    this.cursor = cursor;
    const handlerChanged = this.handler.setCursor(cursor);
    if (
      changed
      && !handlerChanged
      && this.pointerVisibility
      && cursor >= 0
      && this.getSelectedIndex() >= 0
      && this.getSelectedIndex() < this.totalElements
    ) {
      this.updateGridCallback?.();
      this.updateDetailsCallback?.(this.getSelectedIndex());
    }
    return changed || handlerChanged;
  }

  private setScrollCursor(scrollCursor: number, cursor?: number): boolean {
    const scrollChanged = scrollCursor !== this.scrollCursor;

    // update the scrolling cursor
    if (scrollChanged) {
      this.scrollCursor = scrollCursor;
      if (this.scrollBar) {
        this.scrollBar.setScrollCursor(scrollCursor);
      }
      if (this.updateGridCallback) {
        this.updateGridCallback();
      }
    }

    let cursorChanged = false;
    const newElementIndex = this.cursor + this.scrollCursor * this.COLUMNS;
    if (cursor !== undefined) {
      cursorChanged = this.setCursor(cursor);
    } else if (newElementIndex >= this.totalElements) {
      // make sure the cursor does not go past the end of the list
      cursorChanged = this.setCursor(this.totalElements - this.scrollCursor * this.COLUMNS - 1);
    } else if (scrollChanged && this.updateDetailsCallback) {
      // scroll was changed but not the normal cursor, update the selected element
      this.updateDetailsCallback(newElementIndex);
    }

    return scrollChanged || cursorChanged;
  }
}
