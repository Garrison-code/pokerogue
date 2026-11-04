<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# 實作與驗證紀錄

- `setSpecies` 看過但未捕獲分支優先使用 `starterPreferences.formIndex`，未指定時沿用預設形態。
- 修正前：新增測試的 Mega（form 1）、超極巨化（form 2）案例均收到 form 0 而失敗；預設形態及未看過的黑色剪影案例通過。
- 修正後：`pnpm exec vitest run test/tests/ui/pokedex-page-form-sprite.test.ts` 的 4 個案例斷言全數通過，包含灰色 tint、黑色剪影及隱藏名稱。
- `pnpm typecheck` 通過（exit 0）。
- `pnpm exec vitest run test/tests/ui`：60 個測試檔通過、4 個 skipped；915 項通過、22 項 todo；無斷言失敗。另有 15 個既有 `src/i18n.ts:213` 的 `localStorage.getItem` 非同步錯誤，因此命令 exit 1。單檔測試也有同類既有錯誤。
- 本次兩個 TypeScript 檔案的 Biome 檢查與 `git diff --check` 通過。
- 測試輸出位於本機暫存目錄：`pokedex-form-red.log`、`pokedex-form-silhouette.log`、`pokedex-form-green.log`、`pokedex-form-ui.log`、`pokedex-form-typecheck.log`。

## 使用者手動驗證（任務 3.2）

- 已啟動 `pnpm start:dev --port 8000 --strictPort`，網址 `http://localhost:8000/`，HTTP 200。
- 進入看過但未捕獲的妙蛙花詳情頁，選「進化」→超級進化，再選「進化」→超極巨化。
- 預期大圖依序顯示超級妙蛙花及超極巨妙蛙花，兩者維持灰色。
- 2026-11-05：使用者回答 Q5 A，確認兩種形態都正常；任務 3.2 完成，服務保持開啟。
