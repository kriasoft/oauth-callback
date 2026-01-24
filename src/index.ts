/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * OAuth 2.0 authorization code flow handler for Node.js, Deno, and Bun.
 * Creates a temporary localhost server to capture OAuth callbacks for CLI/desktop apps.
 */

import { OAuthError } from "./errors";
import { createCallbackServer, type CallbackResult } from "./server";
import type { GetAuthCodeOptions } from "./types";

export type { CallbackResult, CallbackServer, ServerOptions } from "./server";
export { OAuthError, TimeoutError } from "./errors";
export type { GetAuthCodeOptions } from "./types";

// Storage implementations (backward compatibility)
export { inMemoryStore } from "./storage/memory";
export { fileStore } from "./storage/file";

// MCP namespace export
import * as mcp from "./mcp";
export { mcp };

/**
 * Captures OAuth authorization code via localhost callback.
 * Starts a temporary server, optionally launches auth URL, waits for redirect.
 *
 * @param input - Auth URL string or GetAuthCodeOptions with config
 * @returns Promise<CallbackResult> with code and params
 * @throws {OAuthError} Provider errors (access_denied, invalid_scope)
 * @throws {Error} Timeout, network failures, port conflicts
 *
 * @example
 * ```typescript
 * import open from "open";
 *
 * // With browser launch
 * const result = await getAuthCode({
 *   authorizationUrl: 'https://oauth.example.com/authorize?...',
 *   launch: open,
 * });
 *
 * // Headless (print URL, let user open manually)
 * const url = 'https://oauth.example.com/authorize?...';
 * console.log('Open:', url);
 * const result = await getAuthCode({ authorizationUrl: url });
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
    timeout = 30000,
    callbackPath = "/callback",
    successHtml,
    errorHtml,
    signal,
    onRequest,
    launch,
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

    // Best-effort launch: fire-and-forget, swallow errors
    if (launch) void Promise.resolve(launch(authorizationUrl)).catch(() => {});

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
