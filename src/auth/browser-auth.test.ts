/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { test, expect, describe } from "bun:test";
import { browserAuth } from "./browser-auth";
import { inMemoryStore } from "../storage/memory";

describe("browserAuth", () => {
  test("creates an OAuthClientProvider with default options", () => {
    const provider = browserAuth();

    /** Verify MCP SDK OAuthClientProvider interface compliance. */
    expect(provider.clientMetadata).toBeDefined();
    expect(provider.state).toBeDefined();
    expect(provider.clientInformation).toBeDefined();
    expect(provider.saveClientInformation).toBeDefined();
    expect(provider.tokens).toBeDefined();
    expect(provider.saveTokens).toBeDefined();
    expect(provider.redirectToAuthorization).toBeDefined();
    expect(provider.saveCodeVerifier).toBeDefined();
    expect(provider.codeVerifier).toBeDefined();
    expect(provider.invalidateCredentials).toBeDefined();
    expect(provider.validateResourceURL).toBeDefined();

    /** SDK constraint: addClientAuthentication must not exist. */
    expect((provider as any).addClientAuthentication).toBeUndefined();
  });

  test("configures client metadata correctly", () => {
    const provider = browserAuth({
      port: 8080,
      hostname: "127.0.0.1",
      callbackPath: "/oauth/callback",
      scope: "read write",
      clientSecret: "secret123",
    });

    const metadata = provider.clientMetadata;
    expect(metadata.client_name).toBe("OAuth Callback Handler");
    expect(metadata.redirect_uris).toEqual([
      "http://127.0.0.1:8080/oauth/callback",
    ]);
    expect(metadata.grant_types).toEqual(["authorization_code"]);
    expect(metadata.response_types).toEqual(["code"]);
    expect(metadata.scope).toBe("read write");
    expect(metadata.token_endpoint_auth_method).toBe("client_secret_post");
  });

  test("generates unique state tokens", async () => {
    const provider = browserAuth();

    const state1 = await provider.state!();
    const state2 = await provider.state!();

    expect(state1).toBeDefined();
    expect(state2).toBeDefined();
    expect(state1).not.toBe(state2);
    expect(state1.length).toBeGreaterThan(20);
  });

  test("returns static client information when provided", async () => {
    const provider = browserAuth({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    });

    const clientInfo = await provider.clientInformation();
    expect(clientInfo).toEqual({
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    });
  });

  test("saves and retrieves client information", async () => {
    const provider = browserAuth();

    // Initially undefined
    let clientInfo = await provider.clientInformation();
    expect(clientInfo).toBeUndefined();

    // Save client information (simulates DCR response)
    await provider.saveClientInformation!({
      redirect_uris: ["http://localhost:9999/callback"],
      client_id: "dynamic-client-id",
      client_secret: "dynamic-client-secret",
      client_id_issued_at: Date.now(),
    });

    // Should return saved information
    clientInfo = await provider.clientInformation();
    expect(clientInfo).toEqual({
      client_id: "dynamic-client-id",
      client_secret: "dynamic-client-secret",
    });

    // clientMetadata must remain stable after DCR - auth method stays "none"
    // because no clientSecret was provided at construction time
    expect(provider.clientMetadata.token_endpoint_auth_method).toBe("none");
  });

  test("saves and retrieves tokens", async () => {
    const store = inMemoryStore();
    const provider = browserAuth({ store, storeKey: "test-tokens" });

    // Initially no tokens
    let tokens = await provider.tokens();
    expect(tokens).toBeUndefined();

    // Save tokens
    await provider.saveTokens({
      access_token: "test-access-token",
      token_type: "Bearer",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      scope: "read",
    });

    // Should retrieve saved tokens
    tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("test-access-token");
    expect(tokens?.refresh_token).toBe("test-refresh-token");
    expect(tokens?.scope).toBe("read");

    /** Verify internal storage format for cross-runtime compatibility. */
    const stored = await store.get("test-tokens");
    expect(stored?.accessToken).toBe("test-access-token");
    expect(stored?.refreshToken).toBe("test-refresh-token");
  });

  test("returns undefined for expired tokens (triggers SDK re-auth)", async () => {
    const store = inMemoryStore();
    const provider = browserAuth({ store, storeKey: "test-tokens" });

    // Inject expired token directly into store (expiresAt in the past)
    await store.set("test-tokens", {
      accessToken: "expired-token",
      expiresAt: Date.now() - 1000, // 1 second ago
    });

    // Provider should return undefined, signaling SDK to re-authenticate
    const tokens = await provider.tokens();
    expect(tokens).toBeUndefined();
  });

  test("saves and retrieves code verifier", async () => {
    const provider = browserAuth();

    // Save verifier
    await provider.saveCodeVerifier("test-verifier-123");

    // Retrieve verifier
    const verifier = await provider.codeVerifier();
    expect(verifier).toBe("test-verifier-123");
  });

  test("throws error when code verifier not found", async () => {
    const provider = browserAuth();

    await expect(provider.codeVerifier()).rejects.toThrow(
      "Code verifier not found",
    );
  });

  test("invalidates credentials by scope", async () => {
    const provider = browserAuth();

    // Set up initial state
    await provider.saveClientInformation!({
      redirect_uris: ["http://localhost:9999/callback"],
      client_id: "test-client",
      client_secret: "test-secret",
      client_id_issued_at: Date.now(),
    });
    await provider.saveTokens({
      access_token: "test-token",
      token_type: "Bearer",
    });
    await provider.saveCodeVerifier("test-verifier");

    // Invalidate only tokens
    await provider.invalidateCredentials!("tokens");
    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.clientInformation()).toBeDefined();
    expect(await provider.codeVerifier()).toBe("test-verifier");

    // Invalidate all
    await provider.invalidateCredentials!("all");
    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.clientInformation()).toBeUndefined();
    await expect(provider.codeVerifier()).rejects.toThrow();
  });

  test("invalidateCredentials('all') only clears own storeKey, not other keys", async () => {
    const store = inMemoryStore();

    // Store data under a different key (simulating another provider instance)
    await store.set("other-provider-tokens", {
      accessToken: "other-access-token",
      refreshToken: "other-refresh-token",
    });

    const provider = browserAuth({ store, storeKey: "my-tokens" });
    await provider.saveTokens({
      access_token: "my-access-token",
      token_type: "Bearer",
    });

    // Invalidate all credentials for this provider
    await provider.invalidateCredentials!("all");

    // Own tokens cleared
    expect(await store.get("my-tokens")).toBeNull();

    // Other provider's data untouched
    const otherTokens = await store.get("other-provider-tokens");
    expect(otherTokens?.accessToken).toBe("other-access-token");
  });
});

