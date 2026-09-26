/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * MCP SDK integration: browser authorization for `@modelcontextprotocol/client`.
 * SDK types (`Client`, `OAuthClientMetadata`, …) come from the SDK, not from here.
 */

export {
  browserAuth,
  type BrowserAuth,
  type BrowserAuthOptions,
} from "./browser-auth.js";
export type { CredentialStore } from "./credential-store.js";
export { fileStore } from "./file-store.js";
