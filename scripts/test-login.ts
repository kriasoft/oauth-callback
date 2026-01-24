#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Manual test for OAuth login flow
 *
 * Verifies that the success page fully renders before server shutdown.
 * Run with: bun test:login
 */

import open from "open";
import { getAuthCode } from "../src/index";

const OAUTH_PORT = 8765;
const CALLBACK_PORT = 3000;

// Minimal mock OAuth server - redirects immediately on "approve"
const mockServer = Bun.serve({
  port: OAUTH_PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri")!;
      const state = url.searchParams.get("state");

      return new Response(
        `<!DOCTYPE html>
<html>
<head><title>Mock OAuth</title></head>
<body style="font-family: system-ui; max-width: 400px; margin: 50px auto; text-align: center;">
  <h2>Mock OAuth Server</h2>
  <p>Click to simulate successful login:</p>
  <a href="${redirectUri}?code=test_code_${Date.now()}&state=${state}"
     style="display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px;">
    Approve
  </a>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n🔐 Mock OAuth server: http://localhost:${OAUTH_PORT}`);
console.log(
  `📥 Callback server:   http://localhost:${CALLBACK_PORT}/callback\n`,
);
console.log("Opening browser... Click 'Approve' to test the flow.\n");

try {
  const authUrl =
    `http://localhost:${OAUTH_PORT}/authorize?` +
    new URLSearchParams({
      client_id: "test",
      redirect_uri: `http://localhost:${CALLBACK_PORT}/callback`,
      response_type: "code",
      state: crypto.randomUUID(),
    });

  const result = await getAuthCode({
    authorizationUrl: authUrl,
    port: CALLBACK_PORT,
    timeout: 60000,
    launch: open,
  });

  console.log("✅ Success!");
  console.log(`   Code: ${result.code}`);
  console.log(`   State: ${result.state}\n`);
  console.log("The success page should have fully rendered in the browser.");
  console.log(
    "If it showed a connection error or blank page, the fix didn't work.\n",
  );
} catch (error) {
  console.error("❌ Error:", error);
} finally {
  mockServer.stop(true);
}
