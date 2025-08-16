/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import type { TokenStore, Tokens } from "../mcp-types";

/**
 * Ephemeral in-memory token storage.
 * Tokens lost on process restart. Safe for concurrent access within process.
 */
export function inMemoryStore(): TokenStore {
  const store = new Map<string, Tokens>();

  return {
    async get(key: string): Promise<Tokens | null> {
      return store.get(key) ?? null;
    },

    async set(key: string, tokens: Tokens): Promise<void> {
      store.set(key, tokens);
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    async clear(): Promise<void> {
      store.clear();
    },
  };
}
