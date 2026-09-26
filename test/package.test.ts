/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import pkg from "../package.json";
import { bundle } from "../scripts/build";

let outdir: string;
beforeAll(async () => {
  outdir = await mkdtemp(join(tmpdir(), "oauth-callback-build-"));
  await bundle(outdir);
});
afterAll(() => rm(outdir, { recursive: true, force: true }));

/** Files an entry loads eagerly (static imports), excluding lazily imported chunks. */
async function staticClosure(entry: string, seen = new Map<string, string>()) {
  if (seen.has(entry)) return seen;
  const code = await readFile(entry, "utf8");
  seen.set(entry, code);
  for (const [, spec] of code.matchAll(
    /(?:^|[;\n])\s*(?:import|export)\b[^;("']*?(?:from\s*)?["'](\.[^"']+)["']/g,
  ))
    await staticClosure(resolve(dirname(entry), spec!), seen);
  return seen;
}

test("root entry stays small and never loads MCP code or `open` eagerly", async () => {
  const files = await staticClosure(join(outdir, "index.js"));
  const code = [...files.values()].join("\n");
  const size = [...files.values()].reduce(
    (sum, c) => sum + Buffer.byteLength(c),
    0,
  );
  expect(size).toBeLessThan(15_000);
  expect(code).not.toContain("@modelcontextprotocol");
  expect(code).not.toContain("xdg-open"); // `open` internals
  expect(code).toMatch(/import\(["']\.\/[^"']+\.js["']\)/); // default launcher: lazy chunk
});

test("MCP entry keeps the SDK external", async () => {
  const code = await readFile(join(outdir, "mcp/index.js"), "utf8");
  expect(code).toContain('from "@modelcontextprotocol/client"');
});

test("zero runtime dependencies", () => {
  expect("dependencies" in pkg).toBe(false);
  expect(Object.keys(pkg.exports)).toEqual([".", "./mcp", "./package.json"]);
});
