## Context

圖鑑詳細頁（`PokedexPageUiHandler`）可以被別的畫面用「覆蓋」方式開啟：呼叫 `ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, preferences, filteredIndices, _, exitCallback)`。覆蓋模式會把目前模式推入 `_modeChain`，不清除原 handler。頁面在 `show` 時把第 5 個參數存成 `exitCallback`，取消時用 `ui.revertMode()` 回到原模式，並呼叫 `exitCallback`，讓開啟者重建自己的畫面。

現狀的問題（細節見 proposal 的 Root Cause）：

- `ui.revertMode()` 一開始就會對目前 handler，也就是圖鑑頁自己，呼叫 `clear()`。`PokedexPageUiHandler.clear()` 做 `displayId++`，`UiHandler.clear()` 設 `active = false`。
- 取消路徑在 `revertMode().then(...)` 裡檢查 `displayId !== this.displayId || !this.active`，這個條件在 `clear()` 後必然成立，所以 `exitCallback` 永遠不會被呼叫。
- 這個守衛是本 fork 的 commit `d638bf1cbc16` 加的；同一個 commit 在許多「重新整理」類的非同步 `.then` 也加了同樣的守衛，那些路徑是在頁面還活著、用 `setMode(POKEDEX_PAGE, "refresh")` 等方式往返時使用，守衛在那裡是合理的。

已確認的事實：圖鑑頁檔案內，從頁面開出來的子選單（`OPTION_SELECT`）都是用 `setModeWithoutClear` 開啟，頁面內沒有任何呼叫會對自己 `clear()`。尚未確認的部分：頁面之外是否還有呼叫端（例如其他 handler 或場景）會在頁面存活期間清掉它；這決定「`clear()` 時丟掉待用的回呼」是否安全，由 tasks 的實作前搜尋確認，而不是在此假設。

## Goals / Non-Goals

**Goals:**

- 圖鑑頁取消、成功還原模式後，`exitCallback` 一定被呼叫一次，捕捉流程與祕密遭遇的選項選單因而回來。
- 沒有真的關閉頁面（頁內退回上一隻、沒有可還原模式）時不呼叫回呼。
- 沒被用掉的回呼不會殘留到頁面之後的另一次開啟。
- 祕密遭遇捕捉選單開啟圖鑑頁時，傳入與一般捕捉流程一致的參數。
- 新增的測試在修正前失敗、修正後通過。

**Non-Goals:**

- 不移除或放寬其他「重新整理」路徑的 `displayId`／`active` 守衛，它們與本 bug 無關。
- 不改 `UI.revertMode` 本身：它被許多 handler 共用，「先 `clear()` 再還原」是整體設計，改動它的風險遠大於修一個呼叫端。
- 不替捕捉選項加 `keepOpen`：回呼已經會 `setMode(MESSAGE)` 再重建選單，兩者疊加會建立兩次。
- 不重構圖鑑頁的 `previousSpecies` 退回流程，也不處理其上的 `TODO`（先切到 `OPTION_SELECT` 再切回圖鑑頁）。
- 不處理 `src/phases/pokemon-anim-phase.ts` 工作樹中與本題無關的既有修改。
- 不處理 `pnpm test` 既有的 `src/i18n.ts` `getItem` 未處理錯誤。

## Decisions

### 取消路徑在 revertMode 之前取出 exitCallback

在 `Button.CANCEL`、沒有 `previousSpecies` 可退回的分支，先把 `this.exitCallback` 存進區域變數，再呼叫 `ui.revertMode()`。`revertMode` 回傳 `true` 時，把欄位設成 `null`（若 `clear()` 已經清掉也無妨），再呼叫區域變數的回呼，不再檢查 `displayId`／`active`。`revertMode` 回傳 `false` 時，什麼都不做，欄位保留原值。

理由：守衛原本要擋的是「頁面在非同步等待期間被別人關掉或重新開啟」。在取消路徑，造成 `clear()` 的就是這次取消本身，所以在這條路徑上守衛永遠誤判。把回呼先拿在手上，就不需要依賴頁面在 `revertMode` 之後的狀態。`revertMode` 回傳值已經直接表示「有沒有真的還原」，用它當條件比 `active` 更精確。

考慮過但不採用的做法：

- 直接刪掉取消路徑上的守衛：回呼仍從欄位讀，但若欄位之後被 `clear()` 清掉（見下一個決定）就會讀到 `null`，兩個決定會互相衝突。用區域變數兩者才相容。
- 替捕捉選項加 `keepOpen: true`：選單不會被清掉，但回呼仍會 `setMode(MESSAGE)` 並重建選單，結果是重複建立，而且只修好捕捉流程，不修祕密遭遇與起始寶可夢畫面。
- 在 `revertMode` 之前就呼叫回呼：此時圖鑑頁還在畫面上，回呼裡的 `setMode(MESSAGE)` 會在頁面仍顯示的狀態下切換，行為不同於現在其他流程（概要頁是在自己消失後才呼叫），不採用。

### clear 時丟掉尚未使用的 exitCallback

在 `PokedexPageUiHandler.clear()` 把 `exitCallback` 設成 `null`。

理由：`show` 只有在第 5 個參數是函式時才會覆寫 `exitCallback`，頁內往返（例如進化鏈導覽）刻意不帶參數，必須保留原回呼，所以 `show` 不能改成「每次都覆寫」。若頁面在回呼尚未使用時被別的原因 `clear()`，舊回呼會殘留到下一次不帶回呼的開啟，並在那次取消時被誤觸發。在 `clear()` 清掉可以解決，而取消路徑因為已經把回呼存進區域變數（上一個決定），不受影響。

