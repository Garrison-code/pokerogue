## Context

Phaser 4 升級後，sprite 的自訂渲染資料依 render node 分開存放，讀取要用 `sprite.renderNodeData[<render node 名稱>]` 這個屬性，寫入則用 `sprite.setRenderNodeData(...)` 這個方法。

指揮特性（Commander）有兩段動畫，都由 `PokemonAnimPhase` 播放：

- `COMMANDER_APPLY`：Tatsugiri 登場、發現同伴是活著的 Dondozo 時，由 `CommanderAbAttr.apply` 觸發，播放 Tatsugiri 跳進 Dondozo 嘴裡。這段動畫會先建立 Tatsugiri 的暫時 sprite，並把本體 sprite 的 `spriteColors`、`fusionSpriteColors` 複製過去，再開始位移與縮放。
- `COMMANDER_REMOVE`：Dondozo 身上的 `COMMANDED` 標記被移除、且來源 Tatsugiri 仍在場上時，由 `CommandedTag.onRemove` 觸發，播放 Dondozo 把 Tatsugiri 吐出來。

`COMMANDER_APPLY` 複製顏色那一行寫成讀 `setRenderNodeData`（方法）而不是 `renderNodeData`（資料），所以每次播放都會拋 TypeError。`COMMANDER_REMOVE` 的對應程式碼寫對了。

測試環境的狀況：

- 測試用的 `tweens.add` 會立刻呼叫 `onComplete`，所以動畫在測試中會同步跑完，不需要等時間。
- `MockSprite` 沒有預設的 `frame`，但 `doCommanderApplyAnim` 會讀 `getSprite().frame.name`。真正的 Phaser sprite 一定有 `frame`。
- 先前的調查中，在測試裡模擬「出錯那一行讀到有效資料」後，`COMMANDER_APPLY` 能跑完並呼叫 `end()`，唯一擋住的是 `frame` 這個 mock 缺口，沒有發現其他缺口。這個結果是在暫時的重現測試裡取得的，正式實作時仍要以實際修正後的測試為準。

## Goals / Non-Goals

**Goals:**

- Tatsugiri 跳進 Dondozo 嘴裡的動畫不再拋錯，跑完後戰鬥繼續進行。
- 測試環境能真正執行 `COMMANDER_APPLY` 與 `COMMANDER_REMOVE` 動畫，往後同類錯誤會被測試抓到。
- 修正只動出錯的那一行，不改變動畫的外觀與時序。

**Non-Goals:**

- 不在 `PokemonAnimPhase` 或 `PhaseManager` 加入全域 try/catch 或錯誤復原。任何 phase 拋錯就停住是現有的整體設計，屬於另一個議題。
- 不處理 `tsc` 抓不到這類錯誤的根本原因（`tsconfig.json` 的 `noImplicitAny: false`）。改成 `true` 會影響整個專案，應另開 change 評估。
- 不重構或統一其他檔案中複製 `renderNodeData` 的寫法（如 `evolution-phase.ts`、`quiet-form-change-phase.ts`）。它們寫的是對的。
- 不修改 `COMMANDER_REMOVE` 中 `animationupdate` 監聽器的生命週期，也不修改 `MockSprite.setFrame` 的行為。
- 不修改 Order Up 招式本身；`order-up.test.ts` 維持原樣（繼續 mock 動畫）。

## Decisions

### 修正 doCommanderApplyAnim 讀取 renderNodeData 的那一行

把複製 `spriteColors`、`fusionSpriteColors` 時的 `this.pokemon.getSprite().setRenderNodeData[...]` 改成 `this.pokemon.getSprite().renderNodeData[...]`，寫入端的 `sprite.setRenderNodeData(...)` 維持不變。這與同一個檔案 `doCommanderRemoveAnim` 的寫法一致。

考慮過但不採用的做法：

- 用 `?.` 或預設值包起來讓它不拋錯：會掩蓋「讀錯東西」這個真正的錯誤，且讀到的顏色資料會是空的，暫時 sprite 的顏色就不對。
- 把 `PokemonAnimPhase.start` 包 try/catch 後呼叫 `end()`：動畫會被靜默跳過，也屬於上面所列的 Non-Goal。

### 給 MockSprite 預設的 frame

在 `MockSprite` 建構時給 `frame` 一個預設值 `{ name: "__BASE" }`。`__BASE` 是 Phaser 在 sprite 沒指定 frame 時使用的預設 frame 名稱，這樣 `getSprite().frame.name` 在測試中和真實環境一樣不會拋錯。`setFrame` 的行為維持不變。

考慮過但不採用的做法：

