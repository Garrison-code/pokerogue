## Context

詳情頁在 `show()` 中把 `savedStarterPreferences.formIndex` 放進 `this.formIndex` 與 `this.starterPreferences`（`initStarterPrefs` 對已看過的寶可夢保留 `formIndex`，沒有清除它），再呼叫 `setSpecies()`。`setSpecies` 依捕獲狀態分三條路：已捕獲（尊重 `starterPreferences`）、看過未捕獲（使用 `getSpeciesDefaultDexAttrProps`）、完全沒看過（固定 form 0 與黑色剪影）。第二條路忽略了使用者選的形態。

清單頁的形態列表走 `setSpeciesDetails(species, { formIndex })`，直接傳入選取形態，所以不受影響。

## Goals / Non-Goals

**Goals:**

- 看過但未捕獲時，詳情頁的大圖與所選形態一致。

**Non-Goals:**

- 不改變完全沒看過分支。
- 不改變預設形態的決定方式（`getSpeciesDefaultDexAttrProps` 不動）。
- 不處理 loader 的 Promise 行為。

## Decisions

### Honor the selected form in the seen-but-uncaught branch

在未捕獲分支，`formIndex` 取 `starterPreferences?.formIndex ?? props.formIndex`，其中 `props` 仍是 `getSpeciesDefaultDexAttrProps` 的結果；其他屬性與灰色 tint 不變。
替代方案：修改 `getSpeciesDefaultDexAttrProps` 讓它接受偏好。否決：它也被選擇起始寶可夢等其他畫面使用，影響面大於需要。
替代方案：讓進化選單不能點未捕獲形態。否決：選單現在把它們用灰字列出但可點，目的就是能預覽；而且清單頁的形態列表已允許預覽。

## Implementation Contract

- **Behavior**: 看過但未捕獲的寶可夢，詳情頁在 `starterPreferences.formIndex` 有值時，以該形態載入並播放 sprite，保持灰色 tint；無值時行為與現在相同。
- **Interface**: `setSpecies` 為 private，簽章不變；不新增公開 API。
- **Failure modes**: `starterPreferences.formIndex` 指向的形態不存在時，與已捕獲分支相同，不另做額外處理。
- **Acceptance criteria**: 新測試 `test/tests/ui/pokedex-page-form-sprite.test.ts`（沿用 `pokedex-page-pointer.test.ts` 的 GameManager 設定）：dex 中把妙蛙花設為「看過、未捕獲」，以 `{ formIndex: <mega 的 formIndex> }` 作為 saved preferences 開啟 `UiMode.POKEDEX_PAGE`，預期 `loadAssets`（以 spy）被呼叫時 `formIndex` 等於該 mega 形態；不給 preferences 時預期為 0；已捕獲與完全沒看過的行為不變。手動：真實瀏覽器在沒捕獲的妙蛙花詳情頁點「進化」→超級進化，大圖變成超級妙蛙花（灰色）。
- **Scope**: 只改 `setSpecies` 的未捕獲分支與其測試。

## Risks / Trade-offs

- [顯示未捕獲形態的圖可能被視為劇透] → 清單頁形態列表與進化選單已經會顯示或列出這些形態，不新增資訊；仍維持灰色 tint 以表示未解鎖。
- [測試中判斷「看過」的方式與真實存檔不同] → 測試直接設定 `gameData.dexData[...].seenAttr`（`isSeen` 讀的欄位），並以 spy 控制 `loadAssets`，不依賴真實載入。
