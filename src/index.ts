/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * OAuth 2.0 authorization code flow handler for Node.js, Deno, and Bun.
 * Creates a temporary localhost server to capture OAuth callbacks for CLI/desktop apps.
 */

import { OAuthError } from "./errors";
import { createCallbackServer, type CallbackResult } from "./server";
import type { GetAuthCodeOptions } from "./types";

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = "localhost";
const DEFAULT_CALLBACK_PATH = "/callback";

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
 * Builds the redirect URI for OAuth configuration.
 * Use this to construct the redirect_uri parameter for your authorization URL.
 *
 * @example
 * ```typescript
 * const redirectUri = getRedirectUrl({ port: 3000 });
 * // => "http://localhost:3000/callback"
 *
 * const authUrl = `https://oauth.example.com/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;
 * console.log('Open:', authUrl);
 * await getAuthCode({ port: 3000 });
 * ```
 */
export function getRedirectUrl(
  options: {
    port?: number;
    hostname?: string;
    callbackPath?: string;
  } = {},
): string {
  const {
    port = DEFAULT_PORT,
    hostname = DEFAULT_HOSTNAME,
    callbackPath = DEFAULT_CALLBACK_PATH,
  } = options;
  return `http://${hostname}:${port}${callbackPath}`;
}

async function authorizationUrlToOptions(
  input: string,
): Promise<GetAuthCodeOptions> {
  const open = await import("open");
  return { authorizationUrl: input, launch: open.default };
}

/**
 * Captures OAuth authorization code via localhost callback.
 * Starts a temporary server, optionally launches auth URL, waits for redirect.
 *
 * Two modes:
 * - **Managed**: Pass both `authorizationUrl` and `launch` — library opens browser
 * - **Headless**: Pass neither — caller handles URL display (CI/SSH/custom UI)
 *
 * @param input - Auth URL string (auto-launches browser) or GetAuthCodeOptions
 * @returns Promise<CallbackResult> with code and params
 * @throws {OAuthError} Provider errors (access_denied, invalid_scope)
 * @throws {Error} Timeout, network failures, port conflicts
 *
 * @example
 * ```typescript
 * import open from "open";
 *
 * // Managed mode: library launches browser
 * const result = await getAuthCode({
 *   authorizationUrl: 'https://oauth.example.com/authorize?...',
 *   launch: open,
 * });
 *
 * // Headless mode: caller handles URL display
 * const authUrl = 'https://oauth.example.com/authorize?...';
 * console.log('Open this URL:', authUrl);
 * const result = await getAuthCode({ port: 3000, timeout: 60000 });
 * ```
 */
export async function getAuthCode(
  input: GetAuthCodeOptions | string,
): Promise<CallbackResult> {
  const options: GetAuthCodeOptions =
    typeof input === "string" ? await authorizationUrlToOptions(input) : input;

  const {
    port = DEFAULT_PORT,
    hostname = DEFAULT_HOSTNAME,
    timeout = 30000,
    callbackPath = DEFAULT_CALLBACK_PATH,
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

    // Best-effort launch: fire-and-forget, swallow errors (managed mode only)
    if (
      "authorizationUrl" in options &&
      options.authorizationUrl &&
      "launch" in options &&
      typeof options.launch === "function"
    ) {
      void Promise.resolve(options.launch(options.authorizationUrl)).catch(
        () => {},
      );
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
