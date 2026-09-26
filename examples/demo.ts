#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Self-contained demo: a mock authorization server with PKCE, no credentials needed.
 *
 *   bun run example:demo                # approve or deny in your browser
 *   bun run example:demo --no-browser   # auto-approve (CI)
 */

import { createHash, randomBytes } from "node:crypto";
import { getAuthCode, OAuthCallbackError } from "../src/index";

const codes = new Map<string, { challenge: string; redirectUri: string }>();

// Mock authorization server: /authorize shows a consent page, /token redeems codes.
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const params = url.searchParams;
    if (url.pathname === "/authorize") {
      const back = new URL(params.get("redirect_uri")!);
      back.searchParams.set("state", params.get("state")!);
      if (params.get("decision") === "deny") {
        back.searchParams.set("error", "access_denied");
        return Response.redirect(back.href);
      }
      if (params.get("decision") === "approve") {
        const code = randomBytes(16).toString("hex");
        codes.set(code, {
          challenge: params.get("code_challenge")!,
          redirectUri: back.href.split("?")[0]!,
        });
        back.searchParams.set("code", code);
        return Response.redirect(back.href);
      }
      const link = (decision: string) =>
        `${url.pathname}${url.search}&decision=${decision}`;
      return new Response(
        `<h1>Demo app wants access</h1><a href="${link("approve")}">Approve</a> · <a href="${link("deny")}">Deny</a>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const body = new URLSearchParams(await req.text());
      const entry = codes.get(body.get("code")!);
      const challenge = createHash("sha256")
        .update(body.get("code_verifier")!)
        .digest("base64url");
      if (
        !entry ||
        entry.challenge !== challenge ||
        entry.redirectUri !== body.get("redirect_uri")
      )
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: "demo-token",
        token_type: "Bearer",
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});

const verifier = randomBytes(32).toString("base64url");
const noBrowser = process.argv.includes("--no-browser");

try {
  const { code, redirectUri } = await getAuthCode(
    () => {
      const url = new URL("/authorize", server.url);
      url.searchParams.set("client_id", "demo");
      url.searchParams.set("response_type", "code");
      url.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      url.searchParams.set("code_challenge_method", "S256");
      return url;
    },
    // Default launcher: the system browser. CI plays the user with a request instead.
    noBrowser
      ? { launch: (url) => fetch(`${url}&decision=approve`), timeout: 10_000 }
      : {},
  );

  const response = await fetch(new URL("/token", server.url), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  console.log("Token response:", await response.json());
} catch (error) {
  if (error instanceof OAuthCallbackError)
    console.log(`Authorization denied: ${error.error}`);
  else throw error;
} finally {
  server.stop();
}
