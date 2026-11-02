<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Container images

GitHub Actions publishes `Dockerfile.static` to `ghcr.io/garrison-code/pokerogue`
only from `main`. A manual `workflow_dispatch` publishes only when it runs on
`main`; the same workflow on any other branch is skipped and does not publish.

| Source branch | Moving tag | Immutable tag | Platforms | Browser tab title |
| --- | --- | --- | --- | --- |
| `main` | `latest` | `sha-<full commit SHA>` | `linux/amd64`, `linux/arm64` | `PokéRogue (Garrix)` |

`beta` does not publish an image, and there is no branch-named tag. Use
`sha-<full commit SHA>` or the image digest in the Actions run summary to pin a
deployment or roll back. Pushes to other branches and tags do not publish images.
`main` uses build mode `development` and the browser title above. The workflow
validates the image over HTTP before publishing.

## First run and access

The workflow uses the built-in `GITHUB_TOKEN` with `packages: write`;
no personal access token or new repository secret is required for publishing.
If Actions is disabled for this fork, enable it in the repository's Actions tab.
Repository or organization policy must allow the referenced actions and package
publishing.

New GHCR packages default to private, independently of repository visibility.
After the first successful push, choose the package's visibility in its settings.
For anonymous pulls, set it to public. To keep it private, give the runtime a
registry credential that can read this package.

Standard GitHub-hosted runners are free for public repositories, and GHCR
container image storage and bandwidth are currently free. This workflow disables
build-record artifact uploads and uses the standard Actions build cache.
See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages).

## Production handoff

- Image: `ghcr.io/garrison-code/pokerogue`
- Tag: `latest`, or `sha-<full commit SHA>` when pinning a deploy
- Platforms: `linux/amd64` and `linux/arm64`
- Container port: `8000`

The image builds the frontend once in GitHub Actions and serves only the
resulting static files using Nginx on port 8000. No Vite development server or
Node.js process runs in the deployed frontend. The pinned `assets` and `locales`
submodules are included in the build. The original `Dockerfile` is retained for
local development. See [static container settings and caching](../container/README.md).

Production is a VM stack reached through Cloudflare Tunnel. `game.<domain>` is this
frontend and `api.<domain>` is rogueserver. Set the frontend container's
`VITE_SERVER_URL` to `https://api.<domain>` (https, no trailing `/`). The image
default `/api` is only for CI `container/check_static.py`: frontend Nginx returns
404 for `/api` and `/api/`, and the Tunnel cannot rewrite that path onto the
`api.<domain>` origin.

Also set the other runtime `VITE_*` variables on the container, especially
`VITE_BYPASS_LOGIN`. The static image defaults to `VITE_BYPASS_LOGIN=0`, so
authentication stays on. Set OAuth client IDs for your own application when
using OAuth. Keep the frontend and backend environments paired.

`VITE_APP_TITLE` can override the image's browser tab title at container startup.
Only the settings listed in the static container documentation can be changed
at runtime. Other `VITE_*` settings are fixed during the build.

Pushing an image does not update a running container. Pull the new image and
recreate the container; a restart alone does not switch images.
