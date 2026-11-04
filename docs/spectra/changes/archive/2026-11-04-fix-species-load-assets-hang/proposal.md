## Problem

圖鑑清單（`pokedex-ui-handler`）在游標移到「只看過、尚未捕獲」或「完全沒看過」的寶可夢時，右側的大圖 sprite 可能永遠不顯示。程式在換選項時先把 sprite 設為隱藏，只有等 `species.loadAssets(...)` 的 Promise 解決後才會重新顯示；但這個 Promise 在特定參數組合下永遠不會解決。使用者看到的就是「圖鑑 sprite 缺失」。

另有一個較輕的風險：`loadAssets` 在載入完成事件中，不論貼圖是否真的存在，都會用 1–400 號影格名稱建立動畫；若貼圖載入失敗，會建出 0 影格的動畫，之後因為「動畫已存在」而不會重建，`play()` 也就停在上一隻寶可夢的畫面。

## Root Cause

- `PokemonSpecies.loadAssets`（`src/data/pokemon-species.ts`）的 Promise 只在 `variant != null` 的分支呼叫 `resolve()`（上游 2025-04 的 #5130 引入）。當 `startLoad` 為 true 且 `variant` 為 `undefined` 時，沒有任何分支會解決它。
- 圖鑑清單的 `setSpeciesDetails` 只有在 `caughtAttr` 非 0（已捕獲）時才從 `getSanitizedProps` 取得 `variant`；未捕獲或僅看過的寶可夢 `caughtAttr` 為 0，所以 `variant` 保持 `undefined`，落入上述卡死路徑。灰階/黑色剪影的 tint 程式碼因此永遠沒有可見的 sprite 可作用。
- 已逐一讀過其他 `startLoad=true` 的呼叫端（`pokedex-page-ui-handler`、`starter-select-ui-handler`、`starter-summary`、`run-info-ui-handler`、`pokemon-hatch-info-container`）：它們都會傳入已定義的 `variant`（圖鑑詳情頁預設為 0），因此目前只有圖鑑清單會走到卡死路徑。
- 「換選項時的過期請求」已由圖鑑清單的 `assetLoadCancelled` 處理（每次 `setSpeciesDetails` 都會取消上一個），不需要另外加檢查。

此結論來自讀程式碼；尚未在真實瀏覽器確認，這是 `tasks.md` 的一項驗證工作。

## Proposed Solution

1. 讓 `PokemonSpecies.loadAssets` 在每一條路徑上都會解決：`variant` 為 `undefined` 時，在動畫建立完成後直接解決（不需要載入變體顏色資料）。
2. 只有在貼圖確實存在且影格名稱非空時才建立動畫；否則不建立 0 影格動畫（讓之後的載入還有機會重建），並照常解決 Promise，不丟錯。
3. 為上述行為補單元測試（用專案現有的 MockLoader，其 `once` 會立即呼叫 callback，可重現卡死）。

## Non-Goals (optional)

- 不處理「1 影格靜態圖/占位圖」（如 Gmax Eevee、Mega Scizor）：那是 assets 倉庫的圖檔問題，不在本倉庫修。
- 不處理 `133-partner.png` 與 `133.png` 完全相同的問題（同樣是 assets 倉庫）。
- 不重構圖鑑詳情頁「載入兩次 assets」的行為（只是效能，不影響正確性）。
- 不處理 `Texture key already in use: PRAS- Psychic BG` 警告，另開 change `fix-anim-duplicate-texture-key-warning`。

## Success Criteria

- 對 `loadAssets(female, formIndex, shiny, undefined, true)` 的呼叫，Promise 在載入完成後會解決（新測試）。
- 圖鑑清單游標移到未捕獲/僅看過的寶可夢時，sprite 在載入完成後顯示並套用對應 tint（單元測試以 spy 驗證 `play` 與 `setVisible(true)` 被呼叫，加上一次真實瀏覽器手動確認）。
- 貼圖不存在時 `loadAssets` 不會建立 0 影格動畫，且 Promise 仍會解決。
- `variant` 已定義時的既有行為不變（變體顏色仍先載入再解決）。
- `pnpm typecheck` 與相關 vitest 測試通過。

## Impact

- Affected code:
  - Modified: `src/data/pokemon-species.ts`（`PokemonSpecies.loadAssets`）
  - New: `test/tests/data/species-load-assets.test.ts`
  - Removed: 無
