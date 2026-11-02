## Context

- 整體計畫在 `D:\Work\PokeRogue\ROADMAP.md`（不在這個 repo 內），本 repo 的第 1–3 階段目標與驗收條件寫在 `docs/branch-migration-roadmap.md`。這個 change 是那三個階段的實作計畫。
- 目前 `develop` 比 `beta` 多 75 個 commit（2026-11-02 用 `git log --oneline beta..develop | wc -l` 量得）；`beta` 有 2 個 commit 不在 `develop`：`1c016c19`（#10，把當時的 develop 功能整包帶進 beta）、`169ccb12`（#11，正式部署自動化，新增 `deploy-production.yml`、`prod_deploy.py`、`prod_check_static.py`、`production_network.py`、`publish_production.py`、`test_prod_deploy.py`、`test_publish_production.py`，並修改 `ghcr.yml`、`deployment-checks.yml`、`publish_notify.py`）。
- 用 `git merge-tree --write-tree --name-only beta develop` 預覽（2026-11-02，第 1 階段改動之前），合併會有 13 個衝突檔：
  - CI：`.github/scripts/{dev_deploy,prod_deploy,test_deploy,test_prod_deploy}.py`、`.github/workflows/{deploy-production,deployment-checks,ghcr}.yml`
  - 功能：`docs/type-chart-panel.md`、`src/ui/type-chart-panel.css`、`src/ui/type-chart-panel.ts`、`test/tests/system/game-data.test.ts`、`test/tests/ui/inputs.test.ts`、`test/tests/ui/type-chart-panel.test.ts`
  - 第 1 階段刪檔後，CI 檔的衝突型態會變成 modify/delete，清單需要在合併時重新確認。
- 現行 `ghcr.yml` 在 push 到 `beta` 時發佈 `latest`；push 到 `develop` 時經過 `publish_notify.py` 的品質閘門後發佈 `develop` tag，並由 `deploy-develop` 透過 Tailscale／Coolify 部署；只建 `linux/amd64`。
- `Dockerfile.static` 的 build stage 跑 `pnpm install` 和 `vite build`，runtime stage 是 `nginxinc/nginx-unprivileged`；`dist` 是平台無關的靜態檔。
- 上游的部署 workflow（`deploy.yml`、`deploy-beta.yml`、`github-pages.yml` 等）都有 `github.repository == 'pagefaultgames/pokerogue'` 條件，在 fork 不會執行，不需要改。
- ROADMAP（2026-11-02 更新，前端採方案 1）：VM 上用 docker compose 跑前端 nginx 容器、rogueserver、MariaDB、cloudflared；對外全部走 Cloudflare Tunnel，VM 不開 80、443。子網域 `game.<網域>` 對應前端、`api.<網域>` 對應 rogueserver；正式部署時前端容器的 `VITE_SERVER_URL` 必須是 `https://api.<網域>`（https、結尾不加 `/`），因為 `container/nginx.conf` 對 `/api` 和 `/api/` 直接回 404，Tunnel 也不能改寫路徑，所以不用單一網域加 `/api`。
- 長期方向（方案 3）是程式放 Cloudflare Pages、assets 放 R2，屆時 `Dockerfile.static` 和 `container/` 可能淘汰；現階段 VM 仍在 ARM 上跑容器，所以 multi-arch image 仍然必要，`Dockerfile.static` 與 `container/` 要保留。GitHub Pages 已被 ROADMAP 排除。
- 使用者已決定 roadmap 的三個待決定事項：不建 `beta` 測試 image；保留 `workflow_dispatch` 但只限 `main`；arm64 用 QEMU。

## Goals / Non-Goals

**Goals**

- 第 1 階段：`develop` 上的 `.github/` 符合 roadmap 第 1 階段全部驗收條件。
- 第 2 階段：`develop` 的所有 commit 都在 `beta` 上，且 #11 的正式部署流程沒有回來。
- 第 3 階段：fork 的 `beta` 包含上游 `beta` 的所有 commit，測試、lint、typecheck、`pnpm build`、`Dockerfile.static` 建置都通過。

