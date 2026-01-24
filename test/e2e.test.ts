/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { getAuthCode, TimeoutError } from "../src/index";
import type { Server } from "bun";

let mockOAuthProvider: Server;

/**
 * Test launcher that simulates OAuth provider redirect.
 * Fetches the auth URL and follows the redirect to trigger the callback.
 */
async function simulateOAuthRedirect(url: string): Promise<void> {
  const response = await fetch(url);
  if (response.status === 302 || response.status === 301) {
    const location = response.headers.get("Location");
    if (location) {
      await fetch(location);
    }
  }
}

beforeAll(() => {
  // Setup mock OAuth provider server
  mockOAuthProvider = Bun.serve({
    port: 8080,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/oauth/authorize") {
        // Extract redirect_uri and state from query params
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        const responseType = url.searchParams.get("response_type");

        if (!redirectUri || responseType !== "code") {
          return new Response("Invalid request", { status: 400 });
        }

        // Simulate user authorization and redirect back with code
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("code", "test_auth_code_123");
        if (state) {
          callbackUrl.searchParams.set("state", state);
        }

        // Redirect to callback URL
        return new Response(null, {
          status: 302,
          headers: {
            Location: callbackUrl.toString(),
          },
        });
      }

      if (url.pathname === "/oauth/authorize/error") {
        // Simulate OAuth error (access_denied)
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");

        if (!redirectUri) {
          return new Response("Invalid request", { status: 400 });
        }

        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("error", "access_denied");
        callbackUrl.searchParams.set(
          "error_description",
          "The user denied access",
        );
        if (state) {
          callbackUrl.searchParams.set("state", state);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: callbackUrl.toString(),
          },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });
});

afterAll(() => {
  mockOAuthProvider?.stop();
});

test("complete OAuth authorization flow with mock provider", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize?" +
    new URLSearchParams({
      client_id: "test_client_123",
      redirect_uri: "http://localhost:3000/callback",
      response_type: "code",
      scope: "user:email",
      state: "random_state_123",
    });

  const result = await getAuthCode({
    authorizationUrl: authUrl,
    port: 3000,
    launch: simulateOAuthRedirect,
  });

  // Verify the authorization code was captured
  expect(result.code).toBe("test_auth_code_123");
  expect(result.state).toBe("random_state_123");
});

test("OAuth error handling - access denied", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize/error?" +
    new URLSearchParams({
      client_id: "test_client_123",
      redirect_uri: "http://localhost:3001/callback",
      response_type: "code",
      state: "state_456",
    });

  let errorThrown = false;
  try {
    await getAuthCode({
      authorizationUrl: authUrl,
      port: 3001,
      launch: simulateOAuthRedirect,
    });
  } catch (error: any) {
    errorThrown = true;
    expect(error.name).toBe("OAuthError");
    expect(error.error).toBe("access_denied");
    expect(error.error_description).toBe("The user denied access");
  }

  expect(errorThrown).toBe(true);
});

test("OAuth error always throws OAuthError", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize/error?" +
    new URLSearchParams({
      client_id: "test_client_123",
      redirect_uri: "http://localhost:3002/callback",
      response_type: "code",
    });

  let errorThrown = false;
  try {
    await getAuthCode({
      authorizationUrl: authUrl,
      port: 3002,
      launch: simulateOAuthRedirect,
    });
  } catch (error: any) {
    errorThrown = true;
    expect(error.name).toBe("OAuthError");
    expect(error.error).toBe("access_denied");
    expect(error.error_description).toBe("The user denied access");
  }

  expect(errorThrown).toBe(true);
});

test("successful authorization with string input", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize?" +
    new URLSearchParams({
      client_id: "test_client_456",
      redirect_uri: "http://localhost:3003/callback",
      response_type: "code",
    });

  const result = await getAuthCode({
    authorizationUrl: authUrl,
    port: 3003,
    launch: simulateOAuthRedirect,
  });

  expect(result.code).toBe("test_auth_code_123");
  expect(result.state).toBeUndefined(); // No state provided
});

test("timeout throws TimeoutError", async () => {
  // Headless mode: no authorizationUrl, no launch — just wait for callback
  let errorThrown = false;
  try {
    await getAuthCode({
      port: 3004,
      timeout: 100,
    });
  } catch (error: any) {
    errorThrown = true;
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.name).toBe("TimeoutError");
  }

  expect(errorThrown).toBe(true);
});

test("abort signal handling", async () => {
  const controller = new AbortController();

  // Abort after 50ms
  setTimeout(() => controller.abort(), 50);

  let errorThrown = false;
  try {
    // Headless mode: no authorizationUrl, no launch — just wait for callback
    await getAuthCode({
      port: 3005,
      signal: controller.signal,
    });
  } catch (error: any) {
    errorThrown = true;
    // Either message is acceptable - depends on timing of abort vs server stop
    expect(
      error.message === "Operation aborted" ||
        error.message === "Server stopped before callback received",
    ).toBe(true);
  }

  expect(errorThrown).toBe(true);
});

test("custom HTML templates", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize?" +
    new URLSearchParams({
      client_id: "template_test",
      redirect_uri: "http://localhost:3006/callback",
      response_type: "code",
    });

  const result = await getAuthCode({
    authorizationUrl: authUrl,
    port: 3006,
    successHtml: "<h1>Custom Success!</h1>",
    launch: simulateOAuthRedirect,
  });

  expect(result.code).toBe("test_auth_code_123");
});

test("onRequest callback is called", async () => {
  const authUrl =
    "http://localhost:8080/oauth/authorize?" +
    new URLSearchParams({
      client_id: "request_test",
      redirect_uri: "http://localhost:3007/callback",
      response_type: "code",
    });

  let requestReceived = false;
  let requestUrl = "";

  const result = await getAuthCode({
    authorizationUrl: authUrl,
    port: 3007,
    launch: simulateOAuthRedirect,
    onRequest: (req) => {
      requestReceived = true;
      requestUrl = req.url;
    },
  });

  expect(result.code).toBe("test_auth_code_123");
  expect(requestReceived).toBe(true);
  expect(requestUrl).toContain("/callback");
});

test("server cleanup on early stop", async () => {
  // This should not throw even if we never receive a callback
  let errorThrown = false;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    // Headless mode: no authorizationUrl, no launch — just wait for callback
    await getAuthCode({
      port: 3008,
      signal: controller.signal,
    });
  } catch (error: any) {
    errorThrown = true;
    // Either message is acceptable - depends on timing of abort vs server stop
    expect(
      error.message === "Operation aborted" ||
        error.message === "Server stopped before callback received",
    ).toBe(true);
  }

  expect(errorThrown).toBe(true);
});
