## 1. 確認重複範圍並寫失敗測試

- [x] 1.1 掃描 `assets/battle-anims/*.json`，列出「背景 `resourceName` 與 `graphic` 相同」的檔案（預期只有 `psychic.json` 與 `lick.json`，前次調查的結果需要再確認）。驗證：腳本輸出的清單記錄在 change 筆記中；若出現其他檔案，一併加入 1.2 的測試案例。
- [x] 1.2 [after: 1.1] 新增 `test/tests/data/battle-anim-asset-loading.test.ts`，涵蓋 requirement "Animation texture keys are queued once"：以 spy 監看 `globalScene.loadImage` 與 `globalScene.loadSpritesheet`，對 `MoveId.PSYCHIC` 與 `MoveId.LICK` 呼叫 `loadMoveAnimAssets`，預期共用名稱只以 `loadSpritesheet` 排入一次、`loadImage` 不以該名稱被呼叫；另加一個背景名稱不同於圖形的招式，預期 `loadImage` 仍被呼叫。驗證：`vitest run test/tests/data/battle-anim-asset-loading.test.ts`；修正前共用名稱案例失敗。若測試環境載不到真實動畫資料，改用手工建立的 `AnimConfig` 當輸入。

## 2. 修正載入邏輯

- [x] 2.1 [after: 1.2] 在 `loadAnimAssets`（`src/data/battle-anims.ts`）實作 "Skip background images already queued as graphics"：蒐集本批 `graphic` 名稱集合，排入背景圖片時略過其中已有的名稱。驗證：1.2 的測試全部通過。

## 3. 驗證

- [x] 3.1 [after: 2.1] 執行 `pnpm typecheck` 與 `vitest run test/tests/data test/tests/mystery-encounter`（輸出導到檔案，log 很大；mystery-encounter 測試會 spy `loadMoveAnimAssets`）。驗證：沒有新增失敗；既有的 `src/i18n.ts` `getItem` unhandled error 為已知且無關。
- [x] 3.2 [after: 2.1] 在 `pnpm start:dev`（port 8000）進入戰鬥並使用 Psychic（也可試 Lick）。驗證（手動）：Console 沒有 `Texture key already in use` 警告，動畫背景和修正前一樣顯示；結果記在 change 筆記中。