**Non-Goals**

- 第 0、4、5、6 階段的所有工作（VM、compose、Cloudflare、第一次發版、刪 `develop`、ruleset、repo 變數與 secrets、備份）。
- `beta` 測試 image、原生 arm runner matrix。
- 改動上游原有的 workflow，或 `.github/scripts/` 下的上游檔案（`apply-labels.mts`、`pr-title.mts`、`changelog-reader`、`update-submodule`）。
- 更新 `AGENTS.md`、`CONTRIBUTING.md`、`docs/develop-deployment.md`。

## Decisions

### ghcr.yml 只由 main 觸發，dispatch 限 main

`on.push.branches: [main]` 加上沒有 inputs 的 `workflow_dispatch`。`publish` job 的條件為 `github.repository == 'Garrison-code/pokerogue' && github.ref == 'refs/heads/main'`，在其他 branch 手動執行時 job 會被 skip，不會發佈。Tags：`type=raw,value=latest` 加 `type=sha,format=long,prefix=sha-`，維持 `flavor: latest=false`。`concurrency` 簡化為 `group: ghcr-${{ github.ref }}`、`cancel-in-progress: true`。

替代方案：保留 `beta` → `beta` tag（使用者拒絕；之後需要再加）。

### 刪除品質閘門，改靠 branch ruleset

舊的 `quality` job 用 `publish_notify.py` 等待同一 commit 的 checks。改到 `main` 後，`main` 只透過 PR 從 `beta` 合入，ruleset 要求 PR，測試在 PR 上已跑過，所以 `ghcr.yml` 不再重複等待 checks。這樣 `ghcr.yml` 不再需要 `.github/scripts/` 的任何 Python 腳本，10 支腳本可以全部刪除。

### registry-ready-production 直接刪除

它只用來給 `deploy-production.yml` 判斷 image 是否就緒（呼叫 `publish_production.py`）。`deploy-production.yml` 刪除後沒有消費者；`docker/build-push-action` 回傳 digest，加上 Summary 步驟寫出 pinned image，已足以確認發佈。

### arm64 用 QEMU，且 build stage 跑在原生平台

`publish` job 在 Buildx 之前加 `docker/setup-qemu-action@v3`，推送步驟用 `platforms: linux/amd64,linux/arm64`。`Dockerfile.static` 的 build stage 改成 `FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build`：`dist` 是靜態檔，node／vite 只需在 runner 原生的 amd64 跑一次；QEMU 只負責 runtime stage 的 `apk add jq` 和檔案複製，避免在模擬環境跑 vite build。

替代方案：`ubuntu-24.04-arm` 原生 runner 加 manifest 合併 job（使用者拒絕，workflow 較複雜）。

### 驗證步驟維持 amd64 單平台 load

buildx 的 `load: true` 不支援 multi-platform，所以「Build static image for validation」維持 `platforms: linux/amd64` + `load: true` 並跑 `container/check_static.py`；之後「Build and push image」才推兩個平台。兩次 build 的 `type=gha` cache scope 改成固定的 `container-main`。

### APP_TITLE 固定為正式版標題

只有 `main` 會發佈，`APP_TITLE` 直接設為 `PokéRogue (Garrix)`，不依 branch 判斷。`deployment-checks.yml` 的 `static-image` 仍用 `PokéRogue (Garrix-dev)` 當 PR 檢查標題（只驗證 runtime 標題注入，不發佈）。

### deployment-checks.yml 只留 static-image

觸發改成 `push`／`pull_request` 的 `[beta, main]`。`tooling` job 測的就是被刪的腳本，並用 actionlint 檢查 `deploy-production.yml`，整個刪除。`static-image` 維持 `if: github.event_name == 'pull_request'`。

### Dockerfile.static 的 VITE_SERVER_URL 預設值維持 /api

