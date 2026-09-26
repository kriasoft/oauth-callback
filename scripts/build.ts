#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Bundles both entry points with code splitting: shared code lands in a common chunk, and
 * `open` (a devDependency) in a chunk only the default launcher loads. The package keeps
 * zero runtime dependencies; the MCP SDK stays external (optional peer).
 */

import { $ } from "bun";
import { readFile, rm, writeFile } from "node:fs/promises";

export async function bundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ["src/index.ts", "src/mcp/index.ts"],
    root: "src",
    outdir,
    target: "node",
    splitting: true,
    external: ["@modelcontextprotocol/client"],
    naming: { chunk: "chunks/[name]-[hash].[ext]" },
  });
  if (!result.success) throw new AggregateError(result.logs, "Build failed");
  return result.outputs;
}

/**
 * License texts of the packages bundled into `outputs` (MIT requires shipping the notice).
 * Bun marks each inlined module with a `// node_modules/<package>/...` comment.
 */
export async function thirdPartyNotices(outputs: { path: string }[]) {
  const names = new Set<string>();
  for (const { path } of outputs)
    for (const [, name] of (await readFile(path, "utf8")).matchAll(
      /^\/\/ node_modules\/((?:@[^/]+\/)?[^/]+)\//gm,
    ))
      names.add(name!);
  const notices = await Promise.all(
    [...names].sort().map(async (name) => {
      const license = await readFile(`node_modules/${name}/license`, "utf8");
      return `## ${name}\n\n${license.trim()}\n`;
    }),
  );
  return `# Third-party licenses\n\nBundled into the default browser launcher chunk.\n\n${notices.join("\n")}`;
}

if (import.meta.main) {
  await rm("dist", { recursive: true, force: true });
  const outputs = await bundle("dist");
  await writeFile(
    "dist/THIRD_PARTY_LICENSES.md",
    await thirdPartyNotices(outputs),
  );
  await $`tsc -p tsconfig.build.json`;
}
