# 實作驗證紀錄

日期：2026-11-04

- 修正前：`pnpm exec vitest run test/tests/data/species-load-assets.test.ts`，未指定 variant 的案例逾時，已指定 variant 的案例通過。
- 修正後：上述檔案 5 項通過；包含等待變體顏色與素材、缺圖、空影格後重試、動畫 frameRate 10。
- `pokedex-list-sprite.test.ts`：3 項通過，驗證灰色／黑色 tint、載入後顯示與播放，以及較早載入不得覆蓋新選擇。沿用 MockSprite，因此以 setVisible、setTint、play 的呼叫驗證。
- `pnpm typecheck`：通過。
- `pnpm exec vitest run test/tests/ui test/tests/data test/tests/pokemon`：72 檔通過、4 檔略過；1054 項通過、24 項 todo，無測試案例失敗。Vitest 回報 15 次既有 `src/i18n.ts:213` localStorage.getItem 未處理錯誤，程序退出碼為 1；並非完全無錯誤的測試執行。
- 新增測試的 Biome 檢查通過；`git diff --check` 通過。

## 人工驗證完成（任務 4.1）

`pnpm start:dev --port 8000` 成功啟動。自動操作環境的瀏覽器與桌面連線不可用，因此由使用者在真實瀏覽器操作確認。

使用者依驗證步驟檢查僅看過但未捕獲、完全未看過的寶可夢，以及快速切換，回報「一切正常」：灰色／黑色剪影正常出現，沒有持續空白或舊選擇覆蓋新選擇。使用者確認後要求關閉服務並歸檔、推送 beta。

執行輸出位於系統暫存目錄：`species-red.log`、`species-guard.log`、`pokedex-sprite.log`、`species-typecheck.log`、`species-regression.log`。
