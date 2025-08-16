/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import type { Tokens } from "../mcp-types";

/**
 * Checks token expiry with safety buffer.
 * Access tokens: 60s buffer to prevent mid-request expiry.
 */
export function isTokenExpired(
  tokens: Tokens,
  type: "access" | "refresh" = "access",
): boolean {
  if (!tokens.expiresAt) {
    // No expiry = non-expiring token
    return false;
  }

  const buffer = type === "access" ? 60000 : 0;
  return Date.now() >= tokens.expiresAt - buffer;
}

/**
 * Converts OAuth expires_in (seconds) to Unix timestamp (ms).
 */
export function calculateExpiry(expiresIn?: number): number | undefined {
  if (!expiresIn) return undefined;
  return Date.now() + expiresIn * 1000;
}
