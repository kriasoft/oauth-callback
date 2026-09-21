/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

// Under Bun, createCallbackServer() picks the Bun server, so these tests
// bundle the library and run it in a real Node process.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const node = Bun.which("node");
let tempDir: string;

// Opens a browser-style preconnect socket that never sends a request (#35),
// then either completes the callback or lets it time out.
const runner = `
import net from "node:net";
import { getAuthCode } from "./index.js";

const [scenario, port] = [process.argv[2], Number(process.argv[3])];
const auth = getAuthCode({
  authorizationUrl: "http://localhost/authorize",
  port,
  openBrowser: false,
  timeout: scenario === "timeout" ? 300 : 5000,
});
// Retry until the server listens, so the idle socket is really open.
async function preconnect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const socket = net.connect(port, "localhost");
    const connected = await new Promise((resolve) =>
      socket.once("connect", () => resolve(true)).once("error", () => resolve(false)),
    );
    if (connected) return socket;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Server did not start listening");
}
const idle = await preconnect();

let html = "";
if (scenario === "callback") {
  html = await (await fetch(\`http://localhost:\${port}/callback?code=abc\`)).text();
}
const result = await auth.then((r) => r.code, (e) => e.name);
idle.destroy();
console.log(JSON.stringify({ result, html }));
`;

async function run(scenario: string, port: number) {
  const proc = Bun.spawn(
    [node!, join(tempDir, "runner.mjs"), scenario, `${port}`],
    {
      stdout: "pipe",
    },
  );
  // Before #35, stop() hung here until Node's 60s headersTimeout.
  const timer = setTimeout(() => proc.kill(), 3000);
  const [output, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  expect(exitCode).toBe(0);
  return JSON.parse(output) as { result: string; html: string };
}

describe.skipIf(!node)("NodeCallbackServer", () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-callback-node-"));
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, "../src/index.ts")],
      outdir: tempDir,
      target: "node",
    });
    expect(build.success).toBe(true);
    // Older Node releases treat .js as CommonJS without this.
    await writeFile(join(tempDir, "package.json"), '{"type":"module"}');
    await writeFile(join(tempDir, "runner.mjs"), runner);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("delivers the full page and stops despite an idle preconnect", async () => {
    const { result, html } = await run("callback", 43_901);

    expect(result).toBe("abc");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  test("stops on timeout despite an idle preconnect", async () => {
    const { result } = await run("timeout", 43_902);

    expect(result).toBe("TimeoutError");
  });
});
