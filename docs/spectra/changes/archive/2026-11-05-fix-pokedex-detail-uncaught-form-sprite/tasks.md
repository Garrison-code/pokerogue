## 1. 先寫失敗測試

- [x] 1.1 新增 `test/tests/ui/pokedex-page-form-sprite.test.ts`（沿用 `test/tests/ui/pokedex-page-pointer.test.ts` 的 GameManager 與開啟 `UiMode.POKEDEX_PAGE` 的方式），涵蓋 requirement "Detail page shows the selected form for seen but uncaught species"：把妙蛙花的 `gameData.dexData[...].seenAttr` 設為非 0、`caughtAttr` 設為 0，以 spy 攔截 `loadAssets`；用 `{ formIndex: <mega 的 formIndex> }` 作為 saved preferences 開啟頁面，預期 `loadAssets` 收到的 `formIndex` 等於 mega 形態；不給 preferences 時預期為 0。驗證：`vitest run test/tests/ui/pokedex-page-form-sprite.test.ts`，修正前「選了 mega」案例失敗（收到 0）。
- [x] 1.2 [after: 1.1] 在同一個測試檔加入 requirement "Unseen species keep the silhouette" 的案例：未看過的寶可夢帶有 saved form 時，`loadAssets` 仍收到 `formIndex` 0 且 tint 為黑色。驗證：該案例在修正前後都通過（鎖住不變的行為）。

## 2. 修正

- [x] 2.1 [after: 1.2] 在 `PokedexPageUiHandler.setSpecies`（`src/ui/handlers/pokedex-page-ui-handler.ts`）實作 "Honor the selected form in the seen-but-uncaught branch"：未捕獲分支傳給 `setSpeciesDetails` 的 `formIndex` 改為 `starterPreferences?.formIndex ?? props.formIndex`，其餘屬性與灰色 tint 不變。驗證：1.1 與 1.2 全部通過。

## 3. 驗證

- [x] 3.1 [after: 2.1] 執行 `pnpm typecheck` 與 `vitest run test/tests/ui`（輸出導到檔案，log 很大）。驗證：沒有新增失敗，尤其是既有的 `pokedex-*-pointer` 測試；既有的 `src/i18n.ts` `getItem` unhandled error 為已知且無關。
- [x] 3.2 [after: 2.1] 在 `pnpm start:dev`（port 8000）進入沒捕獲的妙蛙花詳情頁，點「進化」→超級進化，再點「進化」→超極巨化。驗證（手動）：大圖依序變成超級妙蛙花與超極巨妙蛙花，並維持灰色；結果記在 change 筆記中。
