/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Turns a browser authorization into a validated authorization response on a
 * loopback redirect URI, on Node.js, Deno and Bun. MCP integration: `oauth-callback/mcp`.
 */

export {
  getAuthCode,
  OAuthCallbackError,
  type AuthorizationCodeResult,
  type AuthorizationUrlBuilder,
  type GetAuthCodeOptions,
} from "./get-auth-code.js";
