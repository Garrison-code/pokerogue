## 2026-11-05 實作驗證

- 在 `beta` 還原暫存計劃。
- 使用 Node.js 掃描 `assets/battle-anims/*.json` 共 928 檔，逐一檢查單一／雙版本動畫的 `AnimTimedAddBgEvent.resourceName` 是否等於 `graphic`。
- 同名清單只有 `lick.json` → `PRAS- Sketch + Lick` 與 `psychic.json` → `PRAS- Psychic BG`。
- 不同名案例採用 `agility.json`：圖形 `mixed`、背景 `PRAS- Speed BG`。
- 回歸測試直接以 Node `fs` 讀取真實 JSON，避開共享 fetch mock 將所有動畫替換成 Tackle 的設定；保留 Lick 的雙版本，測試後還原 `moveAnims`。
- 修正前：Psychic／Lick 兩項測試失敗、Agility 通過。Lick 雙版本另使同名 spritesheet 排入兩次，因此 `graphics` 集合也用來避免重複排入圖形。
- 修正後：三項測試通過；共用名稱只排入 spritesheet，不同名背景仍排入 image。
- `pnpm typecheck`：exit 0。
- `pnpm exec biome check test/tests/data/battle-anim-asset-loading.test.ts src/data/battle-anims.ts --diagnostic-level=error`：通過。
- `pnpm exec vitest run test/tests/data test/tests/mystery-encounter`：36 檔通過、444 tests passed、4 skipped、1 todo；exit 1 的原因為 15 次已知 `src/i18n.ts:213` 的 `localStorage.getItem` unhandled rejection，沒有測試案例失敗。日誌：`%TEMP%/anim-texture-regression.log`。
- 最終單檔重跑：3 tests passed；exit 1 同樣源自 1 次既有 i18n unhandled rejection。日誌：`%TEMP%/anim-texture-green.log`。修正前證據：`%TEMP%/anim-texture-red.log`。型別檢查日誌：`%TEMP%/anim-texture-typecheck.log`。
- 任務 3.2 完成：因 Computer Use 無法連線，啟動 `pnpm start:dev`（port 8000）後改由使用者親自在瀏覽器驗證。臨時招式設定為 Psychic／Lick／Agility／Splash，敵方為只會 Splash 的鯉魚王。使用者回報「三個皆正常且無警告」，確認三個動畫背景正常，沒有材質重複警告；本紀錄依據使用者實測回報。
- 驗證後依使用者指示移除所有臨時 overrides，關閉開發伺服器，再歸檔、commit 並 push `beta`。
