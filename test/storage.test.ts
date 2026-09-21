/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TokenStore, Tokens } from "../src/mcp-types";
import { fileStore } from "../src/storage/file";
import { inMemoryStore } from "../src/storage/memory";

const primaryTokens: Tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: 2_000_000_000_000,
  scope: "read write",
};

const replacementTokens: Tokens = {
  accessToken: "replacement-access-token",
  refreshToken: "replacement-refresh-token",
  expiresAt: 2_100_000_000_000,
  scope: "admin",
};

describe("inMemoryStore", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = inMemoryStore();
  });

  test("returns null for a missing key", async () => {
    expect(await store.get("missing")).toBeNull();
  });

  test("stores and retrieves tokens", async () => {
    await store.set("account", primaryTokens);

    expect(await store.get("account")).toEqual(primaryTokens);
  });

  test("overwrites an existing key", async () => {
    await store.set("account", primaryTokens);
    await store.set("account", replacementTokens);

    expect(await store.get("account")).toEqual(replacementTokens);
  });

  test("isolates keys and deletes only the requested key", async () => {
    await store.set("first", primaryTokens);
    await store.set("second", replacementTokens);

    await store.delete("first");

    expect(await store.get("first")).toBeNull();
    expect(await store.get("second")).toEqual(replacementTokens);
  });

  test("keeps separate instances independent", async () => {
    await store.set("account", primaryTokens);

    expect(await inMemoryStore().get("account")).toBeNull();
  });
});

describe("fileStore", () => {
  let tempDir: string;
  let filepath: string;
  let store: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-callback-storage-"));
    filepath = join(tempDir, "nested", "tokens.json");
    store = fileStore(filepath);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns null when the storage file does not exist", async () => {
    expect(await store.get("missing")).toBeNull();
  });

  test("creates parent directories and persists tokens", async () => {
    await store.set("account", primaryTokens);

    const reopenedStore = fileStore(filepath);
    expect(await reopenedStore.get("account")).toEqual(primaryTokens);

    const persisted = JSON.parse(await readFile(filepath, "utf-8"));
    expect(persisted.account).toEqual(primaryTokens);
  });

  test("overwrites one key without changing another", async () => {
    await store.set("first", primaryTokens);
    await store.set("second", primaryTokens);

    await store.set("first", replacementTokens);

    expect(await store.get("first")).toEqual(replacementTokens);
    expect(await store.get("second")).toEqual(primaryTokens);
  });

  test("deletes only the requested key", async () => {
    await store.set("first", primaryTokens);
    await store.set("second", replacementTokens);

    await store.delete("first");

    expect(await store.get("first")).toBeNull();
    expect(await store.get("second")).toEqual(replacementTokens);

    const persisted = JSON.parse(await readFile(filepath, "utf-8"));
    expect(persisted.first).toBeUndefined();
    expect(persisted.second).toEqual(replacementTokens);
  });

  test("deleting a missing key is a no-op", async () => {
    await store.set("account", primaryTokens);

    await store.delete("missing");

    expect(await store.get("account")).toEqual(primaryTokens);
  });

  test("serializes concurrent mutations without losing keys", async () => {
    const entries = Array.from(
      { length: 8 },
      (_, index) =>
        [
          `account-${index}`,
          { accessToken: `access-token-${index}` } satisfies Tokens,
        ] as const,
    );

    await Promise.all(entries.map(([key, tokens]) => store.set(key, tokens)));

    for (const [key, tokens] of entries) {
      expect(await store.get(key)).toEqual(tokens);
    }

    const persisted = JSON.parse(await readFile(filepath, "utf-8"));
    expect(Object.keys(persisted).sort()).toEqual(
      entries.map(([key]) => key).sort(),
    );

    const files = await readdir(join(tempDir, "nested"));
    expect(files.filter((name) => name.includes(".tmp."))).toEqual([]);
  });

  test("serializes concurrent sets and deletes", async () => {
    await store.set("removed", primaryTokens);

    await Promise.all([
      store.set("kept", replacementTokens),
      store.delete("removed"),
    ]);

    expect(JSON.parse(await readFile(filepath, "utf-8"))).toEqual({
      kept: replacementTokens,
    });
  });

  test.skipIf(process.platform === "win32")(
    "creates owner-only token files and directories",
    async () => {
      await store.set("account", primaryTokens);

      expect((await stat(filepath)).mode & 0o777).toBe(0o600);
      expect((await stat(join(tempDir, "nested"))).mode & 0o777).toBe(0o700);
    },
  );

  test("removes temporary files when the final rename fails", async () => {
    await mkdir(filepath, { recursive: true });

    let error: unknown;
    try {
      await store.set("account", primaryTokens);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();

    const files = await readdir(join(tempDir, "nested"));
    expect(files.filter((name) => name.startsWith("tokens.json.tmp."))).toEqual(
      [],
    );
  });

  test("continues processing mutations after a failed write", async () => {
    await mkdir(filepath, { recursive: true });

    await expect(store.set("first", primaryTokens)).rejects.toThrow();

    await rm(filepath, { recursive: true, force: true });
    await store.set("second", replacementTokens);

    expect(await store.get("second")).toEqual(replacementTokens);
  });

  test("recovers from invalid JSON on the next write", async () => {
    await store.set("old", primaryTokens);
    await writeFile(filepath, "{invalid-json", "utf-8");

    expect(await store.get("old")).toBeNull();

    await store.set("recovered", replacementTokens);

    expect(await store.get("recovered")).toEqual(replacementTokens);
    const persisted = JSON.parse(await readFile(filepath, "utf-8"));
    expect(persisted).toEqual({ recovered: replacementTokens });
  });

  test("round-trips Unicode keys and token values", async () => {
    const unicodeTokens: Tokens = {
      accessToken: "令牌-🔐",
      refreshToken: "更新-♻️",
      scope: "读取 写入 🚀",
    };

    await store.set("用户-🔑", unicodeTokens);

    expect(await store.get("用户-🔑")).toEqual(unicodeTokens);
  });
});
