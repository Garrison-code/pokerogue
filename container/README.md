<!-- SPDX-FileCopyrightText: 2026 Garrison-code -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Static frontend container

`Dockerfile.static` builds the pinned assets/locales and Vite bundle, then serves
only `dist/` using unprivileged Nginx on port 8000. The develop GHCR workflow
validates the image before publishing it. The original Dockerfile remains
available for local development and the existing beta image workflow.

The default build mode is `development`, retaining the project's develop flags;
this still uses `vite build` rather than the Vite development server. Change
`BUILD_MODE` only when intentionally building another environment.

Coolify/container runtime settings are supported through an explicit public
allowlist: `VITE_SERVER_URL` (default `/api`), `VITE_BYPASS_LOGIN` (default `0`),
`VITE_BYPASS_TUTORIAL` (default `0`), `VITE_DISCORD_CLIENT_ID` and
`VITE_GOOGLE_CLIENT_ID` (both empty). These are browser-visible settings, never
secrets. Restart/recreate the frontend after changing them. Other Vite settings
remain build-time settings. The native local Vite workflow is unchanged.

- HTML, both manifests, service worker and runtime configuration: no-store.
- Hashed JS/CSS and game resources with manifest content hashes: one year,
  immutable. Unversioned resources revalidate using ETags.
- Existing game-loader `?t=` handling reads the generated SHA-256 manifest.
- Text resources use gzip; missing resources return 404, never HTML fallback.
- Health endpoint: `/healthz`; API routing remains managed by Coolify.

Run `python3 container/check_static.py http://localhost:8000` against the image,
or pass the deployed HTTPS origin. This checks HTTP serving, runtime settings,
resource manifests, cache headers, conditional requests and missing resources;
it does not operate a browser or validate gameplay.