考慮過但不採用的做法：

- 改成 `show` 每次都覆寫：會破壞頁內導覽時保留回呼的行為。
- 在 `show` 內用 `displayId` 比對判斷回呼是否過期：多一套狀態，卻解決不了比 `clear()` 更簡單就能解的問題。

### 修正祕密遭遇捕捉選單的 setOverlayMode 參數

把 `catchPokemon`（`encounter-pokemon-utils.ts`）的圖鑑選項改成與 `attempt-capture-phase.ts` 一樣的呼叫：`ui.setOverlayMode(UiMode.POKEDEX_PAGE, pokemon.species, attributes, null, null, callback)`。其中 `attributes` 維持目前已經組好的 `{ shiny, variant, form, female }`，不要再包成陣列，也不要另外傳 `formIndex`。

理由：圖鑑頁的第 2 個參數是起始偏好設定物件、第 3 個是篩選後的種類索引。目前多傳了一個 `formIndex` 讓位置整個錯開一格，偏好設定變成一個數字，`[attributes]` 被當成篩選索引。

### 測試分層：頁面行為用單元測試，呼叫端用呼叫參數斷言

- `PokedexPageUiHandler` 的取消行為（回呼被呼叫一次、不該呼叫時不呼叫、清除後不殘留）以單元測試覆蓋，新增 `test/tests/ui/pokedex-page-exit-callback.test.ts`，沿用 `pokedex-page-pointer.test.ts` 的 `GameManager` 與 `setOverlayMode` 開頁方式。
- 捕捉流程與祕密遭遇：不重寫整段捕捉動畫，而是在滿隊伍條件下進到「放生」提示，攔截 `ui.setOverlayMode` 斷言傳入的參數與回呼會重建提示。若現有測試框架無法在合理成本內進到這個提示，不硬做，改記錄原因並以瀏覽器驗證補上，不可宣稱已測試。

## Implementation Contract

**行為：**

- 捕捉時隊伍已滿，選「寶可夢圖鑑」再取消，回到「是否放生」的訊息與選項選單，可繼續操作；重複進出不會重複建立選單。
- 祕密遭遇的捕捉選單同上，並且圖鑑頁開在被捕獲那隻的型態。
- 起始寶可夢畫面的「寶可夢圖鑑」選項返回後，回呼會執行（糖果與被動圖示會刷新）。
- 圖鑑頁內退回上一隻不觸發回呼；沒有可還原的模式時不觸發也不消耗回呼。

**介面／資料形狀：**

- `PokedexPageUiHandler.show` 的參數位置不變：`[species, preferences, filteredIndices, _, exitCallback]`。
- `exitCallback` 是無參數、無回傳值的函式，語意為「圖鑑頁已關閉、UI 已回到原模式，請重建畫面」。
- `UI.revertMode()` 的簽章與行為不變（仍回傳 `Promise<boolean>`）。

**失敗處理：**

- `revertMode` 回傳 `false`：不呼叫回呼、不清空欄位，也不拋錯。
- 回呼本身拋錯：沿用現況，不額外攔截。
- 若新測試在實作後仍失敗，先判斷是缺 mock 還是正式程式碼另有問題；後者不要順手修，記在 `tasks.md` 並回報使用者。

**驗收：**

- 新增的單元測試在修正前失敗（取消後回呼呼叫次數為 0），修正後通過。
- `pokedex-page-pointer.test.ts`、`pokedex.test.ts`、`pokedex-pointer.test.ts` 與整個 `pnpm test` 的失敗數與修改前相同。
- `pnpm typecheck` 與 `typecheck:main`、`typecheck:github`、`typecheck:js` 通過，`pnpm biome ci` 通過。
- 真實瀏覽器：滿隊伍捕捉 → 概要 → 返回 → 寶可夢圖鑑 → 取消，選單回來並可操作。

**範圍：**

- 在範圍內：`PokedexPageUiHandler` 的取消路徑與 `clear()`、`encounter-pokemon-utils.ts` 圖鑑選項的參數、新增測試。
- 不在範圍內：`UI.revertMode`、其他 handler 的 `clear()`、「重新整理」路徑的守衛、`previousSpecies` 退回流程、`keepOpen` 機制、動畫與音效。

## Risks / Trade-offs

- [`clear()` 丟掉回呼，若有未發現的路徑在頁面存活期間呼叫 `clear()` 並預期回呼仍在] → 實作時先用搜尋確認頁面內所有切換模式的呼叫；若發現例外，改成只在 `hide` 類時機清除並記錄原因。測試涵蓋頁內導覽後取消仍會呼叫回呼。
- [回呼在 `revertMode` 的淡出與 100ms 延遲之後才執行，期間玩家若按其他鍵] → 與現有「概要」選項及其他 `revertMode` 使用者相同，屬既有行為，不在本 change 處理。
- [祕密遭遇與捕捉流程的整合測試成本高，可能做不出來] → 見「測試分層」，做不出來就如實記錄並以瀏覽器驗證補上。
- [瀏覽器重現只依賴使用者回報，祕密遭遇的軟鎖仍是程式碼推論] → 驗證任務中列出祕密遭遇的重現步驟，若實際沒有卡住，如實記錄，不改變其他結論。