describe("browserAuth concurrency", () => {
  test("serializes concurrent auth attempts - exchanges code once", async () => {
    let exchangeCallCount = 0;
    let resolveAuth: (v?: unknown) => void;
    const authBlocked = new Promise((r) => (resolveAuth = r));

    const { mock } = await import("bun:test");
    mock.module("../index", () => ({
      getAuthCode: async () => {
        await authBlocked;
        return { code: "test-code" };
      },
    }));

    mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
      exchangeAuthorization: async () => {
        exchangeCallCount++;
        return { access_token: "test-token", token_type: "Bearer" };
      },
      discoverAuthorizationServerMetadata: async () => undefined,
    }));

    const { browserAuth: mockedBrowserAuth } = await import("./browser-auth");
    const provider = mockedBrowserAuth({ clientId: "test-client" });
    await provider.saveCodeVerifier("test-verifier");

    const authUrl = new URL("https://example.com/auth");

    // Start concurrent auth attempts
    const first = provider.redirectToAuthorization(authUrl);
    const second = provider.redirectToAuthorization(authUrl);

    // Unblock auth flow
    resolveAuth!();

    // Both should resolve without error
    await Promise.all([first, second]);

    // Contract: token exchange happens exactly once (second call reuses first result)
    expect(exchangeCallCount).toBe(1);

    // Tokens are saved
    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("test-token");
  });
});

describe("browserAuth state validation", () => {
  test("rejects callback with mismatched state", async () => {
    const { mock } = await import("bun:test");
    mock.module("../index", () => ({
      getAuthCode: async () => ({
        code: "test-code",
        state: "wrong-state",
      }),
    }));

    const { browserAuth: mockedBrowserAuth } = await import("./browser-auth");
    const provider = mockedBrowserAuth({ clientId: "test-client" });

    const authUrl = new URL("https://example.com/auth?state=expected-state");

    await expect(provider.redirectToAuthorization(authUrl)).rejects.toThrow(
      "OAuth state mismatch",
    );
  });

  test("accepts callback with matching state", async () => {
    const { mock } = await import("bun:test");
    mock.module("../index", () => ({
      getAuthCode: async () => ({
        code: "test-code",
        state: "correct-state",
      }),
    }));
    mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
      exchangeAuthorization: async () => ({
        access_token: "test-token",
        token_type: "Bearer",
      }),
      discoverAuthorizationServerMetadata: async () => undefined,
    }));

    const { browserAuth: mockedBrowserAuth } = await import("./browser-auth");
    const provider = mockedBrowserAuth({ clientId: "test-client" });
    await provider.saveCodeVerifier("test-verifier");

    const authUrl = new URL("https://example.com/auth?state=correct-state");

    // Should not throw
    await provider.redirectToAuthorization(authUrl);
    expect(await provider.tokens()).toBeDefined();
  });

  test("skips state validation when no state in authorization URL", async () => {
    const { mock } = await import("bun:test");
    mock.module("../index", () => ({
      getAuthCode: async () => ({
        code: "test-code",
        // No state in callback (legacy flow)
      }),
    }));
    mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
      exchangeAuthorization: async () => ({
        access_token: "test-token",
        token_type: "Bearer",
      }),
      discoverAuthorizationServerMetadata: async () => undefined,
    }));

    const { browserAuth: mockedBrowserAuth } = await import("./browser-auth");
    const provider = mockedBrowserAuth({ clientId: "test-client" });
    await provider.saveCodeVerifier("test-verifier");

    // No state in auth URL
    const authUrl = new URL("https://example.com/auth");

    // Should not throw
    await provider.redirectToAuthorization(authUrl);
    expect(await provider.tokens()).toBeDefined();
  });

  test("uses authServerUrl when token endpoint differs from authorization origin", async () => {
    let capturedAuthServerUrl: URL | undefined;

    const { mock } = await import("bun:test");
    mock.module("../index", () => ({
      getAuthCode: async () => ({ code: "test-code" }),
    }));
    mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
      exchangeAuthorization: async (serverUrl: URL) => {
        capturedAuthServerUrl = serverUrl;
        return { access_token: "test-token", token_type: "Bearer" };
      },
      discoverAuthorizationServerMetadata: async () => undefined,
    }));

    const { browserAuth: mockedBrowserAuth } = await import("./browser-auth");
    const provider = mockedBrowserAuth({
      clientId: "test-client",
      // Authorization on accounts.example.com, token endpoint on auth.example.com
      authServerUrl: "https://auth.example.com",
    });
    await provider.saveCodeVerifier("test-verifier");

    await provider.redirectToAuthorization(
      new URL("https://accounts.example.com/authorize"),
    );

    expect(capturedAuthServerUrl?.origin).toBe("https://auth.example.com");
  });
});
