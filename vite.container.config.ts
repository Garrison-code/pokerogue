// SPDX-FileCopyrightText: 2026 Garrison-code
// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

// Only these public settings are supplied by the container at startup.
const runtimeKeys = [
  "VITE_SERVER_URL",
  "VITE_BYPASS_LOGIN",
  "VITE_BYPASS_TUTORIAL",
  "VITE_DISCORD_CLIENT_ID",
  "VITE_GOOGLE_CLIENT_ID",
];

// biome-ignore lint/style/noDefaultExport: required for Vite
export default defineConfig(async env =>
  mergeConfig(await baseConfig(env), {
    define: Object.fromEntries(
      runtimeKeys.map(key => [`import.meta.env.${key}`, `globalThis.__POKEROGUE_CONFIG__.${key}`]),
    ),
    build: { sourcemap: false },
    plugins: [
      {
        name: "container-runtime-config",
        transformIndexHtml: {
          order: "post",
          handler: () => [{ tag: "script", attrs: { src: "./runtime-config.js" }, injectTo: "head-prepend" }],
        },
      },
    ],
  }),
);