`container/check_static.py` 只接受 `/api` 或 `<base>/api` 作為 runtime 的 `VITE_SERVER_URL`，`ghcr.yml` 和 `deployment-checks.yml` 的驗證步驟都依賴這個值，所以這個 change 不改 image 預設值，也不改 `check_static.py`。正式部署用的 `https://api.<網域>` 由第 4 階段的 compose 以環境變數覆寫，並在 container 文件中寫明（task 1.8）。

替代方案：把預設值改成空字串並強制部署時設定（會讓 CI 驗證失效，需同時改 `check_static.py`，留到第 4 階段視需要再做）。

### tests.yml、linting.yml 只刪 develop 那一行

只移除 `push.branches` 與 `pull_request.branches` 中的 `- develop`，不做其他改動，讓它們和上游版本一致，第 3 階段同步時衝突最少。

### 第 2 階段解衝突原則

- 用 PR `develop` → `beta`，以 merge commit 合併（不 squash、不 rebase），讓 `git log beta..develop` 變成空的。
- **CI 檔（`.github/`）**：一律採用 `develop` 的版本（第 1 階段結果）；第 1 階段刪除的檔案在合併結果中必須是刪除狀態。#11 在 `beta` 新增、`develop` 上從未存在的檔案（`prod_check_static.py`、`production_network.py`、`publish_production.py`、`test_publish_production.py`）不會報衝突、會被合併自動保留，必須明確 `git rm`。
- **功能檔（type chart 面板、`game-data.test.ts`、`inputs.test.ts`）**：`1c016c19` 是當時 develop 內容的整包帶入，develop 之後還有修正，所以預設採用 `develop` 的版本；但每個檔案都先跑 `git diff develop beta -- <file>`，確認 `beta` 沒有 `develop` 缺少的改動，若有就手動保留。

### 第 3 階段同步方式

- 加 `upstream` remote 指向 `https://github.com/pagefaultgames/pokerogue.git`，在 `beta` 開 `sync/upstream-beta` branch，`git merge upstream/beta`，再開 PR 合回 `beta`（merge commit）。
- 衝突原則：上游原有的 workflow 以上游版本為主，只保留 fork 必要差異；fork 的功能（滑鼠操作 UI、merge import、type chart 面板）行為不變，以既有測試為準。
- `assets`、`locales` submodule 指標採用上游的。

### Commit 與 PR 標題

依 `.github/scripts/pr-title.mts` 的 `PREFIXES`：CI 改動用 `github:`，container 文件用 `docs:`，合併 PR 用 `chore:`（例如 `chore: merge develop into beta`、`chore: sync upstream beta`）。不用 `ci:`。

## Implementation Contract

這個 change 只改 CI、Dockerfile 的建置平台設定、container 文件與 branch 歷史；遊戲本身的 capability-level observable behavior 不變。

**第 1 階段完成後（在 `develop`）**

- `.github/workflows/` 下沒有任何 workflow 的 `on.push.branches` 或 `on.pull_request.branches` 含 `develop`。
- `grep -rniE "dev_deploy|prod_deploy|prod_check_static|production_network|publish_notify|publish_production|DEV_AUTO_DEPLOY_ENABLED|PROD_AUTO_DEPLOY_ENABLED|coolify|tailscale|TS_CLIENT_ID|DEV_SMOKE|DEV_DEPLOY_GH_TOKEN" .github/` 沒有結果。
- `ghcr.yml` 沒有任何 job 會在 `refs/heads/beta` 發佈；`publish` job 只在 `refs/heads/main` 執行，推送 `platforms: linux/amd64,linux/arm64`，tags 為 `latest` 與 `sha-<sha>`。
- actionlint 1.7.7 對 `ghcr.yml`、`deployment-checks.yml`、`tests.yml`、`linting.yml` 沒有錯誤。使用者不安裝 Docker，所以用 `rhysd/actionlint` GitHub release 的獨立執行檔，不用 Docker image。
- `pnpm biome:ci`、`pnpm typecheck`、`pnpm typecheck:main`、`pnpm typecheck:github`、`pnpm typecheck:js` 通過。
- `ghcr.yml` 推送步驟設定 `linux/amd64,linux/arm64` 並使用 QEMU。實際的 multi-arch 建置不在本機驗證（使用者不安裝 Docker），留到第 5 階段 `main` 第一次 push：該次 Actions run 成功，且 GHCR 上 `latest` 同時有兩個平台。`Dockerfile.static` 的 amd64 建置與 `check_static.py` 由第 2、3 階段對 `beta` 的 PR 上的 `static-image` job 驗證。

