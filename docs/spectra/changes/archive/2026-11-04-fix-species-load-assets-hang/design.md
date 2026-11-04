## Context

`PokemonSpecies.loadAssets(female, formIndex, shiny, variant, startLoad, back)` 載入某隻寶可夢的 atlas、叫聲，並在 Phaser loader 的 `COMPLETE` 事件中建立 sprite 動畫。它回傳的 Promise 被圖鑑、選擇起始寶可夢畫面等 UI 用來決定「何時可以顯示 sprite」。目前只有 `variant != null` 時，Promise 才會在 `loadPokemonVariantAssets(...)` 結束後解決；`variant` 為 `undefined` 時沒有任何程式碼呼叫 `resolve()`。

圖鑑清單的 `setSpeciesDetails` 只有在寶可夢已捕獲（`caughtAttr` 非 0）時才補上 `variant`，所以對僅看過/未看過的寶可夢，`variant` 為 `undefined`，sprite 在 `setVisible(false)` 之後永遠不會被重新顯示。其他 `startLoad=true` 的呼叫端皆傳入已定義的 `variant`。

測試環境的 `MockLoader.once(event, cb)` 會立即同步呼叫 `cb`，因此在單元測試中可以不靠真實瀏覽器重現卡死。

## Goals / Non-Goals

**Goals:**

- `loadAssets` 的 Promise 在所有參數組合下，載入結束後都會解決。
- 貼圖不存在時不建立 0 影格動畫。
- 以單元測試鎖住上述行為。

**Non-Goals:**

- 不修改圖鑑清單的呼叫端（不替未捕獲寶可夢補預設 `variant`）：在 loader 層修一次可保護所有呼叫端。
- 不處理 1 影格占位圖、`133-partner` 重複檔（assets 倉庫）。
- 不處理圖鑑詳情頁重複載入、Psychic BG 警告。
- 不新增「過期選擇」檢查：圖鑑清單的 `assetLoadCancelled` 已涵蓋。

## Decisions

### Resolve in loader when variant is undefined

在 `COMPLETE` callback 中，`variant == null` 時於動畫建立後直接 `resolve()`；`variant != null` 時維持現狀（等 `loadPokemonVariantAssets` 完成才解決）。
替代方案：在圖鑑清單對未捕獲寶可夢傳 `variant ?? 0`。否決：只修一個呼叫端，其他現在或未來傳 `undefined` 的呼叫端仍會卡死；而且 `loadPokemonVariantAssets` 對 variant 0 只是判斷變體資料後 return，語意上「無變體」就不需要等它。

### Skip animation creation when texture is missing

建立動畫前檢查 `globalScene.textures.exists(spriteKey)` 且 `frameNames.length > 0`；任一不成立就不呼叫 `anims.create`。這樣日後貼圖載入成功時，「動畫已存在」的分支不會擋住重建。Promise 仍照常解決（呼叫端自行處理 `play()` 找不到動畫的情況不在本 change 範圍）。
替代方案：失敗時 reject。否決：會讓所有 `.then` 呼叫端都需要補 `catch`，風險大於收益。

## Implementation Contract

- **Behavior**: 對任何 `loadAssets(...)` 呼叫（含 `startLoad=true` 且 `variant` 為 `undefined`），載入完成後 Promise 解決；圖鑑清單游標移到未捕獲/僅看過的寶可夢時，sprite 於載入完成後顯示。
- **Interface**: `PokemonSpecies.loadAssets` 簽章不變，回傳 `Promise<void>`。
- **Failure modes**: 貼圖不存在 → 不建立動畫、不丟錯、Promise 解決；`variant` 已定義時，變體顏色載入失敗的行為與現在相同。
- **Acceptance criteria**: 新增 `test/tests/data/species-load-assets.test.ts`：(1) `variant` 為 `undefined` 且 `startLoad=true` 時 Promise 在載入完成後解決；(2) `variant` 已定義時行為不變（仍先載入變體顏色再解決）；(3) 貼圖不存在時不建立動畫且 Promise 解決。`pnpm typecheck` 與該測試、`pokedex-*-pointer` 測試通過；手動在真實瀏覽器確認圖鑑未捕獲寶可夢顯示剪影。
- **Scope**: 只改 `PokemonSpecies.loadAssets` 與其測試；不動 UI handler。

## Risks / Trade-offs

- [`loadAssets` 對 `variant == null` 的所有呼叫端現在會真的解決，可能讓過去「永遠不顯示」的畫面開始顯示] → 這正是預期；以手動圖鑑檢查確認剪影/tint 外觀合理。
- [MockLoader 的 `textures.exists` 可能與真實 Phaser 行為不同] → 測試中以 spy 明確控制 `textures.exists` 與 `anims` 的回傳，不依賴 mock 的隱含行為。
- [卡死結論來自讀程式碼，未在真實瀏覽器確認] → tasks 中放一個修前重現/修後確認的手動驗證。
