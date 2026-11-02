## Why

這個 fork 自己加了 `develop` branch、把 `beta` 當正式版，和上游 `pagefaultgames/pokerogue`（`beta` 開發 → `main` 正式）相反；舊 VPS 已退掉，但 GitHub Actions 仍保留 develop 部署、Tailscale／Coolify 和正式版自動部署流程。整體 Roadmap（`D:\Work\PokeRogue\ROADMAP.md`）第 4 階段要在 Oracle Cloud ARM VM 上部署，必須先把 branch 和 CI 對齊上游、並產出 arm64 image，所以現在要完成 `docs/branch-migration-roadmap.md` 的第 1–3 階段。

## What Changes

- **第 1 階段（在 `develop` 上）**：整理 GitHub Actions
  - `.github/workflows/ghcr.yml`：只在 push 到 `main` 時發佈 image，tag 為 `latest` 加 `sha-<commit>`；保留沒有 inputs 的 `workflow_dispatch`，但只允許在 `main` 上發佈；build 平台改成 `linux/amd64,linux/arm64`（QEMU）；刪除 `quality`、「Confirm develop is still current」、`registry-ready`、`deploy-develop`、`registry-ready-production`，以及 `mode`／`source_*`／`resume` inputs；`APP_TITLE` 不再依 `develop` 切換。
  - `Dockerfile.static`：build stage 加上 `--platform=$BUILDPLATFORM`，讓 node／vite 建置在 runner 原生平台執行，只有 nginx runtime stage 走 QEMU。
  - 刪除 `.github/workflows/deploy-production.yml`。
  - `.github/workflows/deployment-checks.yml`：觸發 branch 改成 `beta`、`main`；刪除 `tooling` job，保留 `static-image`。
  - `.github/workflows/tests.yml`、`.github/workflows/linting.yml`：從 `push`／`pull_request` 拿掉 `develop`。
  - 刪除 `.github/scripts/` 下 10 支舊 VPS 部署用 Python 腳本與測試。
  - `container/README.md`、`docs/container-images.md`：改寫成 `main` → `latest` 的新發佈規則，並說明正式部署時 `VITE_SERVER_URL` 要設成 `https://api.<網域>`（image 預設的 `/api` 只供 CI 驗證）。
- **第 2 階段**：以 PR（`develop` → `beta`）把 `develop` 合進 `beta`，衝突以第 1 階段結果為準，確保 `beta` 上的 #11（`169ccb12`）正式部署流程不會被帶回來。
- **第 3 階段**：加 `upstream` remote，用 merge（不 rebase）把 `pagefaultgames/pokerogue` 的 `beta` 合進 fork 的 `beta`，含 `assets`、`locales` submodule 指標。
- **任務回報**：全部完成後，在 repo 外的 `D:\Work\PokeRogue\pokerogue-migration-report.md` 寫下各階段 PR、驗收結果、偏離與給第 4 階段的注意事項。

## Non-Goals (optional)

- 第 0、4、5、6 階段：Oracle VM／Cloudflare 設定、docker compose 部署、第一次 `beta` → `main` 發版、刪除 `develop` branch、修改 ruleset、清 repo 變數與 secrets、MariaDB 備份。
- 不為 `beta` 建測試用 image（使用者決定：只在 `main` 發佈）。
- 不用 `ubuntu-24.04-arm` 原生 runner 拆 matrix（使用者決定：用 QEMU）。
- 不改上游原有的 `apply-labels.mts`、`pr-title.mts`、`changelog-reader`、`update-submodule`、`deploy.yml`、`deploy-beta.yml`、`github-pages.yml` 等 workflow（它們都有 `github.repository == 'pagefaultgames/pokerogue'` 條件，在 fork 不會執行）。
- 不更新 `AGENTS.md`、`CONTRIBUTING.md`、`docs/develop-deployment.md`（第 6 階段）。
- rogueserver repo 的對應工作不在這個 change 內。

## Impact

- Affected specs: none
- Affected code:
  - New: (none)
  - Modified: .github/workflows/ghcr.yml, .github/workflows/deployment-checks.yml, .github/workflows/tests.yml, .github/workflows/linting.yml, Dockerfile.static, container/README.md, docs/container-images.md
  - Removed: .github/workflows/deploy-production.yml, .github/scripts/dev_deploy.py, .github/scripts/prod_deploy.py, .github/scripts/prod_check_static.py, .github/scripts/production_network.py, .github/scripts/publish_notify.py, .github/scripts/publish_production.py, .github/scripts/test_deploy.py, .github/scripts/test_prod_deploy.py, .github/scripts/test_publish.py, .github/scripts/test_publish_production.py
- Branches：`develop` 合進 `beta`；上游 `beta` 合進 fork 的 `beta`。
- Repo 外：完成後在 `D:\Work\PokeRogue\pokerogue-migration-report.md` 留下任務回報。
- Compatibility: no capability-level observable behavior changes；push 到 `beta` 不再發佈 `latest` image，`develop` tag 不再更新。
