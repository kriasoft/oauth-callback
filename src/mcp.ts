/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * MCP SDK-specific OAuth providers and utilities.
 * For Model Context Protocol integration.
 *
 * @module oauth-callback/mcp
 */

export { browserAuth } from "./auth/browser-auth";

export { inMemoryStore } from "./storage/memory";
export { fileStore } from "./storage/file";

export type {
  BrowserAuthOptions,
  Tokens,
  TokenStore,
  ClientInfo,
  OAuthSession,
  OAuthStore,
} from "./mcp-types";
