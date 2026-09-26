/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import type {
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";

/**
 * Persists one opaque text value; the adapter owns its format (ADR-005).
 *
 * @example
 * ```ts
 * const store: CredentialStore = {
 *   load: () => keychain.get(name),
 *   save: (v) => (v === undefined ? keychain.delete(name) : keychain.set(name, v)),
 * };
 * ```
 */
export interface CredentialStore {
  /** Returns the saved text, or `undefined` when empty. */
  load(): Promise<string | undefined>;
  /** Replaces the saved text; `undefined` clears it. */
  save(value: string | undefined): Promise<void>;
}

/** Stored document. Bound to one MCP server: tokens are audience-bound (RFC 8707). */
interface CredentialDocument {
  version: 1;
  serverUrl: string;
  client?: StoredOAuthClientInformation;
  tokens?: StoredOAuthTokens;
}

export type Credentials = Pick<CredentialDocument, "client" | "tokens">;

export function memoryStore(): CredentialStore {
  let value: string | undefined;
  return {
    load: async () => value,
    save: async (next) => void (value = next),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Loads and saves the single credential slot (one client, one token set) for `serverUrl`.
 * Unreadable or foreign documents throw instead of being silently discarded.
 */
export class CredentialSlot {
  #loaded?: Promise<Credentials>;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: CredentialStore,
    private readonly serverUrl: string,
  ) {}

  read(): Promise<Credentials> {
    return (this.#loaded ??= this.store
      .load()
      .then((text) => this.#parse(text)));
  }

  /**
   * Applies `change` to the current slot and persists it. Read–modify–write runs in a queue,
   * so concurrent SDK saves and invalidations each see the previous one's result.
   */
  update(change: (credentials: Credentials) => Credentials): Promise<void> {
    const run = this.#queue.then(async () => {
      const next = change(await this.read());
      const text =
        next.client || next.tokens
          ? JSON.stringify({
              version: 1,
              serverUrl: this.serverUrl,
              ...next,
            } satisfies CredentialDocument)
          : undefined;
      await this.store.save(text);
      this.#loaded = Promise.resolve(next);
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  #parse(text: string | undefined): Credentials {
    if (text === undefined) return {};
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      throw new Error("Stored MCP credentials are not valid JSON");
    }
    if (!isObject(doc) || doc.version !== 1)
      throw new Error("Stored MCP credentials have an unsupported format");
    if (doc.serverUrl !== this.serverUrl)
      throw new Error(
        `Stored MCP credentials belong to ${String(doc.serverUrl)}, not ${this.serverUrl}; use one store per server`,
      );
    const { client, tokens } = doc;
    if (
      client !== undefined &&
      !(isObject(client) && typeof client.client_id === "string")
    )
      throw new Error("Stored MCP client information is invalid");
    if (
      tokens !== undefined &&
      !(isObject(tokens) && typeof tokens.access_token === "string")
    )
      throw new Error("Stored MCP tokens are invalid");
    return { client, tokens } as Credentials;
  }
}
