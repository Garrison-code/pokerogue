<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Container images

GitHub Actions publishes `Dockerfile.static` to `ghcr.io/garrison-code/pokerogue`.
This workflow builds images only; it does not trigger Coolify deployments.

| Source branch | Moving tag | Browser tab title |
| --- | --- | --- |
| `beta` | `latest` | `PokéRogue (Garrix)` |
| `develop` | `develop` | `PokéRogue (Garrix-dev)` |

Every build also publishes `sha-<full commit SHA>`. Use that tag or the image
digest in the Actions run summary to pin a deployment or roll back. Pushes to
other branches and tags do not publish images. Manual runs are supported on
`beta` and `develop` only. Both branches use the same Dockerfile and
build mode (`development`); the workflow sets the browser title for each image.
Both tags use a prebuilt Vite bundle served by Nginx, with HTTP validation before
publishing. Promote this workflow and its container files to `beta` to apply
the same behavior to future `latest` builds; merging into `develop` alone only
updates the `develop` image.

## First run and access

The workflow uses the built-in `GITHUB_TOKEN` with `packages: write`;
no personal access token or new repository secret is required for publishing.
If Actions is disabled for this fork, enable it in the repository's Actions tab.
Repository or organization policy must allow the referenced actions and package
publishing.

New GHCR packages default to private, independently of repository visibility.
After the first successful push, choose the package's visibility in its settings.
For anonymous pulls, set it to public. To keep it private, configure Coolify with
a registry credential that can read this package.

Standard GitHub-hosted runners are free for public repositories, and GHCR
container image storage and bandwidth are currently free. This workflow disables
build-record artifact uploads and uses the standard Actions build cache.
See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages).

## Coolify handoff

- Image: `ghcr.io/garrison-code/pokerogue`
- Tag: `latest` for the main environment, `develop` for the development environment
- Platform: `linux/amd64` (change the workflow before using an ARM64 host)
- Container port: `8000`

Both images build the frontend once in GitHub Actions and serve only the
resulting static files using Nginx on port 8000. No Vite development server or
Node.js process runs in the deployed frontend. The pinned `assets` and `locales`
submodules are included in the build. The original `Dockerfile` is retained for
local development. See [static container settings and caching](../container/README.md).

Configure the frontend's runtime `VITE_*` environment variables in Coolify,
especially `VITE_SERVER_URL` and `VITE_BYPASS_LOGIN`. The static image defaults
to `VITE_BYPASS_LOGIN=0`, requiring authentication. Set `VITE_SERVER_URL`
(default `/api`) to the backend URL reachable from the user's
browser. Set OAuth client IDs for your own application when using OAuth.
Keep frontend and backend environments paired.

`VITE_APP_TITLE` can override the image's browser tab title at container startup.
Only the settings listed in the static container documentation can be changed
at runtime. Other `VITE_*` settings are fixed during the build.

Pushing an image does not update a running container. Coolify must pull the image
and recreate the container; a restart alone does not switch images. Automatic
deployment through the tailnet will be configured separately.
