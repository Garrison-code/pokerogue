## Problem

雙打時，只要我方（或敵方）的 Tatsugiri 擁有「指揮」特性，並且場上有活著的同伴 Dondozo，Tatsugiri 登場後會播放「跳進 Dondozo 嘴裡」的動畫（`COMMANDER_APPLY`）。這段動畫一開始就會拋出 `TypeError: Cannot read properties of undefined (reading 'spriteColors')`，動畫沒有播完，Dondozo 也不會得到能力提升的演出。

已驗證與未驗證的部分：

- 已驗證（測試）：寫一個不 mock 動畫、真的執行 `PokemonAnimPhase` 的測試，Tatsugiri 與 Dondozo 同時登場時，`PokemonAnimPhase.start` 會在 `doCommanderApplyAnim` 內拋出上述 TypeError。
- 已驗證（測試）：Dondozo 把 Tatsugiri 吐出來的動畫（`COMMANDER_REMOVE`）沒有這個問題，執行 `start` 時不會拋錯。
- 已驗證（測試，模擬修正）：在測試中讓出錯的那一行讀到有效資料後，`COMMANDER_APPLY` 能跑到 `end()`，Tatsugiri 被隱藏、Dondozo 取得 `COMMANDED` 標記。
- 推論（尚未在瀏覽器確認）：`PokemonAnimPhase` 沒有 try/catch，拋錯後不會呼叫 `end()`；`PhaseManager.startCurrentPhase` 也沒有錯誤處理，所以戰鬥流程會停在這個 phase，行為應與先前的替身娃娃卡死相同。

## Root Cause

`doCommanderApplyAnim` 建立 Tatsugiri 的暫時 sprite 後，要把本體 sprite 的 `spriteColors`、`fusionSpriteColors` 複製過去，卻寫成：

`this.pokemon.getSprite().setRenderNodeData[globalScene.spriteSubmitter.name][k]`

`setRenderNodeData` 是方法，不是資料；應該讀的是 `renderNodeData` 這個屬性。對函式取 `["SpriteSubmitter"]` 得到 `undefined`，再取 `[k]` 就拋錯。同檔的 `doCommanderRemoveAnim`，以及 `evolution-phase.ts`、`quiet-form-change-phase.ts` 等複製同樣欄位的程式碼，寫的都是 `renderNodeData`。這個筆誤應是 Phaser 4 升級時（upstream `11794c5f4369`）改寫 API 時留下的，並非 fork 自身的改動。

三個原因讓它一直沒被發現：

- 現有的 Commander 測試（`commander.test.ts`、`order-up.test.ts`）都用 `vi.spyOn(game.scene, "triggerPokemonBattleAnim").mockReturnValue(true)` 把動畫整個略過，從沒執行過 `PokemonAnimPhase`。
- `tsc` 不會報錯，因為 `tsconfig.json` 設定了 `noImplicitAny: false`，用字串索引函式不被視為錯誤。
- 測試用的 `MockSprite` 沒有 `frame`，而 `doCommanderApplyAnim` 在更早的地方讀 `getSprite().frame.name`，所以就算想在測試裡跑這個動畫，也會先死在別的地方。真正的 Phaser sprite 一定有 `frame`，所以這只影響測試。

## Proposed Solution

- 把 `doCommanderApplyAnim` 內出錯的那一行改成讀 `renderNodeData`，與同檔其他複製 render 資料的程式碼一致。
- 讓 `MockSprite` 有一個接近真實 Phaser 的預設 `frame`（含 `name`），讓測試能真的執行這段動畫，而不是在測試裡另外攔截 `getSprite`。
- 新增 `PokemonAnimPhase` 的測試，不 mock 動畫，涵蓋 `COMMANDER_APPLY` 與 `COMMANDER_REMOVE` 兩個方向，並且在修正前失敗、修正後通過。目前暫時的重現測試 `test/tests/abilities/commander-anim-repro.test.ts` 會被這個正式測試取代並刪除。

## Non-Goals (optional)

見 `design.md` 的 Goals/Non-Goals。

## Success Criteria

- Tatsugiri 跳進 Dondozo 嘴裡的動畫不再拋錯，動畫結束後戰鬥繼續進行：Tatsugiri 被隱藏，Dondozo 取得 `COMMANDED` 標記。
- Dondozo 吐出 Tatsugiri 的動畫能跑完，Tatsugiri 重新顯示。
- 新增的測試在修正前失敗（錯誤訊息含 `Cannot read properties of undefined (reading 'spriteColors')`），修正後通過。
- 現有的 Commander 與 Order Up 測試不受影響。
- `pnpm test` 和所有 `typecheck*` script 通過。
- 在真實瀏覽器中，Tatsugiri + Dondozo 雙打登場不會卡住，Console 沒有上述 TypeError。若無法在瀏覽器驗證，要如實記錄，不可宣稱已驗證。

## Impact

- Affected specs: 新增 `commander-animation`
- Affected code:
  - Modified: `src/phases/pokemon-anim-phase.ts`, `test/mocks/mocks-container/mock-sprite.ts`
  - New: `test/tests/phases/pokemon-anim-phase.test.ts`, `docs/spectra/specs/commander-animation/spec.md`（封存時由 delta spec 產生）
  - Removed: `test/tests/abilities/commander-anim-repro.test.ts`（暫時的重現測試，尚未提交）
