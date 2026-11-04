## 1. 先重現卡死

- [x] 1.1 新增 `test/tests/data/species-load-assets.test.ts`，涵蓋 requirement "Species asset loading always settles"：`loadAssets(false, 0, false, undefined, true)` 必須解決；同樣呼叫但 `variant` 已定義時，必須在 `loadVariantColors` 完成後才解決。驗證：執行 `vitest run test/tests/data/species-load-assets.test.ts`；修正前「`variant` 為 undefined」案例失敗（逾時），證明卡死可重現，已定義 `variant` 的案例通過。

## 2. 修正 loader

- [x] 2.1 [after: 1.1] 在 `PokemonSpecies.loadAssets`（`src/data/pokemon-species.ts`）實作 "Resolve in loader when variant is undefined"：`variant == null` 時，在載入完成 callback 的建立動畫步驟之後立刻 `resolve()`；`variant != null` 的路徑不變。驗證：1.1 的所有測試通過。
- [x] 2.2 [after: 2.1] 在同一函式實作 "Skip animation creation when texture is missing"，並新增涵蓋 requirement "No empty animation for a missing texture" 的測試：以 spy 讓 `globalScene.textures.exists` 回傳 false 時不建立動畫且 Promise 解決；貼圖存在且有影格時，動畫存在且 frameRate 為 10。驗證：`species-load-assets.test.ts` 新案例通過。

## 3. 鎖定圖鑑清單行為

- [x] 3.1 [after: 2.2] 新增 `test/tests/ui/pokedex-list-sprite.test.ts`（沿用 `test/tests/ui/pokedex-page-pointer.test.ts` 的 GameManager 設定），涵蓋 requirement "Pokedex list shows a sprite for seen and unseen species"：`loadAssets` 以 spy 解決後，選到僅看過的寶可夢時大圖可見且為灰色 tint；選到未看過的寶可夢時大圖可見且為黑色 tint；較早的載入在較新的選擇之後才解決時，不改變目前的 sprite。驗證：以 `vitest run` 執行該檔；若 handler 需要不同的進入方式，參照現有 `pokedex-*-pointer` 測試如何開啟 `UiMode.POKEDEX`。
- [x] 3.2 [after: 3.1] 執行 `pnpm typecheck` 與 `vitest run test/tests/ui test/tests/data test/tests/pokemon`（輸出導到檔案，log 很大）。驗證：沒有新增失敗；既有的 `src/i18n.ts` `getItem` unhandled error 為已知且無關。

## 4. 在真實瀏覽器確認

- [x] 4.1 [after: 2.2] 以 `pnpm start:dev`（port 8000）開啟圖鑑，把游標移到一隻僅看過和一隻未看過的寶可夢。驗證（手動）：大圖出現並帶灰色/黑色 tint，而不是維持空白；歸檔前把結果記在 change 筆記中。
