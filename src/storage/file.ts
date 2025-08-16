/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { TokenStore, Tokens } from "../mcp-types";

/**
 * Persistent file-based token storage.
 * Default: ~/.mcp/tokens.json
 * WARNING: Not safe for concurrent access across processes.
 */
export function fileStore(filepath?: string): TokenStore {
  const file = filepath ?? path.join(os.homedir(), ".mcp", "tokens.json");

  async function ensureDir() {
    await fs.mkdir(path.dirname(file), { recursive: true });
  }

  async function readStore(): Promise<Record<string, Tokens>> {
    try {
      const data = await fs.readFile(file, "utf-8");
      return JSON.parse(data);
    } catch {
      return {}; // File missing or invalid JSON
    }
  }

  async function writeStore(data: Record<string, Tokens>) {
    await ensureDir();
    // TODO: Atomic write via temp file + rename
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    async get(key: string): Promise<Tokens | null> {
      const store = await readStore();
      return store[key] ?? null;
    },

    async set(key: string, tokens: Tokens): Promise<void> {
      const store = await readStore();
      store[key] = tokens;
      await writeStore(store);
    },

    async delete(key: string): Promise<void> {
      const store = await readStore();
      delete store[key];
      await writeStore(store);
    },

    async clear(): Promise<void> {
      await writeStore({});
    },
  };
}
