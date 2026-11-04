## 1. 先讓測試重現問題

### 第一批驗證紀錄（2026-11-04）

- 主代理已審查兩個新增測試及完整測試輸出，正式程式尚未變更。
- 1.1：5 案例中 3 失敗、2 通過；成功取消與連續取消的回呼均為 0 次。空模式鏈實際為 `revertMode=false` 卻呼叫回呼 1 次，與任務預測的失敗位置不同，但符合原規格要求修正的範圍；測試仍要求失敗不呼叫、不消耗回呼。另有 1 個既有 i18n getItem 錯誤。
- 1.2：1 案例失敗；已進入滿隊伍提示且回呼可重建提示。實際傳入 formIndex=1 與偏好陣列，預期為偏好物件與兩個 null。另有 1 個既有 i18n getItem 錯誤。
- 既有三檔圖鑑測試：36 通過、2 todo、0 斷言失敗，3 個既有 getItem 錯誤，退出碼 1。
- 完整 `pnpm test`（包含新增測試）：4 失敗、4009 通過、6 skipped、111 todo；4 個失敗均為新增案例，既有斷言失敗 0，15 個既有 getItem 錯誤，退出碼 1。日誌：`C:/Users/garytsai/AppData/Local/Temp/pokerogue-pnpm-test-baseline.txt`。

- [x] 1.1 依 design「測試分層：頁面行為用單元測試，呼叫端用呼叫參數斷言」新增 `test/tests/ui/pokedex-page-exit-callback.test.ts`（沿用 `pokedex-page-pointer.test.ts` 的 `GameManager` 與 `setOverlayMode` 開頁寫法，需先從 `UiMode.OPTION_SELECT` 之類的原模式開啟，讓 `_modeChain` 有東西可還原），涵蓋 spec 的四個 requirement：(a)「Closing the Pokedex page runs the opener's exit callback exactly once」：帶 `exitCallback` 開頁後送出 `Button.CANCEL`，等 `revertMode` 完成，斷言回呼被呼叫 1 次；連續開關兩次共被呼叫 2 次。(b)「The exit callback does not run when the page did not actually close」：頁內已推入 `previousSpecies` 時取消，回呼 0 次；`_modeChain` 為空使 `revertMode` 回傳 `false` 時取消，回呼 0 次，且之後可正常關閉並呼叫 1 次（回呼被保留）。(c)「A pending exit callback does not leak into a later opening」：帶回呼開頁後不經取消直接 `clear()`，再不帶回呼開頁並取消，舊回呼 0 次。驗證：`pnpm test:silent test/tests/ui/pokedex-page-exit-callback.test.ts`，修正前 (a) 與 (b) 的「之後仍可關閉」案例失敗（回呼呼叫次數為 0），(b) 的另外兩個案例與 (c) 在修正前本來就會通過（現況的守衛讓回呼永遠不被呼叫，所以不會誤觸發）；(c) 的價值是防止修正 (a) 時引入殘留回呼，不是重現現有 bug；把通過／失敗數與失敗訊息摘要記在此 task。
- [x] 1.2 在祕密遭遇測試資料夾 `test/tests/mystery-encounter/` 新增只針對 `catchPokemon` 圖鑑選項的測試，涵蓋 requirement「Mystery encounter capture prompt opens the page for the caught Pokemon」：隊伍滿的情況下進到「放生」提示，觸發圖鑑選項，攔截 `ui.setOverlayMode`，斷言傳入 `(UiMode.POKEDEX_PAGE, 被捕獲的 species, { shiny, variant, form, female }, null, null, 函式)`；再呼叫該函式，斷言「放生」提示被重新顯示。驗證：`pnpm test:silent <新測試檔>`，修正前失敗（第 2 個引數是 `formIndex` 數字，不是偏好物件）。若現有測試框架無法在合理成本內進到這個提示（例如需要大量 mock 捕捉動畫），不要硬做：把原因和已嘗試的做法記在此 task，改由 3.2 的瀏覽器驗證補上，並在最終回報如實說明這一項沒有自動化測試。此 task 與 1.1 可同時進行。

## 2. 修正圖鑑頁

### 第二批驗證紀錄（2026-11-04）

