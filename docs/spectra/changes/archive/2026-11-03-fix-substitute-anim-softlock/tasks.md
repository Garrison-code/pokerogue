## 1. 先讓測試重現問題

- [x] 1.1 依 design「讓 MockSprite 的 setRenderNodeData 與 Phaser 一致」，落實 requirement「Test sprites reject render data writes the renderer rejects」：`MockSprite.setRenderNodeData` 對沒有資料的 render node 拋出 TypeError，`value` 為 `undefined` 時刪除該 key，經 `setRenderNodeRole` 指定的 render node 則正常儲存。驗證：在 `test/tests/moves/substitute.test.ts` 新增涵蓋 spec 這兩個 scenario 的測試，並用 `pnpm test:silent test/tests/moves/substitute.test.ts` 確認通過。
  - 兩個新測試在改嚴格當下就通過。同一檔案當時另有 17 個既有案例失敗，錯誤同為 `Cannot set properties of undefined (setting 'tone')`（`cleanUpAndComplete`），屬於這個 change 要修的正式程式，不是 mock 測試寫錯。2.1 修完後整檔 `35 passed`。
- [x] 1.2 依 design「回歸測試涵蓋動畫關閉與開啟兩條路徑」新增動畫關閉的測試，涵蓋 requirement「Move animations complete when the target has a Substitute doll」的回報情境表：雙打熱風打投擲猴的替身（另一隻敵人已倒下，以及兩隻都活著）、單打撞擊打卡比獸的替身、敵方撞擊打我方的替身。每個案例斷言回合走完不拋錯、替身承受傷害且目標 HP 不因這一擊改變。驗證：修正前這些測試失敗，錯誤訊息含 `Cannot set properties of undefined`（新的測試在改動前失敗，符合預期），把輸出摘要記在此 task。[after: 1.1]
  - 修正前 `pnpm test:silent test/tests/moves/substitute.test.ts -t "hitting a Substitute doll"`：4 failed。四個案例都是 `TypeError: Cannot set properties of undefined (setting 'tone')`，堆疊為 `MockSprite.setRenderNodeData` ← `cleanUpAndComplete`（`src/data/battle-anims.ts:886`）← `MoveAnim.play`（`:921`）。
- [x] 1.3 新增動畫開啟的測試：把 `enableMoveAnimations` 設為開啟，stub `getAnim` 回傳含 `AnimFrameTarget.TARGET` 影格的動畫資料，攔截 `globalScene.tweens.addCounter` 後手動呼叫 `onRepeat` 和 `onComplete`，並為 `MockSprite` 補上流程需要但缺少的方法（已知有 `setBlendMode`）。斷言完成 callback 被呼叫、不拋錯，且替身娃娃和暫時複製 sprite 都沒有 `spriteSubmitter` 資料（requirement「Substitute doll sprites receive no Pokemon sprite render data」）。驗證：修正前這個測試失敗，且失敗發生在 `onRepeat` 寫入 `tone` 時，把輸出摘要記在此 task。[after: 1.1]
  - 修正前該測試失敗：`TypeError: Cannot set properties of undefined (setting 'tone')`，堆疊為 `MockSprite.setRenderNodeData` ← `onRepeat`（`src/data/battle-anims.ts:1090`）← 測試呼叫 `counters[0].onRepeat()`。

## 2. 修正動畫程式

- [x] 2.1 依 design「不對替身娃娃寫入 spriteSubmitter 資料」修改 `BattleAnim.play`：`cleanUpAndComplete` 只在目標不是替身時重設 `tone`；`onRepeat` 只在暫時 sprite 由 `addPokemonSprite` 建立時（`isUser || !targetSubstitute`）寫入 `tone`；其餘設定對所有 sprite 照常執行。驗證：1.2、1.3 的測試全部通過；再新增一個測試，確認沒有替身的目標在動畫結束後 `tone` 重設為 `[0, 0, 0, 0]`，且通過。[after: 1.2, 1.3]
  - 修正後 `pnpm test:silent test/tests/moves/substitute.test.ts`：`35 passed`（含 1.2 的四個案例、1.3 的動畫開啟案例，以及沒有替身時 `tone` 重設為 `[0, 0, 0, 0]`）。

## 3. 完整檢查

- [x] 3.1 跑完整測試，處理改嚴格 mock 的影響。依 design Implementation Contract 的失敗處理分類每個新失敗：測試設定的缺漏就修正 mock 或測試；正式程式碼對缺少資料的 sprite 寫入，則不順手修，記在此 task 並回報使用者，由使用者決定是否納入。驗證：`pnpm test` 全部通過，或所有剩餘失敗都已回報並有使用者的決定；所有 `typecheck*` script 通過，把失敗數量和分類記在此 task。[after: 2.1]
  - `typecheck`、`typecheck:main`、`typecheck:github`、`typecheck:js` 都通過。第一次 `typecheck` 只失敗在動畫開啟測試的 tween mock 型別，已改測試型別，不是正式程式碼。
  - 第一次 `pnpm test`：4001 passed、1 failed、6 skipped、111 todo。唯一失敗是 `message-canvas-pointer.test.ts` 的 `preupdate` listener 斷言，與 render node 無關；單獨重跑該檔 18 passed。第二次完整 `pnpm test`：4002 passed、0 failed、6 skipped、111 todo（507 files passed，8 skipped）。沒有「正式程式碼對缺少 render node 資料的 sprite 寫入」需要另開決定。
- [x] 3.2 在真實瀏覽器驗證：啟動本機遊戲，在招式動畫開啟和關閉時各攻擊一次有替身的目標，再重現一次雙打熱風的回報情境（可用 overrides 指定物種和招式，驗證後還原，不要提交）。驗證：三次都沒有卡住，戰鬥繼續進行，瀏覽器 Console 沒有 `Cannot set properties of undefined (setting 'tone')`，把結果記在此 task。若仍卡住，記下 Console 錯誤並回報使用者，不要勾選此 task。[after: 2.1]
  - 2026-11-03：使用者在本機 `vite --mode development`（localhost:8000）以暫時的 overrides（雙打、敵方投擲猴 Lv20 只用替身、我方熱風／撞擊）手動測試，回報「看起來沒問題」。使用者沒有逐項回報三次驗證各自的結果與 Console 內容，所以這裡只記錄使用者的整體確認。暫時的 overrides 已用 `git checkout src/overrides.ts` 還原，沒有提交。