**第 2 階段完成後（在 `beta`）**

- `git fetch origin && git log origin/beta..origin/develop` 為空。
- `origin/beta` 上的 `.github/` 符合第 1 階段的全部條件，`deploy-production.yml` 與 10 支腳本都不存在。
- PR 的 Tests、Linting、Deployment checks（`static-image`）全部通過；合併後 push 到 `beta` 的 Actions 列表中沒有 `Publish container image` 的 run。

**第 3 階段完成後（在 `beta`）**

- `git fetch upstream origin && git log origin/beta..upstream/beta` 為空。
- `pnpm test`、所有 `typecheck*` script 通過；`pnpm build` 成功；PR 上的 Linting 與 Deployment checks（`static-image`，涵蓋 `Dockerfile.static` 建置）通過。本機 `pnpm biome:ci` 不作為驗收依據，因為本機 `core.autocrlf=true` 會讓所有檔案報 CRLF 格式錯誤。

**失敗處理**

- 任何驗收指令失敗時不合併 PR；記錄錯誤輸出後修正。不得用 `--no-verify` 或 `Garrison-code` 的 ruleset bypass 繞過。

## Risks / Trade-offs

- [QEMU 建 arm64 runtime stage 失敗或過慢] → build stage 已用 `$BUILDPLATFORM`，QEMU 只跑 `apk add jq` 與複製檔案；若仍不行，改用原生 arm runner（需使用者重新決定）。
- [`main` 在第 5 階段前不會 push，CI 上的 arm64 建置要等第一次發版才真正執行] → 使用者不安裝 Docker，第 1 階段只以 actionlint 確認設定；第 5 階段檢查 Actions run 與 GHCR 上兩個平台，並列入 4.1 任務回報。若 arm64 建置失敗，只會讓該次發佈失敗，不影響已在跑的容器。
- [合併時 #11 的檔案被自動保留] → 第 2 階段 task 明確列出要 `git rm` 的檔案，合併後再跑第 1 階段的 grep 檢查。
- [`develop` 的功能檔可能漏掉 `beta` 才有的修正] → 每個功能衝突檔先 `git diff develop beta -- <file>` 再決定。
- [上游同步改動 fork 功能依賴的 API] → 以完整 `pnpm test` 為準，fork 功能的測試（`type-chart-panel.test.ts`、`inputs.test.ts`、`egg-gacha.test.ts`、`game-data.test.ts`）必須通過。
- [上游落後數量會變] → 37 是 roadmap 在 2026-11-01 的調查值（未重新量測），實作時以 `git log --oneline origin/beta..upstream/beta | wc -l` 重量；數字不影響做法。

## Migration Plan

1. 從 `develop` 開 `github/branch-migration` branch 完成第 1 階段，PR 合回 `develop`。
2. 本機從 `develop` 開 `merge/develop-into-beta`，merge `origin/beta` 並解衝突，推上去開 PR 到 `beta`；CI 通過後用 merge commit 合併（PR 以 merge commit 合併時，`develop` 的所有 commit 都會進入 `beta`）。
3. 從 `beta` 開 `sync/upstream-beta`，merge `upstream/beta`，PR 合回 `beta`。

Rollback：第 1 階段可 revert PR；第 2、3 階段都是 merge commit，可用 `git revert -m 1 <merge>` 回退，不改寫 `beta` 歷史。

## Open Questions

- 無。三個待決定事項已由使用者決定（不建 beta image、dispatch 限 main、QEMU）。Discord／Google OAuth client ID 屬於第 4 階段以後。
