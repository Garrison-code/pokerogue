## 1. 測試先行(先看到失敗)

- [x] 1.1 在 `test/tests/system/system-data-merge.test.ts` 新增一個獨立的測試案例(自行建立 decoder,結構比照既有 "decodes encrypted/plain/abbreviated data" 案例),以合成資料(不得使用朋友的真實存檔)涵蓋規格 "Legacy egg gachaType is normalized before strict validation" 的三個情境:同版本存檔每顆蛋帶 `gachaType: 0` 可解碼且結果蛋沒有 `gachaType`;與不含 `gachaType` 的等價存檔 `systemFingerprint` 相同;只有 `gachaType: 3` 沒有 `sourceType` 的蛋解碼後 `sourceType` 為 3(同時涵蓋 `sourceType: 2, gachaType: 0` 保留 2 的優先順序)。驗證:執行 `pnpm exec vitest run test/tests/system/system-data-merge.test.ts`,修復前新案例以 `unsupported` 失敗(符合預期的紅燈)。
- [x] 1.2 在同一測試檔確認規格 "Unknown egg fields remain rejected":既有案例(`eggs` 改成 `[{"unknown":1}]` 並期待 `unsupported`)必須維持通過;另在新案例補一條「同時帶 `gachaType` 與未知欄位的蛋仍回報 `unsupported`」。驗證:同一指令,此斷言在修復前後皆通過。 [after: 1.1]

## 2. 修復

- [x] 2.1 在 `src/system/system-data-merge.ts` 的 `decodeSystemImport` 正規化步驟(與 `ribbons` 空字串、`starterMoveData`/`starterEggMoveData` null 的處理並列,且位於嚴格 `validateSystemImportShape` 之前)加入蛋的正規化:缺少 `sourceType` 且有 `gachaType` 時以其補上,然後刪除 `gachaType`;`eggs` 缺漏或不是陣列時不得因此拋出非預期錯誤(維持原有的 invalid 行為)。`validateSystemImportShape` 的白名單不變。驗證:1.1 與 1.2 的測試全數通過,且該檔其餘既有測試無回歸。 [after: 1.1, 1.2]

## 3. 驗證

- [x] 3.1 以朋友的存檔(`C:\Users\garytsai\.paseo\uploads\upload_36b5b886-2221-4cfe-8d39-aad004351995\data_tmw8795.prsv`,以遊戲的 `saveKey` AES 解密為 JSON 後,放在 repo 以外的暫存資料夾)執行真實 `decodeSystemImport`,確認不再拋出 `eggs.0.gachaType` 錯誤;暫存檔與暫時性測試於事後刪除,存檔內容不得提交。驗證:記錄實測結果(OK 或新的錯誤欄位)。 [after: 2.1]
- [x] 3.2 檢查 `src/system/game-data.ts` 合併匯入回呼中「解析之後」的檢查(物種/可選初始寶可夢白名單、`unlocks`/`achvUnlocks`/`voucherUnlocks`/`voucherCounts` 白名單、`validateSystemData`)是否會擋住該存檔:對朋友存檔的解碼結果逐項比對這些白名單。驗證:列出每一項檢查的通過/失敗;若有失敗,在回報中指出欄位並另開提案,不在本變更內擴張修改範圍。 [after: 3.1]
- [x] 3.3 執行 `pnpm typecheck` 與 `pnpm exec biome check` 針對變更檔案。驗證:兩者無新增錯誤(既有的 `src/i18n.ts` `localStorage` 未處理錯誤屬已知、與本變更無關)。 [after: 2.1]
