#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Bundles both entry points with code splitting: shared code lands in a common chunk, and
 * `open` (a devDependency) in a chunk only the default launcher loads. The package keeps
 * zero runtime dependencies; the MCP SDK stays external (optional peer).
 */

import { $ } from "bun";
import { rm } from "node:fs/promises";

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

if (import.meta.main) {
  await rm("dist", { recursive: true, force: true });
  await bundle("dist");
  await $`tsc -p tsconfig.build.json`;
}
