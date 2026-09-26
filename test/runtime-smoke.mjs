/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Runtime smoke test against the built package: `node|deno|bun test/runtime-smoke.mjs`.
 * The full suite runs on Bun; this proves the single node:http listener, IPv6 loopback,
 * keep-alive shutdown, abort and fileStore work on Node and Deno too.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAuthCode, OAuthCallbackError } from "../dist/index.js";
import { fileStore } from "../dist/mcp/index.js";

const build = () => "https://auth.example.com/authorize?client_id=app";
const approve = (query) => (url) => {
  const target = new URL(url.searchParams.get("redirect_uri"));
  target.search += `${target.search ? "&" : ""}${query}&state=${url.searchParams.get("state")}`;
  // keep-alive connection: shutdown must not hang on it
  void fetch(target, { headers: { connection: "keep-alive" } }).then((r) =>
    r.text(),
  );
};

for (const redirectUri of [
  "http://127.0.0.1:0/callback",
  "http://[::1]:0/callback",
]) {
  const result = await getAuthCode(build, {
    redirectUri,
    launch: approve("code=abc"),
  });
  assert.equal(result.code, "abc");
}

await assert.rejects(
  getAuthCode(build, { launch: approve("error=access_denied") }),
  OAuthCallbackError,
);

const timeout = await getAuthCode(build, {
  timeout: 50,
  launch: () => {},
}).catch((e) => e);
assert.equal(timeout.name, "TimeoutError");

const reason = new Error("cancelled");
const controller = new AbortController();
await assert.rejects(
  getAuthCode(build, {
    signal: controller.signal,
    launch: () => controller.abort(reason),
  }),
  (e) => e === reason,
);

const dir = await mkdtemp(join(tmpdir(), "oauth-callback-smoke-"));
try {
  const store = fileStore(join(dir, "a/b.json"));
  await store.save("✓ text");
  assert.equal(await store.load(), "✓ text");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  `runtime smoke ok (${globalThis.Deno ? "deno" : globalThis.Bun ? "bun" : "node"})`,
);
