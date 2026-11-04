## Problem

捕捉野生寶可夢時，如果我方隊伍已滿，遊戲會問「你的隊伍已滿員。是否放生其他寶可夢…」，並給出「概要／寶可夢圖鑑／是／否」四個選項。選「寶可夢圖鑑」後在圖鑑頁按取消返回，選項選單消失，訊息框與招式／能力面板還留在畫面上，沒有 Console 錯誤，任何按鍵都沒有反應，遊戲軟鎖（只能重新整理頁面）。選「概要」再返回則正常。

已驗證與未驗證的部分：

- 已驗證（讀程式碼，主 agent 自行交叉確認）：下方 Root Cause 的每一步。
- 已驗證（讀程式碼）：同樣的「開圖鑑頁並傳返回回呼」寫法還出現在祕密遭遇的捕捉選單與起始寶可夢選單，影響方式不同（見 Root Cause）。
- 未驗證（尚未在瀏覽器重現）：使用者目前只回報了捕捉流程的畫面；祕密遭遇與起始寶可夢選單的症狀只是從程式碼推論。瀏覽器重現步驟見 Success Criteria。

## Root Cause

捕捉流程的「寶可夢圖鑑」選項（`src/phases/attempt-capture-phase.ts` 的 `addToPartyMenuConfig`）呼叫 `ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, attributes, null, null, exitCallback)`，`exitCallback` 的內容是 `ui.setMode(UiMode.MESSAGE).then(() => promptRelease())`；重建「是否放生」選項選單的唯一方式就是這個回呼。選項處理器沒有 `keepOpen`，所以按下選項時 `base-option-select-ui-handler` 已經先把選單清掉了。

圖鑑頁的取消流程（`PokedexPageUiHandler.processInput` 的 `Button.CANCEL` 分支，沒有 `previousSpecies` 可退回時）是：

1. 先呼叫 `ui.revertMode()`。
2. `revertMode` 會先對目前的 handler，也就是圖鑑頁自己，呼叫 `clear()`。`PokedexPageUiHandler.clear()` 會做 `displayId++`，父類別 `UiHandler.clear()` 會設 `active = false`。
3. `revertMode` 完成後，`.then` 裡的守衛 `if (displayId !== this.displayId || !this.active) return;` 因為步驟 2 必然成立，直接 return，`exitCallback` 從未被呼叫。
4. UI 模式回到 `OPTION_SELECT`，但該 handler 已被清空，畫面上沒有選單、也沒有人再重建它，輸入沒有任何出口。

這個守衛來自 commit `d638bf1cbc16`「feat(ui): support mouse pokedex details」（本 fork 的滑鼠圖鑑功能，2026-10-29），同一個 commit 也加了 `clear()` 裡的 `displayId++`。目的是讓非同步的 `.then` 在頁面已被關閉或重新顯示後不要再動 UI；這個目的對「重新整理」類的路徑是對的，但對取消路徑是錯的，因為取消路徑自己就是造成 `clear()` 的那個動作。上游 PokeRogue 沒有這個守衛，所以這是 fork 專有的回歸，不是上游 bug。「概要」選項沒問題，因為它走 `setMode(UiMode.SUMMARY)`，摘要 handler 在自己還活著的時候就呼叫回呼。

同一個失效的回呼在其他呼叫端的影響：

- `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts` 的捕捉選單用一樣的 overlay + 回呼寫法，所以同樣軟鎖。它的 `setOverlayMode` 參數順序也寫錯：傳的是 `(species, formIndex, [attributes], null, cb)`，圖鑑頁預期的是 `(species, attributes, null, null, cb)`。結果 `formIndex` 被當成偏好設定、`[attributes]` 陣列被當成 `filteredIndices`，圖鑑很可能顯示預設型態，而不是捕獲的那隻。
- `src/ui/handlers/starter-select-ui-handler.ts` 的「寶可夢圖鑑」選項也傳回呼，但起始寶可夢畫面仍在底下，所以不會軟鎖；只是回呼被丟棄，糖果與被動技能圖示可能不會在返回後刷新。
- 隊伍畫面與圖鑑列表開圖鑑頁時沒有傳回呼，不受影響。

## Proposed Solution

- 修改圖鑑頁取消路徑：在呼叫 `ui.revertMode()` 之前，同步取出 `exitCallback`；`revertMode` 成功還原（回傳 `true`）之後，無論 `active` 或 `displayId` 為何，都呼叫它一次，並確保不會被呼叫第二次。`revertMode` 回傳 `false`（沒有可還原的模式）時，不呼叫回呼。
- `clear()` 時順便丟掉尚未使用的 `exitCallback`，避免頁面被別的原因關閉後，舊回呼在下一次不帶回呼的開啟時被誤觸發。
- 其他「重新整理」路徑裡的 `displayId`／`active` 守衛維持原樣，不動。
- 不替捕捉選項加 `keepOpen`：回呼本來就會 `setMode(MESSAGE)` 再重建選單，加了 `keepOpen` 會讓選單被重建兩次。
- 修正祕密遭遇捕捉選單的 `setOverlayMode` 參數順序，與捕捉流程一致。
- 新增測試，涵蓋取消後回呼被呼叫一次、沒有可還原模式時不呼叫、在圖鑑頁內退回上一隻（`previousSpecies`）時不呼叫、頁面被清除後再開啟時舊回呼不會誤觸發；並在能自動化的範圍內涵蓋捕捉選項與祕密遭遇的整合流程。

## Non-Goals (optional)

見 `design.md` 的 Goals/Non-Goals。

## Success Criteria

- 捕捉時隊伍已滿，選「寶可夢圖鑑」再取消，回到「是否放生」的提示與選項選單，且可以繼續操作；多次進出圖鑑也不會重複建立選單。
- 祕密遭遇的捕捉選單選「寶可夢圖鑑」再取消，同樣回到選項選單，且圖鑑顯示被捕獲那隻的型態。
- 起始寶可夢畫面的圖鑑返回後，糖果與被動技能圖示會刷新。
- 新測試在修正前失敗（捕捉流程的回呼沒被呼叫），修正後通過；現有 `pokedex-page-pointer.test.ts` 與其他圖鑑測試不受影響。
- `pnpm test` 的失敗數與修改前相同（已知有 15 個既有的 `src/i18n.ts` `getItem` 未處理錯誤，屬環境問題，不算本 change），且所有 `typecheck*` script 通過。
- 在真實瀏覽器驗證：滿隊伍捕捉 → 概要 → 返回（選單回來）→ 寶可夢圖鑑 → 取消（選單回來）。若無法驗證，要如實記錄，不可宣稱已驗證。

## Impact

- Affected specs: 新增 `pokedex-overlay-exit`
- Affected code:
  - Modified: `src/ui/handlers/pokedex-page-ui-handler.ts`, `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts`
  - New: `test/tests/ui/pokedex-page-exit-callback.test.ts`, `docs/spectra/specs/pokedex-overlay-exit/spec.md`（封存時由 delta spec 產生）
  - Removed: 無
