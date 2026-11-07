## Problem

載入 Psychic 或 Lick 招式動畫時，Console 會出現警告 `Texture key already in use: PRAS- Psychic BG`（Lick 則是 `PRAS- Sketch + Lick`）。遊戲不會壞，但這是每次都會出現的雜訊，會蓋住真正的錯誤。

## Root Cause

`loadAnimAssets`（`src/data/battle-anims.ts`）對每個動畫的 `graphic` 用 `loadSpritesheet` 排入載入，對背景資源名稱再用 `loadImage` 排入載入。`assets/battle-anims/psychic.json` 的 `graphic` 與背景 `resourceName` 都是 `PRAS- Psychic BG`；`lick.json` 的 `graphic` 與背景 `resourceName` 都是 `PRAS- Sketch + Lick`。兩者是不同的檔案類型（spritesheet 與 image），所以 Phaser 都會排入，第二個 `addImage` 發現 key 已被使用而印出警告並丟棄。已核對這兩個 json 的相關欄位；「全部 928 個動畫 json 中只有這兩個重複」是前次調查的結果（未在本次重新掃描），實作時以 Task 1.1 的腳本再確認一次。

先前使用者說警告「在主頁面就出現」，但開機預載（`battle-scene.ts`）只載入通用動畫與 TACKLE/TAIL_WHIP/FOCUS_ENERGY/STRUGGLE，這些都不使用該 key，所以這點無法由程式碼解釋，需要使用者提供當時的操作；不影響本 change 的修正。

## Proposed Solution

在 `loadAnimAssets` 排入背景圖片前，略過名稱已經以 `graphic` 排入 spritesheet 的項目。背景以 `tileSprite` 用該 key 建立，只使用貼圖的預設整張影格，spritesheet 形式的貼圖同樣有這個影格，所以播放結果不變。

## Non-Goals (optional)

- 不修改 assets 倉庫的 json（不改 key 名稱）。
- 不處理 `Liquidation4.wav not found` 之類的音效缺檔警告。
- 不處理圖鑑 sprite 載入問題（見 change `fix-species-load-assets-hang`）。

## Success Criteria

- 為 PSYCHIC 與 LICK 載入動畫資源時，每個重複的名稱只排入一次載入（不再呼叫 `loadImage`）。
- 背景名稱不同於任何 `graphic` 時，仍照常以 `loadImage` 排入。
- 在真實瀏覽器使用 Psychic 後，Console 不再出現 `Texture key already in use` 警告，且動畫背景正常顯示。
- `pnpm typecheck` 與新增測試通過。

## Impact

- Affected code:
  - Modified: `src/data/battle-anims.ts`（`loadAnimAssets`）
  - New: `test/tests/data/battle-anim-asset-loading.test.ts`
  - Removed: 無
