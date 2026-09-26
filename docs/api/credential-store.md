---
title: CredentialStore
description: Persist MCP OAuth credentials in memory, a file or the OS keychain with a two-method CredentialStore.
---

# CredentialStore

`browserAuth()` persists its MCP credentials (the registered client and the token set) through a `CredentialStore`: two methods over one opaque string.

## Interface

```ts
import type { CredentialStore } from "oauth-callback/mcp";

interface CredentialStore {
  /** Returns the saved text, or `undefined` when empty. */
  load(): Promise<string | undefined>;
  /** Replaces the saved text; `undefined` clears it. */
  save(value: string | undefined): Promise<void>;
}
```

The adapter owns the format: a JSON document `{ version: 1, serverUrl, client?, tokens? }` holding the MCP SDK's client information and tokens (stamped with the `client_id` they were issued to). A store never parses it. When both client and tokens are cleared, the adapter calls `save(undefined)`.

The adapter reads the store once, then keeps a cached copy and serializes its writes.

## Rules

- **One store per MCP server.** Tokens are audience-bound ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)). A document saved for another `serverUrl` throws instead of being reused.
- **Nothing is discarded silently.** Unreadable JSON, an unknown version or invalid records throw; clear the store to start over.
- **Only durable state is stored.** `state`, the PKCE verifier and discovery state stay in memory.
- **One slot.** A new client registration replaces the stored client and drops tokens issued to the old one.

## Default: memory

Without a `store` option, credentials live in memory for the lifetime of the provider. Every new process authorizes again.

```ts
const auth = browserAuth({ serverUrl, redirectUri, clientName: "Acme CLI" });
```

## fileStore

```ts
function fileStore(path: string): CredentialStore;
```

Stores the document in a file; on POSIX systems it is readable only by the current user.

- `path` must be absolute. `~` is not expanded; use `os.homedir()`.
- The file is created with mode `0600` and missing directories with `0700`.
- Writes are atomic (temp file + rename) and queued per instance. There is no cross-process locking: don't share one file between processes or providers.
- `save(undefined)` deletes the file.

```ts
import { browserAuth, fileStore } from "oauth-callback/mcp";
import { homedir } from "node:os";
import { join } from "node:path";

const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: fileStore(join(homedir(), ".config/acme/notion.json")),
});
```

On Deno, `fileStore` needs `--allow-read` and `--allow-write`. For production apps, prefer the OS keychain.

## Keychain example

Any secret store with get/set/delete fits in four lines. With [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring):

```ts
import { Entry } from "@napi-rs/keyring";
import type { CredentialStore } from "oauth-callback/mcp";

function keychainStore(service: string, account: string): CredentialStore {
  const entry = new Entry(service, account);
  return {
    load: async () => entry.getPassword() ?? undefined,
    save: async (value) => {
      if (value === undefined) entry.deletePassword();
      else entry.setPassword(value);
    },
  };
}

const auth = browserAuth({
  serverUrl: "https://mcp.linear.app/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: keychainStore("acme-cli", "linear-mcp"),
});
```

## Several servers

Give each server its own store and provider:

```ts
const notion = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: fileStore(join(dir, "notion.json")),
});
const linear = browserAuth({
  serverUrl: "https://mcp.linear.app/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: fileStore(join(dir, "linear.json")),
});
```

## Signing out

```ts
await client.close(); // clearing credentials doesn't close a live connection
await auth.invalidateCredentials("all"); // save(undefined)
```

## Testing

A store is a plain object, so tests can inspect what was saved:

```ts
let saved: string | undefined;
const store: CredentialStore = {
  load: async () => saved,
  save: async (value) => void (saved = value),
};
```

## Related

- [browserAuth](/api/browser-auth)
- [ADR-005: Credential store holds opaque text](/adr/005-store-responsibility-reduction)
