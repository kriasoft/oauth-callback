/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Converts OAuth expires_in (seconds) to Unix timestamp (ms).
 */
export function calculateExpiry(expiresIn?: number): number | undefined {
  if (!expiresIn) return undefined;
  return Date.now() + expiresIn * 1000;
}