- 2.1 搜尋 `src/`：頁內上一隻、種類、進化／退化／型態與各子選單先 `setModeWithoutClear(OPTION_SELECT)`，回頁時清掉的是選單，不是圖鑑；同模式 refresh 不清頁面。真正清頁的路徑為成功 revertMode、切換其他模式、destroy 與糖果存檔失敗後 reset(true)。外部圖鑑入口位於 starter-select、pokedex、party handler、attempt-capture-phase 與 encounter-pokemon-utils，均使用 setOverlayMode。未發現頁面存活且仍需回呼卻 clear 的反例，因此按原設計在 clear 丟棄回呼。
- 2.1／2.2：圖鑑回呼測試 6 通過（含進化鏈往返），1 個既有 getItem 錯誤，退出碼 1；既有三檔仍為 36 通過、2 todo、3 個既有 getItem 錯誤。
- 3.1：祕密遭遇參數測試 1 通過，1 個既有 getItem 錯誤，退出碼 1。正式呼叫已與一般捕捉一致。
- 3.2 已執行：完整 pnpm test 為 4014 通過、6 skipped、111 todo、0 斷言失敗，15 個既有 getItem 錯誤，退出碼 1。四個 typecheck 指令均通過；本次正式碼 diff check 通過。未更動動畫檔、overrides，測試日誌保存在系統 Temp。
- 3.2 尚未全部通過：`pnpm biome ci` 實際呼叫帶 --write 的 biome script，檢查 0 檔，不能當作通過證據。正確 `pnpm biome:ci` 檢查 1344 檔、報 1334 個格式錯誤，主要為全工作目錄 CRLF；未進行全庫自動修改。等待獨立 Reviewer 確認本次四檔格式及基線限制，3.2 保持未完成。
- 3.3 尚未由使用者執行真實瀏覽器驗證，保持未完成。
- 獨立審查：Reviewer 唯讀檢查四個本次檔案，correctness、efficiency、reuse、conventions 無具體缺陷；直接 Biome CI 檢查四檔通過，無修改。全庫 1334 個報錯路徑皆未修改且為 CRLF；抽查三檔格式化內容與 HEAD 一致。Reviewer 的 Spectra scope 因 sandbox ownership 失敗，主代理已在可用環境補做完整四檔 scope（touched_tracking、resolved、無限制），並對 snapshot `a1ea56ea49fa00b86a8e4e8a26f4d038692eb946` 執行 check-snapshot，結果 current。3.2 的全庫 gate 例外已向使用者詢問，未收到決定前保持未完成。
- 3.2 結案例外：使用者已回覆「Q3 (全庫格式檢查的既有問題): A」，接受上述全庫既有 CRLF 格式問題作為本次檢查例外；不是宣稱全庫 Biome 通過。本次四檔 Biome CI 通過，其餘測試與型別檢查證據如上。人工驗證臨時 overrides 已備份，僅供 3.3 使用，測試後還原，不列入交付。
- 3.3 人工驗證：使用者依本機每日挑戰六隻隊伍、大師球的步驟實測滿隊捕捉，概要返回、圖鑑取消與反覆進出後回覆「正常 很好 可以 archive 並commit & push」。主流程接受通過；未另取得 Console 錯誤明細，起始畫面圖示與祕密遭遇的人工補測未回報，不宣稱已實測。祕密遭遇參數與重建提示已有自動化測試。臨時 overrides 已用原始 bytes 備份還原，git diff 確認無差異。

- [x] 2.1 依 design「取消路徑在 revertMode 之前取出 exitCallback」修改 `PokedexPageUiHandler` 在沒有 `previousSpecies` 時的取消分支：先把 `exitCallback` 存進區域變數，`ui.revertMode()` 回傳 `true` 後清空欄位並呼叫該區域變數的回呼，不再檢查 `displayId`／`active`；回傳 `false` 時不呼叫也不清空欄位。其他「重新整理」路徑的 `displayId`／`active` 守衛不動。動手前先在 `src/` 搜尋所有會讓圖鑑頁被 `clear()` 的呼叫端（對 `UiMode.POKEDEX_PAGE` 的 `setMode`、`revertMode`、`ui.reset` 之類），把結果與是否影響 2.2 記在此 task。驗證：1.1 的 (a) 與 (b) 案例通過；`pnpm test:silent test/tests/ui/pokedex-page-pointer.test.ts test/tests/ui/pokedex.test.ts test/tests/ui/pokedex-pointer.test.ts` 與修改前結果相同。[after: 1.1]
- [x] 2.2 依 design「clear 時丟掉尚未使用的 exitCallback」在 `PokedexPageUiHandler.clear()` 把 `exitCallback` 設為 `null`，讓沒被使用的回呼不會殘留到下一次不帶回呼的開啟，同時不影響頁內導覽（`show` 沒帶回呼時仍保留原回呼，這一點不改）。若 2.1 的搜尋發現有頁面存活期間被 `clear()` 的路徑，依 design Risks 的做法調整並記錄原因，不要硬套。驗證：1.1 的 (c) 案例通過，並新增一個案例：頁內進化鏈導覽後取消，回呼仍被呼叫 1 次；同檔全數通過。[after: 2.1]

## 3. 修正呼叫端與驗證

- [x] 3.1 依 design「修正祕密遭遇捕捉選單的 setOverlayMode 參數」修改 `catchPokemon`（`src/data/mystery-encounters/utils/encounter-pokemon-utils.ts`）的圖鑑選項，讓它與 `attempt-capture-phase.ts` 的呼叫一致：`(UiMode.POKEDEX_PAGE, pokemon.species, attributes, null, null, callback)`，`attributes` 不包陣列、不另傳 `formIndex`。驗證：1.2 的測試通過（若 1.2 因故沒有做成，改為在此 task 記錄用 `git diff` 檢視兩處呼叫的引數逐項相同，並在 3.2 瀏覽器驗證）。[after: 2.2]
- [x] 3.2 完整檢查：`pnpm test`（失敗數必須與修改前相同；已知有 15 個既有的 `src/i18n.ts` `getItem` 未處理錯誤使 exit code 為 1，與本 change 無關，只比較測試失敗數）、`pnpm typecheck`、`typecheck:main`、`typecheck:github`、`typecheck:js`、`pnpm biome ci`，並確認 `git status` 沒有殘留暫時檔案，也沒有碰到與本題無關的 `src/phases/pokemon-anim-phase.ts`。把各指令結果記在此 task。[after: 3.1]
- [x] 3.3 真實瀏覽器驗證（由使用者操作，不是自動化）：啟動本機遊戲，用暫時的 overrides 讓我方隊伍已滿再捕捉一隻，依序操作「概要 → 返回（選單應回來）→ 寶可夢圖鑑 → 取消（選單應回來並可操作）→ 再開一次圖鑑 → 取消」，確認只出現一份選單、可以選「是」或「否」繼續；若方便，另外在起始寶可夢畫面開圖鑑再返回，確認糖果／被動圖示刷新；祕密遭遇的捕捉選單若能觸發也一併測。驗證後以 `git checkout src/overrides.ts` 還原 overrides，不要提交。把使用者的回報與 Console 狀況記在此 task；若無法驗證或仍然卡住，如實記錄，不要勾選。[after: 3.2]
