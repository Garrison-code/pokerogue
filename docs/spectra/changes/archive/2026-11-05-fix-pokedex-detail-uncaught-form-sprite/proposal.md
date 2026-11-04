## Problem

在圖鑑詳情頁，對「看過但尚未捕獲」的寶可夢（例如沒解鎖的妙蛙花），點選「進化」選單裡的超級進化或超極巨化形態後，大圖仍是普通形態的灰色圖，名稱與形態文字卻已是所選形態。使用者回報「超級進化、超極巨化都跟原本一樣」。

對照組：在圖鑑清單按 F 開形態列表並用方向鍵切換時，同一隻沒捕獲的妙蛙花會正確顯示超級進化與超極巨化形態的灰色圖。圖檔本身也已確認是各自獨立的真圖（`3-mega.png`、`3-gigantamax.png`）。

## Root Cause

`PokedexPageUiHandler.setSpecies`（`src/ui/handlers/pokedex-page-ui-handler.ts`）有兩個分支：

- 已捕獲：用 `starterPreferences.formIndex ?? props.formIndex`，會尊重使用者選的形態。
- 看過但未捕獲：改用 `getSpeciesDefaultDexAttrProps(speciesId)` 取得 `formIndex`。該函式在 `caughtAttr` 為 0 時一律回傳 form 0，所以 `setSpeciesDetails` 收到的永遠是預設形態。

點選進化選單裡的形態時，handler 會把所選形態寫入 `starterPreferences.formIndex`/`savedStarterPreferences.formIndex`，並以 `UiMode.POKEDEX_PAGE` 重新進入頁面；`show()` 也把 `this.formIndex` 設為該形態，但未捕獲分支沒有使用它，因此畫面（form 0）與其餘文字（所選形態）不一致。

已讀過程式碼確認；尚未在真實瀏覽器中除錯驗證，驗證列在 `tasks.md`。

## Proposed Solution

在 `setSpecies` 的「看過但未捕獲」分支，組出給 `setSpeciesDetails` 的 `formIndex` 時，優先使用 `starterPreferences.formIndex`，沒有時才退回預設形態，與已捕獲分支的做法一致。其餘屬性（shiny、female、variant）維持預設值，仍套用灰色 tint。

## Non-Goals (optional)

- 不改變「完全沒看過」分支（固定 form 0、黑色剪影）：形態名稱此時是 `???`，顯示其他形態會洩漏資訊。
- 不改變清單頁的形態列表行為（已正確）。
- 不處理 1 影格占位圖、`fix-species-load-assets-hang` 與 `fix-anim-duplicate-texture-key-warning` 的內容。
- 不改變哪些形態可從進化選單點選。

## Success Criteria

- 看過但未捕獲的寶可夢，從進化選單選擇超級進化或超極巨化後，詳情頁大圖顯示該形態、仍為灰色 tint。
- 未選擇任何形態時，仍顯示預設形態（行為不變）。
- 已捕獲分支與「完全沒看過」分支行為不變。
- 新測試通過，`pnpm typecheck` 通過，並在真實瀏覽器手動確認妙蛙花的超級進化與超極巨化。

## Impact

- Affected code:
  - Modified: `src/ui/handlers/pokedex-page-ui-handler.ts`（`setSpecies` 的未捕獲分支）
  - New: `test/tests/ui/pokedex-page-form-sprite.test.ts`
  - Removed: 無
