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
    expect(metadata.grant_types).toContain("authorization_code");
    expect(metadata.grant_types).toContain("refresh_token");
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

    // Save client information
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

  test("getPendingAuthCode is single-use", () => {
    const provider = browserAuth() as any;

    // Initially undefined
    expect(provider.getPendingAuthCode()).toBeUndefined();

    // Set pending auth code
    provider._pendingAuthCode = "test-code";
    provider._pendingAuthState = "test-state";

    // First call returns the code
    const result = provider.getPendingAuthCode();
    expect(result).toEqual({
      code: "test-code",
      state: "test-state",
    });
    expect(provider._isExchangingCode).toBe(true);

    /** Verify single-use security constraint. */
    expect(provider.getPendingAuthCode()).toBeUndefined();
  });

  test("preserves client info during token exchange", async () => {
    const provider = browserAuth() as any;

    // Set up initial state
    await provider.saveClientInformation({
      redirect_uris: ["http://localhost:9999/callback"],
      client_id: "test-client",
      client_secret: "test-secret",
      client_id_issued_at: Date.now(),
    });
    await provider.saveCodeVerifier("test-verifier");

    // Simulate token exchange
    provider._isExchangingCode = true;

    /** Test SDK workaround: invalidate("all") during exchange preserves state. */
    await provider.invalidateCredentials("all");

    // Client info and verifier should be preserved
    expect(await provider.clientInformation()).toBeDefined();
    expect(await provider.codeVerifier()).toBe("test-verifier");
  });
});

describe("browserAuth with retries", () => {
  test("handles cleanup of pending auth state on timeout", () => {
    const provider = browserAuth() as any;

    // Simulate setting pending auth code
    provider._pendingAuthCode = "test-code";
    provider._pendingAuthState = "test-state";

    // Get the code (marks as exchanging)
    const result = provider.getPendingAuthCode();
    expect(result).toEqual({
      code: "test-code",
      state: "test-state",
    });

    /** Verify cleanup for security. */
    expect(provider._pendingAuthCode).toBeUndefined();
    expect(provider._pendingAuthState).toBeUndefined();
  });

  test("ensures only one auth flow at a time", async () => {
    const provider = browserAuth() as any;

    // Mock auth in progress
    let resolveAuth: () => void;
    provider._authInProgress = new Promise<void>((resolve) => {
      resolveAuth = () => resolve();
    });

    /** Second attempt should queue behind first. */
    const secondAttempt = provider.redirectToAuthorization(
      new URL("https://example.com/auth"),
    );

    // Resolve first auth
    resolveAuth!();

    // Second attempt should complete without error
    await expect(secondAttempt).resolves.toBeUndefined();
  });
});
