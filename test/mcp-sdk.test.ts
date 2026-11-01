/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * browserAuth() against the real MCP SDK on both sides. The resource server (metadata,
 * 401 challenge, MCP handler) is the SDK's own, so protocol drift between SDK client and
 * server can't hide behind test/mock-mcp-server.ts; only the authorization server is a fixture.
 * It lives on another origin, so the SDK's fallback of treating the MCP origin as the
 * authorization server finds nothing: only protected-resource discovery leads to it.
 */

import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import {
  buildOAuthProtectedResourceMetadata,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { browserAuth } from "../src/mcp/index";
import { freePort } from "./helpers";

let fixture: Awaited<ReturnType<typeof startFixture>>;
const clients: Client[] = [];

beforeEach(async () => {
  fixture = await startFixture();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
  await fixture.close();
});

const newClient = (options?: ConstructorParameters<typeof Client>[1]) => {
  const client = new Client({ name: "test", version: "1.0.0" }, options);
  clients.push(client);
  return client;
};

/** Provider whose "browser" follows the authorization redirect back to the loopback listener. */
const setup = async () =>
  browserAuth({
    serverUrl: fixture.mcpUrl,
    redirectUri: `http://127.0.0.1:${await freePort()}/callback`,
    clientName: "oauth-callback-test",
    // Fail fast on a refused authorization request instead of waiting out the flow timeout.
    launch: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      await response.body?.cancel();
    },
    timeout: 5000,
  });

/** The tool echoes the client the SDK's bearer check verified for the issued token. */
const expectAuthorized = async (client: Client) =>
  expect(await client.callTool({ name: "whoami" })).toMatchObject({
    content: [{ type: "text", text: "fixture-client" }],
  });

test("connect() authorizes on the 401 and reconnects in the modern era", async () => {
  const client = newClient({ versionNegotiation: { mode: "auto" } });
  await (await setup()).connect(client);
  expect(client.getProtocolEra()).toBe("modern");
  await expectAuthorized(client);
});

test("your own transport: complete the flow, then retry on a fresh transport (legacy era)", async () => {
  const auth = await setup();
  const newTransport = () =>
    new StreamableHTTPClientTransport(fixture.mcpUrl, { authProvider: auth });
  const client = newClient();
  const first = newTransport();
  await expect(client.connect(first)).rejects.toBeInstanceOf(UnauthorizedError);
  await auth.completeAuthorization(first);
  await first.close();
  await client.connect(newTransport());
  expect(client.getProtocolEra()).toBe("legacy");
  await expectAuthorized(client);
});

test.each(["tokens", "all"] as const)(
  'MCP requests through a same-origin redirect outlive invalidateCredentials("%s")',
  async (scope) => {
    // The SDK follows the redirect itself, calling the provider's fetch once per hop.
    fixture.redirectToSlash();
    const auth = await setup();
    const client = newClient();
    await auth.connect(client);
    const call = client.callTool({ name: "wait" });
    await fixture.waitStarted;
    await auth.invalidateCredentials(scope);
    fixture.releaseWait();
    expect(await call).toMatchObject({
      content: [{ type: "text", text: "done" }],
    });
  },
);

/**
 * SDK resource server + a minimal authorization server on its own origin. The AS enforces
 * what this flow depends on: a DCR'd loopback redirect URI, state, S256 PKCE, the RFC 8707
 * resource, and codes bound to client, redirect URI, challenge and resource; it returns
 * RFC 9207 `iss` on the callback.
 */
