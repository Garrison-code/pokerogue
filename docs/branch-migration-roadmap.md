<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Branch 與 CI 遷移 Roadmap（pokerogue）

這份文件只定義**目標與驗收條件**，詳細的實作步驟由負責實作的 agent 另外規劃。
rogueserver 有一份對應的文件：`rogueserver/docs/branch-migration-roadmap.md`，兩邊要一起進行。

## 背景

- 這個 repo fork 自 `pagefaultgames/pokerogue`。fork 時沒有照上游的開發流程，自己加了 `develop` branch，並把 `beta` 當成正式版。
- 上游的流程：
  - `beta` 是開發用的主 branch，也是預設 branch，PR 都發到 `beta`。
  - `main` 是正式版。
  - 發版由 `create-release.yml` 從 `beta` 開 `release` branch。
  - Hotfix 用 `hotfix-*` branch。
  - 上游的部署 workflow 都有加 `github.repository == 'pagefaultgames/pokerogue'` 的條件，在 fork 裡不會執行。
- 原本部署用的 VPS 已經退掉，`notify-develop` 和 `notify-production` 兩個通知 job 已經在 `develop` 上刪除（commit `e1a50acb`）。
- 新的部署目標：Oracle Cloud Always Free 的 **ARM（arm64）** VM，用 docker compose 跑前端（nginx 靜態容器）、rogueserver 和 MariaDB，前面套 Cloudflare 免費方案。部署本身是第 4 階段，不在這份文件的範圍內。

## 目標狀態

| Branch | 角色 | 推送後的 CI 行為 |
|---|---|---|
| `beta` | 開發主線，feature branch 合進這裡 | 跑測試和 lint；是否建測試用 image 見「待決定事項」 |
| `main` | 正式版，由 `beta` 合入 | 跑測試和 lint，並建正式 image 推到 GHCR |
| `develop` | 廢除 | — |

- 正式 image 要同時支援 `linux/amd64` 和 `linux/arm64`。
- 同步上游時只合上游的 `beta`，不另外同步上游的 `main`。

## 第 1 階段：在 `develop` 上整理 GitHub Actions

先在 `develop` 上改好，第 2 階段合進 `beta` 時才會照新規則觸發。

### 目標

1. **`ghcr.yml`**
   - 觸發 branch 從 `[beta, develop]` 改成 `main`，`beta` 視「待決定事項」決定要不要保留。
   - Tag 對應改成：`main` → `latest`。不再產生 `develop` tag。
   - 刪除只為 `develop` 服務的部分：`quality` 的 develop 判斷、「Confirm develop is still current」、`registry-ready`、`deploy-develop`（Tailscale／Coolify 部署），以及 `workflow_dispatch` 的 `deploy`、`check` 模式和相關 inputs。
   - `registry-ready-production` 改成驗證 `main` 發佈的 image，不再需要的話就刪除。
   - Build 平台從 `linux/amd64` 改成 `linux/amd64,linux/arm64`（需要 QEMU 或原生 arm runner）。
   - `APP_TITLE` 這類依 branch 切換的設定，改成依 `main`／`beta` 判斷。
2. **`deploy-production.yml`**：刪除。這是舊 VPS 的部署流程，新的部署方式在第 4 階段另外設計。
3. **`deployment-checks.yml`**：觸發 branch 改成 `beta`、`main`。刪掉只檢查舊 VPS 部署工具的 job（`tooling`），保留靜態 image 的建置檢查（`static-image`）。
4. **`tests.yml`、`linting.yml`**：從 `push` 和 `pull_request` 的 branch 清單拿掉 `develop`，盡量回到跟上游一樣的狀態，減少同步上游時的衝突。
5. **`.github/scripts/`**：刪除舊 VPS 部署專用的 Python 腳本和對應的測試：
   - `dev_deploy.py`、`prod_deploy.py`、`prod_check_static.py`、`production_network.py`
   - `publish_notify.py`、`publish_production.py`
   - `test_deploy.py`、`test_prod_deploy.py`、`test_publish.py`、`test_publish_production.py`

   如果 `ghcr.yml` 剩下的步驟還用到其中某支腳本，就只保留那支並拿掉 develop 相關邏輯。上游原有的 `apply-labels.mts`、`pr-title.mts`、`changelog-reader`、`update-submodule` 不要動。