- 在測試裡用 `vi.spyOn(Pokemon.prototype, "getSprite")` 補上 `frame`（暫時重現測試用的做法）：只有這一個測試受惠，其他想執行相關動畫的測試會再踩到同一個坑，而且需要在每個測試重複。
- 讓 `frame` 的型別完整對應 Phaser 的 `Frame`：mock 只需要被程式碼讀取的欄位，其餘欄位等到有程式碼需要時再補。

### 回歸測試不 mock 動畫，直接執行 PokemonAnimPhase

新增 `test/tests/phases/pokemon-anim-phase.test.ts`（與 `quiet-form-change-phase.test.ts` 等既有 phase 測試同一個資料夾），讓 Tatsugiri 與 Dondozo 在雙打中真的登場，不 mock `triggerPokemonBattleAnim`：

- 登場流程：驗證 `PokemonAnimPhase` 的 `end` 被呼叫、Dondozo 取得 `COMMANDED` 標記、Tatsugiri 被隱藏。
- Dondozo 後換上場：沿用 `commander.test.ts` 的情境，Tatsugiri 先在場、Dondozo 之後才換上，動畫同樣跑完。
- 吐出流程：Tatsugiri 已經進入 Dondozo 後，移除 `COMMANDED` 標記，驗證吐出動畫跑完且 Tatsugiri 重新顯示。

現有的 `commander.test.ts` 與 `order-up.test.ts` 繼續 mock 動畫，這是它們的測試目的（驗證特性與標記），不需要改。暫時的重現測試 `test/tests/abilities/commander-anim-repro.test.ts` 在新測試完成後刪除。

測試跑不到真正的 Phaser 渲染，所以另外在真實瀏覽器驗證。

## Implementation Contract

**行為：** 雙打中，Tatsugiri（Commander）與活著的 Dondozo 同時在場時，Tatsugiri 跳進嘴裡的動畫播放完畢，不拋錯，接著戰鬥繼續：Dondozo 取得 `COMMANDED` 標記與能力提升、Tatsugiri 被隱藏。`COMMANDED` 標記移除、Tatsugiri 仍在場時，吐出動畫播放完畢，Tatsugiri 重新顯示。動畫的外觀、音效與時序不變。

**介面：** 不新增或變更對外介面。`PokemonAnimPhase` 的簽章與 `PokemonAnimType` 不變。`MockSprite` 新增一個預設的 `frame`（至少含 `name`），其餘方法簽章不變。

**失敗處理：**

- 修正後若新測試仍失敗，先判斷原因：是測試缺 mock（補 `MockSprite` 或測試設定），還是正式程式碼另有錯誤。
- 若是正式程式碼另有錯誤（例如吐出動畫在完整流程中出錯），不順手修，先記在 `tasks.md` 並回報使用者，由使用者決定是否納入。在決定之前，這個 change 不算完成。
- `src/i18n.ts` 的 `localStorage.getItem` 未處理錯誤在現有的 Commander 測試中就會出現，與本 change 無關，不處理。

**驗收：**

- 新增的登場流程測試在修正前（但 `MockSprite` 已有 `frame`）失敗，錯誤訊息含 `Cannot read properties of undefined (reading 'spriteColors')`，修正後通過。
- `pnpm test` 與所有 `typecheck*` script 通過；`pnpm biome:ci` 以 PR 上的 Linting 結果為準。
- 現有的 `commander.test.ts`、`order-up.test.ts` 結果不變。
- 真實瀏覽器（Phaser WebGL）中以 Tatsugiri + Dondozo 雙打登場，動畫播完、戰鬥可以繼續，Console 沒有該 TypeError。若無法在瀏覽器驗證，在 `tasks.md` 如實記錄原因，這個項目不勾選。

**範圍：**

- 範圍內：`doCommanderApplyAnim` 複製顏色資料的那一行、`MockSprite` 的預設 `frame`、新的 `PokemonAnimPhase` 測試、刪除暫時的重現測試。
- 範圍外：Non-Goals 所列項目。

## Risks / Trade-offs

- [卡死戰鬥是推論，瀏覽器裡可能還有其他會卡住的錯誤] → 瀏覽器驗證是驗收條件；若修正後仍卡住，先查 Console，不要宣告完成。
- [`MockSprite` 多了預設 `frame`，可能影響其他讀取 `frame` 的測試] → 跑完整的 `pnpm test`；若有新失敗，依 Implementation Contract 的失敗處理分類，影響過大時回報使用者。
- [吐出動畫的完整流程在先前調查中只驗證過 `start` 不拋錯，是否能跑到結尾與重新顯示 Tatsugiri 尚未確認] → 由新測試實際驗證；若失敗，依失敗處理回報，不在這個 change 內擴大範圍。
- [測試的 tween 會立刻完成，抓不到實際時序或渲染問題] → 以真實瀏覽器驗證補足。
- [upstream 可能自行修正同一行，同步時產生衝突] → 改動只有一行，衝突容易處理。
