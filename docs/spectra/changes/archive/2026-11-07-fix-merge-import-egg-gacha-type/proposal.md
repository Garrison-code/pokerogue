## Problem

使用者(朋友)從伺服器匯出的 `.prsv` 存檔無法用「合併匯入」匯入,匯入時直接回報不支援的欄位 `eggs.0.gachaType`,整份存檔被拒絕,無法合併。

## Root Cause

已用真實的 `decodeSystemImport` 與該存檔驗證(實測,非推測):

- 該存檔每一顆蛋(共 96 顆,`gachaType` 皆為 0)都帶有已淘汰的舊欄位 `gachaType`;存檔 `gameVersion` 為 `1.12.2.3`,與目前遊戲版本相同。
- `decodeSystemImport`(`src/system/system-data-merge.ts`)在存檔版本等於目前版本時,會對正規化後的原始 JSON 呼叫嚴格的 `validateSystemImportShape`。它的蛋欄位白名單 `eggKeys` 不含 `gachaType`,於是拋出 `MergeImportError("unsupported", "eggs.0.gachaType")`。
- 同檔案中較寬鬆的 `validateKnownSystemFields` 已經特別放行 `gachaType`,兩個驗證器對同一個欄位的判斷不一致,這就是漏洞所在。
- `EggData` 建構子本來就能處理 `gachaType`(`species === 0` 的舊蛋用 `gachaType ?? sourceType`),且輸出物件不含 `gachaType`,所以「解析之後」的第二次形狀檢查不會出問題;只有「解析之前」的那一次會擋住。
- 反證:把同一份存檔每顆蛋的 `gachaType` 移除後,`decodeSystemImport` 成功通過(結果 OK)。

## Proposed Solution

在 `decodeSystemImport` 的正規化步驟(與既有的 `ribbons: ""` → `"0"`、`starterMoveData: null` 處理並列),針對每顆蛋:

1. 若蛋沒有 `sourceType` 但有 `gachaType`,先用 `gachaType` 補上 `sourceType`(保留舊蛋語意)。
2. 刪除 `gachaType`。

如此舊欄位在嚴格形狀檢查之前就被正規化掉,而 `validateSystemImportShape` 對未知欄位的嚴格拒絕完全不變(例如 `{"unknown":1}` 仍須被拒絕)。

本變更新增一個能力規格 `system-merge-import`,記錄合併匯入對伺服器匯出存檔(含舊欄位)的接受規則。

另列一項驗證任務:`src/system/game-data.ts` 匯入回呼中解析之後的檢查(物種/解鎖/成就/兌換券白名單、`validateSystemData`)是否也會擋住這份存檔,目前尚未驗證。

## Non-Goals

- 不放寬 `validateSystemImportShape` 的欄位白名單,也不接受任意未知欄位。
- 不更改合併規則本身(蛋的去重、糖果、友好度等)。
- 不處理伺服器端(Go API)仍輸出 `gachaType` 的問題。
- 不把朋友的真實存檔提交進 repo;測試只用合成資料。

## Success Criteria

- 帶有 `gachaType` 的同版本存檔(包含朋友那份)可通過 `decodeSystemImport`。
- `gachaType` 不會出現在解析結果中,且存檔指紋(fingerprint)與不含 `gachaType` 的等價存檔相同。
- 只有 `gachaType` 沒有 `sourceType` 的舊蛋,解析後 `sourceType` 等於原 `gachaType`。
- 未知蛋欄位(如 `{"unknown":1}`)仍被拒絕並回報 `unsupported`。
- 以朋友的存檔實測 `game-data.ts` 匯入回呼的後續檢查,結果記錄在任務中(若有其他阻擋,另行回報,不在本變更內擴張)。

## Impact

- Affected code:
  - Modified: src/system/system-data-merge.ts, test/tests/system/system-data-merge.test.ts
  - New: docs/spectra/specs/system-merge-import/spec.md(歸檔時產生)
  - Removed: none
