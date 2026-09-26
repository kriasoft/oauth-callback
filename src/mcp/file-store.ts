/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import type { CredentialStore } from "./credential-store.js";

/**
 * Stores credentials in a file; on POSIX it is readable only by the current user (0600;
 * directories it creates are 0700). Writes are atomic (temp file + rename) and queued per
 * instance, with no cross-process locking: give each process or provider its own file.
 * For production, prefer the OS keychain via a custom {@link CredentialStore}.
 *
 * @param path Absolute path; `~` is not expanded. Use `path.join(os.homedir(), …)`.
 */
export function fileStore(path: string): CredentialStore {
  if (typeof path !== "string" || !isAbsolute(path))
    throw new TypeError(
      `fileStore() needs an absolute path, got "${path}"; use path.join(os.homedir(), ".config/app/credentials.json")`,
    );
  let queue: Promise<unknown> = Promise.resolve();

  return {
    async load() {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      }
    },
    save(value) {
      const write = queue.then(() =>
        value === undefined ? rm(path, { force: true }) : replace(path, value),
      );
      queue = write.catch(() => {});
      return write;
    },
  };
}

async function replace(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, value, { mode: 0o600 });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