6. **保留** `Dockerfile.static`、`vite.container.config.ts`、`container/`，第 4 階段會用到。`container/README.md` 和 `docs/container-images.md` 裡提到 develop 的地方，可以在這階段改，也可以留到第 6 階段。

### 驗收條件

- `.github/` 底下沒有任何 workflow 會被 `develop` 觸發，也沒有任何 workflow 會在 `beta` 上觸發正式版發佈。
- `ghcr.yml` 在 `main` push 時會建出 amd64 加 arm64 的 multi-arch image，tag 是 `latest`。
- 沒有任何 workflow 參照已刪除的腳本、`DEV_AUTO_DEPLOY_ENABLED`、`PROD_AUTO_DEPLOY_ENABLED`、Tailscale 或 Coolify 相關的 secrets。
- `pnpm` 的 lint 和 typecheck（包含 `typecheck:github`）通過。
- Commit 和 PR 標題照上游的 Conventional Commits 規則寫，CI 改動用 `github:` 前綴，不要用 `ci:`。

## 第 2 階段：把 `develop` 合進 `beta`

### 目標

- 把 `develop` 的所有 commit（包含第 1 階段的改動）合進 `beta`。
- `beta` 上有 2 個 commit 不在 `develop` 裡：`1c016c19`（#10）和 `169ccb12`（#11，正式部署自動化）。合併時以第 1 階段的結果為準：#11 加的正式部署流程要跟著第 1 階段一起移除，不能被合併帶回來。
- `beta` 受 ruleset「Require PRs on beta/main/develop/master」保護，`Garrison-code` 有 bypass。建議還是開 PR（`develop` → `beta`），讓 CI 先跑一遍。

### 驗收條件

- `git log beta..develop` 是空的，也就是 `develop` 的所有 commit 都已經在 `beta` 上。
- `beta` 上的 `.github/workflows/` 符合第 1 階段的驗收條件。
- `beta` 上的測試和 lint 全部通過。
- 合併後 push 到 `beta`，不會觸發正式 image 發佈。

## 第 3 階段：同步上游 `beta`

### 目標

- 把 `pagefaultgames/pokerogue` 的 `beta` 合進 fork 的 `beta`。調查時（2026-11-01）落後 37 個 commit。
- 建議在本機加一個 `upstream` remote 指向 `https://github.com/pagefaultgames/pokerogue.git`。
- 解衝突的原則：
  - **上游原有的 workflow**（`tests.yml`、`linting.yml` 等）以上游的版本為主，只保留 fork 必要的差異。
  - **fork 自己的功能**（滑鼠操作 UI、merge import、type chart 面板等）的行為要維持不變。
- `assets`、`locales` 兩個 submodule 的指標跟著上游更新。
- 用 merge 同步，不要 rebase，因為 `beta` 是共用的 branch，不能改寫歷史。

### 驗收條件

- `git log beta..upstream/beta` 是空的。
- 完整測試（`pnpm test`）、lint 和 typecheck 全部通過。
- 本機 `pnpm build` 成功，`Dockerfile.static` 也能建出 image。

## 不在這份文件範圍內的事

- **第 0 階段**：Oracle Cloud、Cloudflare、Hostinger nameserver 的設定，由使用者自己處理。
- **第 4 階段**：VM 上的 docker compose、Cloudflare DNS、自動更新（Watchtower 或 SSH 部署）。
- **第 5 階段**：第一次把 `beta` 合進 `main` 發版。
- **第 6 階段**：
  - 刪除 `develop` branch。
  - 把 `develop` 從 ruleset 拿掉。
  - 更新 `AGENTS.md`、`CONTRIBUTING.md`、`docs/develop-deployment.md` 等文件。
  - 清掉 repo 變數和 secrets。
  - 設定 MariaDB 備份。

## 待決定事項

1. **`beta` 要不要建測試用 image**（例如 tag `beta`），讓 VM 可以另外跑一個測試站。如果不需要，`ghcr.yml` 就只在 `main` 觸發。
2. **`ghcr.yml` 要不要保留 `workflow_dispatch`**，用來手動重新發佈 image。
3. **arm64 的建置方式**：用 QEMU 模擬比較慢；GitHub 提供 `ubuntu-24.04-arm` runner，原生建置比較快，但 matrix 和合併 manifest 會比較複雜。
