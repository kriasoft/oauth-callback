/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { TokenStore, Tokens } from "../mcp-types";

/**
 * Persistent file-based token storage.
 * Serializes mutations within a single store instance.
 * Not safe for concurrent access to the same file across multiple instances or processes.
 * Default: ~/.mcp/tokens.json
 */
export function fileStore(filepath?: string): TokenStore {
  const file = filepath ?? path.join(os.homedir(), ".mcp", "tokens.json");
  let mutationQueue: Promise<void> = Promise.resolve();

  async function ensureDir() {
    // Owner-only; applies only to directories created here.
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
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
    const tmp = `${file}.tmp.${process.pid}.${randomUUID()}`;
    let tmpCreated = false;

    try {
      const handle = await fs.open(tmp, "wx", 0o600);
      tmpCreated = true;

      try {
        await handle.writeFile(JSON.stringify(data, null, 2), "utf-8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      await fs.rename(tmp, file);
      tmpCreated = false;
    } catch (error) {
      if (tmpCreated) {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
      throw error;
    }
  }

  function mutateStore(
    mutate: (store: Record<string, Tokens>) => void,
  ): Promise<void> {
    const operation = mutationQueue.then(async () => {
      const store = await readStore();
      mutate(store);
      await writeStore(store);
    });

    mutationQueue = operation.catch(() => {});
    return operation;
  }

  return {
    async get(key: string): Promise<Tokens | null> {
      const store = await readStore();
      return store[key] ?? null;
    },

    async set(key: string, tokens: Tokens): Promise<void> {
      return mutateStore((store) => {
        store[key] = tokens;
      });
    },

    async delete(key: string): Promise<void> {
      return mutateStore((store) => {
        delete store[key];
      });
    },
  };
}
