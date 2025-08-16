/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * OAuth 2.0 authorization code flow handler for Node.js, Deno, and Bun.
 * Creates a temporary localhost server to capture OAuth callbacks for CLI/desktop apps.
 */

import open from "open";
import { OAuthError } from "./errors";
import { createCallbackServer, type CallbackResult } from "./server";
import type { GetAuthCodeOptions } from "./types";

export type { CallbackResult, CallbackServer, ServerOptions } from "./server";
export { OAuthError } from "./errors";
export type { GetAuthCodeOptions } from "./types";

// MCP auth providers
export { browserAuth } from "./auth/browser-auth";

// Storage implementations
export { inMemoryStore } from "./storage/memory";
export { fileStore } from "./storage/file";

// MCP types
export type { BrowserAuthOptions, Tokens, TokenStore } from "./mcp-types";

/**
 * Captures OAuth authorization code via localhost callback.
 * Opens browser to auth URL, waits for provider redirect to localhost.
 *
 * @param input - Auth URL string or GetAuthCodeOptions with config
 * @returns Promise<CallbackResult> with code and params
 * @throws {OAuthError} Provider errors (access_denied, invalid_scope)
 * @throws {Error} Timeout, network failures, port conflicts
 *
 * @example
 * ```typescript
 * // Simple
 * const result = await getAuthCode('https://oauth.example.com/authorize?...');
 * console.log('Code:', result.code);
 *
 * // Custom port/timeout
 * const result = await getAuthCode({
 *   authorizationUrl: 'https://oauth.example.com/authorize?...',
 *   port: 8080,
 *   timeout: 60000,
 *   onRequest: (req) => console.log('Request:', req.url)
 * });
 * ```
 */
export async function getAuthCode(
  input: GetAuthCodeOptions | string,
): Promise<CallbackResult> {
  const options: GetAuthCodeOptions =
    typeof input === "string" ? { authorizationUrl: input } : input;

  const {
    authorizationUrl,
    port = 3000,
    hostname = "localhost",
    openBrowser = true,
    timeout = 30000,
    callbackPath = "/callback",
    successHtml,
    errorHtml,
    signal,
    onRequest,
  } = options;

  const server = createCallbackServer();

  try {
    await server.start({
      port,
      hostname,
      successHtml,
      errorHtml,
      signal,
      onRequest,
    });

    if (openBrowser) {
      await open(authorizationUrl);
    } else {
      // Test mode: trigger mock provider redirect without browser
      fetch(authorizationUrl)
        .then(async (response) => {
          if (response.status === 302 || response.status === 301) {
            const location = response.headers.get("Location");
            if (location) {
              await fetch(location);
            }
          }
        })
        .catch(() => {
          // Ignore - tests may lack mock provider
        });
    }

    const result = await server.waitForCallback(callbackPath, timeout);

    // OAuth errors must be thrown, not returned
    if (result.error) {
      throw new OAuthError(
        result.error,
        result.error_description,
        result.error_uri,
      );
    }

    return result;
  } finally {
    await server.stop();
  }
}
