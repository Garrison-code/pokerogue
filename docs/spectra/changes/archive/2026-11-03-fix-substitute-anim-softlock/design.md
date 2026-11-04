## Context

Phaser 4 升級後，sprite 的自訂渲染資料依 render node 分開存放。寶可夢本體由 `addPokemonSprite` 建立，擁有 `spriteSubmitter` 的資料；替身娃娃和它的暫時複製 sprite 由 `addFieldSprite` 建立，只有 `fieldSpriteSubmitter` 的資料。

`BattleAnim.play` 用 `targetSubstitute` 判斷目標是否為替身，並已據此選擇建立哪一種暫時 sprite，但後續寫入 `tone` 時沒有再判斷。Phaser 的 `setRenderNodeData` 遇到不存在的 render node 資料會拋出 TypeError。

`FieldSpriteRenderData` 只有 `ignoreTimeTint` 和 `terrainColorRatio`，`FieldSpriteSubmitter` 也不讀取 `tone`，所以替身娃娃目前本來就無法顯示 tone。

## Goals / Non-Goals

**Goals:**

- 招式打到替身時不再拋錯，動畫開啟或關閉都能走完，戰鬥繼續進行。
- 寶可夢本體 sprite 的 tone 行為不變。
- 測試環境能抓到對缺少 render node 資料的 sprite 寫入的錯誤。

**Non-Goals:**

- 不讓替身娃娃支援 tone 顯示。這需要改 `FieldSpriteSubmitter` 和 shader，屬於視覺功能。
- 不在遊戲主迴圈或 phase 系統加入全域錯誤防護，這是另一個議題。
- 不修 `PokemonAnimPhase.doCommanderApplyAnim` 內的 `getSprite().setRenderNodeData[...]`。那段程式碼把函式當成物件讀取，看起來是另一個會拋錯的問題（目前只讀過程式碼，未執行），應另開 change 處理。
- 不處理投擲猴、接球手或範圍招式的目標判定，調查顯示它們不是原因。

## Decisions

### 不對替身娃娃寫入 spriteSubmitter 資料

在 `BattleAnim.play` 的兩處寫入加上判斷：`cleanUpAndComplete` 只在目標不是替身時重設 `tone`；`onRepeat` 只在暫時 sprite 是由 `addPokemonSprite` 建立時（使用者本身，或目標不是替身）寫入 `tone`。其餘鏈式呼叫（如 `setAngle`、`setVisible`、`setBlendMode`）對所有 sprite 照常執行。

這和 `play` 內既有的 `isUser || !targetSubstitute` 分支使用相同的判斷，也如實反映 field sprite 不支援 tone。

考慮過但不採用的做法：

- 為娃娃補上空的 `spriteSubmitter` 資料：不再拋錯，但存了 render node 不會讀取的資料，也和 sprite 實際使用的 submitter 不符。
- 包 try/catch：會把往後真正的錯誤也一起吞掉。
- 為 field sprite 加上 tone 支援：超出修 bug 的範圍。

### 讓 MockSprite 的 setRenderNodeData 與 Phaser 一致

拿掉 `MockSprite.setRenderNodeData` 的 `??=`，改為與 Phaser 相同：資料不存在時拋出 TypeError；`value` 為 `undefined` 時刪除該 key。`setRenderNodeRole` 仍會建立資料，所以正常建立的 sprite 不受影響。

寬鬆的 mock 正是這個 bug 沒被測出的原因之一。只在回歸測試中局部替換 setter 的話，其他呼叫點仍然測不出來，所以改全域。

全域改嚴格後，現有測試會有多少失敗尚未量測，要跑完整 `pnpm test` 才知道。處理方式見 Implementation Contract 的失敗處理。

### 回歸測試涵蓋動畫關閉與開啟兩條路徑

- 動畫關閉：測試預設設定下 `play` 會直接呼叫 `cleanUpAndComplete`，用一般戰鬥流程即可涵蓋。
- 動畫開啟：`onRepeat` 只在開啟動畫時執行。先前調查中逐格執行的嘗試因 mock 缺少方法（`setBlendMode`）而沒有跑到替身娃娃，所以這裡用自製的動畫資料直接驅動 `onRepeat`：stub `getAnim` 回傳含 `AnimFrameTarget.TARGET` 影格的設定，攔截 `globalScene.tweens.addCounter` 取得 config 後手動呼叫，並為 `MockSprite` 補上缺少的方法。

測試跑不到真正的 Phaser 渲染和主迴圈，所以另外在真實瀏覽器驗證。

## Implementation Contract

**行為：** 不論動畫開關，招式打到替身都不拋錯，也不會卡在招式訊息上。替身照常承受傷害，或被打破並移除。

**介面：** 不新增或變更對外介面。`BattleAnim.play` 的簽章不變。`MockSprite.setRenderNodeData` 的簽章不變，但資料不存在時改為拋出 TypeError。

**失敗處理：**

- 改嚴格後，若現有測試失敗是因為測試 sprite 少了 `setRenderNodeRole` 這類設定，就修正 mock 或測試的設定。
- 若失敗是因為正式程式碼對缺少資料的 sprite 寫入，代表另有實際 bug：不順手修，先記在 `tasks.md` 並回報使用者，由使用者決定是否納入。在決定之前，這個 change 不算完成。

**驗收：**

- 回歸測試在修正前失敗，錯誤訊息含 `Cannot set properties of undefined`，修正後通過。
- `pnpm test`、所有 `typecheck*` script 通過；`pnpm biome:ci` 以 PR 上的 Linting 結果為準。
- 真實瀏覽器（Phaser WebGL）中攻擊有替身的目標，動畫開啟和關閉都不會卡住，Console 沒有該 TypeError。

**範圍：**

- 範圍內：`BattleAnim.play` 對替身 sprite 的 `tone` 寫入、`MockSprite` 的行為與缺少的方法、回歸測試。
- 範圍外：Non-Goals 所列項目，以及和替身無關的動畫程式碼。

## Risks / Trade-offs

- [替身娃娃受擊時的影格不套用 tone] → 目前 field sprite 本來就不會顯示 tone，所以沒有視覺上的退步；若日後要支援，另開 change。
- [嚴格 mock 可能讓許多現有測試失敗，失敗數量未量測] → 依 Implementation Contract 的失敗處理分類；若影響範圍過大，回報使用者再決定是否調整範圍。
- [主迴圈停止是推論，瀏覽器裡可能還有其他會卡住的錯誤] → 瀏覽器驗證是驗收條件；若修正後仍卡住，先查 Console，不要宣告完成。
- [upstream 可能自行修正同一段程式碼，同步時產生衝突] → 改動集中在兩處判斷，衝突容易處理。
