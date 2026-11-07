## Context

`loadAnimAssets(anims, startLoad)` 蒐集一批 `AnimConfig` 需要的圖形、背景與音效，並排入 Phaser loader。圖形以 `loadSpritesheet(a.graphic, "battle_anims", 96)` 載入，背景以 `loadImage(name, "battle_anims")` 載入。Psychic 與 Lick 的動畫資料讓某個名稱同時是圖形與背景，結果同一個 texture key 被排入兩次，第二次在 Phaser 內以警告丟棄。

`loadAnimAssets` 不是 export 的函式，只能透過 `loadMoveAnimAssets` / `loadCommonAnimAssets` / `loadEncounterAnimAssets` 測試。

## Goals / Non-Goals

**Goals:**

- 同一個 texture key 在同一批載入中只排入一次。
- 不改變動畫播放結果。

**Non-Goals:**

- 不修改 assets json 或 key 名稱。
- 不處理音效缺檔警告。
- 不處理跨批次（已載入過）的重複排入：Phaser 對已存在於快取的 key 已有自己的處理。

## Decisions

### Skip background images already queued as graphics

在排入背景圖片的迴圈中，先檢查該名稱是否在本批 `graphic` 集合中；是則略過 `loadImage`。實作上在第一個迴圈蒐集 `graphics` 集合（與 `backgrounds`、`sounds` 並列）。
替代方案：改用 `globalScene.textures.exists(name)` 判斷。否決：排入時貼圖尚未載入，檢查永遠為 false，達不到效果。
替代方案：改 assets json 讓背景用不同 key。否決：assets 在子模組、屬於外部倉庫，且要改兩個動畫的圖檔。

## Implementation Contract

- **Behavior**: 載入包含 Psychic 或 Lick 的動畫資源時，每個 key 只呼叫一次載入函式；`graphic` 與背景同名時只用 `loadSpritesheet`。
- **Interface**: `loadAnimAssets` 簽章不變（內部函式）；公開入口 `loadMoveAnimAssets(moveIds, startLoad)` 行為不變。
- **Failure modes**: 無新增失敗路徑；背景與圖形不同名時行為與現在相同。
- **Acceptance criteria**: 新測試 `test/tests/data/battle-anim-asset-loading.test.ts`：對 `MoveId.PSYCHIC` 與 `MoveId.LICK` 呼叫 `loadMoveAnimAssets` 時，spy 的 `globalScene.loadImage` 不以重複名稱被呼叫，`loadSpritesheet` 以該名稱被呼叫一次；對背景名稱不同於圖形的招式（測試中選一個有背景事件的招式）`loadImage` 仍被呼叫。手動：真實瀏覽器使用 Psychic 後 Console 沒有該警告且背景顯示正常。
- **Scope**: 只改 `loadAnimAssets` 與其測試。

## Risks / Trade-offs

- [哪一個 `addImage` 先完成取決於載入順序，只保留 spritesheet 後，背景貼圖一律來自 spritesheet 形式] → 背景以 `tileSprite(..., resourceName)` 建立，只使用貼圖的預設整張影格（`__BASE`），spritesheet 與 image 兩種形式都有，所以畫面相同；以手動檢查 Psychic 與 Lick 背景確認。
- [測試環境可能無法載入真實動畫 json] → 測試中以 `AnimConfig` 實例或 spy 提供資料，不依賴網路。
