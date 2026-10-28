<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# 專案長期記憶

滑鼠操作 UI 專案的決策、實作順序及完成狀態，統一記錄在
[docs/mouse-ui-roadmap.md](docs/mouse-ui-roadmap.md)。處理相關工作前先閱讀該文件。

- 使用分支 `feat/mouse-ui-support`，PR 的目標分支是 `develop`。
- 使用者可先合入目前進度；階段 PR 合併不代表整個滑鼠 UI 已完成。合併後保留並沿用此分支，待辦狀態依 roadmap 維持；後續批次以同分支另開目標為 `develop` 的 draft PR。
- 每完成一個頁面／追蹤項目，驗證後在同一個 commit 將文件中的項目標成 `[x]`，補上完成紀錄，並 push 到同一支分支，讓使用者從 draft PR 逐頁檢視。
- 未完成的項目保持 `[ ]`；不得因已有部分滑鼠支援或只完成規劃而標成 done。
- 初始規劃階段已結束；後續依使用者指定範圍逐項實作與驗證。
