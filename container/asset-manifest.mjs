// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// The existing game loader appends ?t=<version> using this manifest.
// Content hashes keep unchanged resources cached across image rebuilds.
const root = path.resolve("dist");
const manifest = {};
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(full);
    } else if (entry.isFile()) {
      const name = `/${path.relative(root, full).split(path.sep).join("/")}`;
      if (["/index.html", "/asset-manifest.json", "/manifest.json", "/service-worker.js", "/runtime-config.js"].includes(name)) continue;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(full)) hash.update(chunk);
      manifest[name] = hash.digest("hex");
    }
  }
}
await visit(root);
await writeFile(path.join(root, "manifest.json"), JSON.stringify({ manifest }));
console.log(`Versioned ${Object.keys(manifest).length} static resources.`);