async function startFixture() {
  const waitStarted = Promise.withResolvers<void>();
  const waitReleased = Promise.withResolvers<void>();
  let redirect = false;
  const mcp = createMcpHandler(() => {
    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool("whoami", {}, async (ctx) => ({
      content: [{ type: "text", text: ctx.http?.authInfo?.clientId ?? "" }],
    }));
    server.registerTool("wait", {}, async () => {
      waitStarted.resolve();
      await waitReleased.promise;
      return { content: [{ type: "text", text: "done" }] };
    });
    return server;
  });

  const clientId = "fixture-client";
  let registeredRedirectUri: string | undefined;
  const codes = new Map<
    string,
    { challenge: string; redirectUri: string; resource: string }
  >();
  const tokens = new Map<string, string>(); // access token → client_id
  const bad = (reason: string) => new Response(reason, { status: 400 });
  /** A single-valued parameter: missing, empty or repeated reads as undefined. */
  const one = (params: URLSearchParams, name: string) => {
    const values = params.getAll(name);
    return values.length === 1 && values[0] ? values[0] : undefined;
  };
  const isLoopback = (uri: unknown) => {
    const url = typeof uri === "string" && URL.parse(uri);
    return (
      !!url &&
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      !!url.port &&
      !url.username &&
      !url.password
    );
  };

  const as = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        url.pathname === "/.well-known/oauth-authorization-server"
      )
        return Response.json(asMetadata);
      if (url.pathname === "/register" && request.method === "POST") {
        const body = (await request.json()) as { redirect_uris?: unknown };
        const uris = body.redirect_uris;
        if (!Array.isArray(uris) || uris.length !== 1 || !isLoopback(uris[0]))
          return bad("redirect_uris");
        registeredRedirectUri = uris[0];
        return Response.json({ ...body, client_id: clientId }, 201);
      }
      if (url.pathname === "/authorize") {
        // Plays the user approving: redirect back with a code bound to this request.
        const p = url.searchParams;
        const redirectUri = one(p, "redirect_uri");
        const state = one(p, "state");
        const challenge = one(p, "code_challenge");
        const resource = one(p, "resource");
        if (one(p, "response_type") !== "code") return bad("response_type");
        if (one(p, "client_id") !== clientId) return bad("client_id");
        if (!redirectUri || redirectUri !== registeredRedirectUri)
          return bad("redirect_uri");
        if (!state) return bad("state");
        if (!challenge || one(p, "code_challenge_method") !== "S256")
          return bad("code_challenge");
        if (resource !== mcpUrl.href) return bad("resource");
        const code = randomUUID();
        codes.set(code, { challenge, redirectUri, resource });
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", state);
        callback.searchParams.set("iss", asMetadata.issuer);
        return Response.redirect(callback.href, 302);
      }
      if (url.pathname === "/token" && request.method === "POST") {
        const form = new URLSearchParams(await request.text());
        const code = one(form, "code") ?? "";
        const grant = codes.get(code);
        codes.delete(code);
        const challenge = createHash("sha256")
          .update(one(form, "code_verifier") ?? "")
          .digest("base64url");
        if (
          !grant ||
          one(form, "grant_type") !== "authorization_code" ||
          one(form, "client_id") !== clientId ||
          one(form, "redirect_uri") !== grant.redirectUri ||
          one(form, "resource") !== grant.resource ||
          challenge !== grant.challenge
        )
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        const token = randomUUID();
        tokens.set(token, clientId);
        return Response.json({
          access_token: token,
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  const asMetadata = {
    issuer: as.url.origin,
    authorization_endpoint: `${as.url.origin}/authorize`,
    token_endpoint: `${as.url.origin}/token`,
    registration_endpoint: `${as.url.origin}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  };

  let requireAuth: ReturnType<typeof requireBearerAuth>;
  const rs = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "GET" && url.href === resourceMetadataUrl)
        return Response.json(
          buildOAuthProtectedResourceMetadata({
            resourceServerUrl: mcpUrl,
            oauthMetadata: asMetadata,
            dangerouslyAllowInsecureIssuerUrl: true,
          }),
        );
      // Trailing-slash canonicalization; the SDK follows it (same origin, 307 keeps the method).
      if (url.pathname === "/mcp" && redirect)
        return Response.redirect(new URL("/mcp/", url).href, 307);
      if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        return mcp.fetch(request, { authInfo: auth });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  const mcpUrl = new URL("/mcp", rs.url);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);
  requireAuth = requireBearerAuth({
    resourceMetadataUrl,
    verifier: {
      async verifyAccessToken(token) {
        const clientId = tokens.get(token);
        if (!clientId)
          throw new OAuthError(OAuthErrorCode.InvalidToken, "Unknown token");
        return {
          token,
          clientId,
          scopes: [],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        };
      },
    },
  });

  return {
    mcpUrl,
    /** Makes `mcpUrl` redirect to `/mcp/`. */
    redirectToSlash: () => (redirect = true),
    /** Settles once a `wait` tool call is running. */
    waitStarted: waitStarted.promise,
    releaseWait: () => waitReleased.resolve(),
    async close() {
      waitReleased.resolve(); // a failed test must not leave the tool call blocking shutdown
      await mcp.close().catch(() => {});
      await Promise.all([rs.stop(true), as.stop(true)]);
    },
  };
}
