<!-- SPDX-FileCopyrightText: 2026 Garrison-code -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Static frontend container

`Dockerfile.static` builds the pinned assets/locales and Vite bundle, then serves
only `dist/` using unprivileged Nginx on port 8000. GitHub Actions publishes this
image only from `main`, as the moving tag `latest` and the immutable tag
`sha-<full commit SHA>`, for `linux/amd64` and `linux/arm64`. The workflow
validates the image before publishing. `beta` and every other branch do not
publish an image. The original Dockerfile remains available for local development only.

A direct `docker build -f Dockerfile.static .` defaults to build mode `development`,
retaining the project's development flags; this still uses `vite build` rather than
the Vite development server. The publish workflow passes `BUILD_MODE=production`, so
published images have no beta labels, developer keys or request logging.

Container runtime settings are supported through an explicit public
allowlist: `VITE_APP_TITLE` (image default `PokéRogue (Garrix)`), `VITE_SERVER_URL`
(image default `/api`), `VITE_BYPASS_LOGIN` (default `0`),
`VITE_BYPASS_TUTORIAL` (default `0`), `VITE_DISCORD_CLIENT_ID` and
`VITE_GOOGLE_CLIENT_ID` (both empty). These are browser-visible settings, never
secrets. Restart or recreate the frontend after changing them. Other Vite settings
remain build-time settings. The native local Vite workflow is unchanged.

The publish workflow passes `VITE_APP_TITLE=PokéRogue (Garrix)` as a build argument
so the published image uses that runtime default. A direct
`docker build -f Dockerfile.static .` uses the same default.

The image default `VITE_SERVER_URL=/api` exists so CI can run
`python3 container/check_static.py`. Frontend Nginx returns 404 for `/api` and
`/api/`, so that default is not a usable API address. For the production
deployment (Cloudflare Tunnel, `game.<domain>` for this frontend and `api.<domain>`
for rogueserver), set `VITE_SERVER_URL` to `https://api.<domain>`: https, with no
trailing `/`. The Tunnel does not rewrite paths, so one origin plus `/api` does
not reach rogueserver.

- HTML, both manifests, service worker and runtime configuration: no-store.
- Hashed JS/CSS and game resources with manifest content hashes: one year,
  immutable. Unversioned resources revalidate using ETags.
- Existing game-loader `?t=` handling reads the generated SHA-256 manifest.
- Text resources use gzip; missing resources return 404, never HTML fallback.
- Health endpoint: `/healthz`.

Run `python3 container/check_static.py http://localhost:8000` against the image,
or pass the deployed HTTPS origin. This checks HTTP serving, runtime settings,
resource manifests, cache headers, conditional requests and missing resources;
it does not operate a browser or validate gameplay.
