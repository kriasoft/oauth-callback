---
title: TypeScript Types
description: Reference for the TypeScript types exported by oauth-callback and oauth-callback/mcp.
---

# TypeScript Types

## `oauth-callback`

```ts
import type {
  AuthorizationCodeResult,
  AuthorizationUrlBuilder,
  GetAuthCodeOptions,
} from "oauth-callback";
```

### AuthorizationUrlBuilder

Builds the authorization URL once the loopback listener is bound. `redirect_uri` and `state` are appended when absent; if present they must match.

```ts
type AuthorizationUrlBuilder = (ctx: {
  /** Bound redirect URI, e.g. `http://127.0.0.1:53124/callback`. */
  redirectUri: URL;
  /** 32 random bytes, base64url. */
  state: string;
  /** Aborted on timeout or cancellation; pass it to any `fetch` (e.g. PAR). */
  signal: AbortSignal;
}) => string | URL | Promise<string | URL>;
```

### GetAuthCodeOptions

```ts
interface GetAuthCodeOptions {
  /**
   * Loopback redirect URI to listen on. Builder form: defaults to `http://127.0.0.1:0/callback`
   * (port 0 = OS-assigned). URL form: taken from the URL's `redirect_uri`; required when absent.
   */
  redirectUri?: string | URL;
  /** Opens the final authorization URL. Default: system browser. Only a rejection (or throw) fails the flow. */
  launch?: (url: URL) => unknown;
  /** Milliseconds for the whole attempt; integer in [1, 2_147_483_647]. Default 300_000. */
  timeout?: number;
  signal?: AbortSignal;
  /** Static HTML served after a successful callback. */
  successHtml?: string;
  /** Static HTML served after an error callback. */
  errorHtml?: string;
}
```

### AuthorizationCodeResult

```ts
interface AuthorizationCodeResult {
  code: string;
  /** Exact redirect URI of this flow; send it verbatim in the token request if the authorization request carried it. */
  redirectUri: string;
  /** Full callback query (`state`, `iss`, `scope`, extensions, …). */
  params: URLSearchParams;
}
```

### OAuthCallbackError

A class, exported as a value. See [OAuthCallbackError](/api/oauth-callback-error).

```ts
class OAuthCallbackError extends Error {
  readonly name: "OAuthCallbackError";
  readonly error: string;
  readonly description?: string;
  readonly uri?: string;
  readonly params: URLSearchParams;
}
```

Timeouts reject with a `DOMException` whose `name` is `"TimeoutError"`; there is no separate timeout class.

## `oauth-callback/mcp`

```ts
import type {
  BrowserAuth,
  BrowserAuthOptions,
  CredentialStore,
} from "oauth-callback/mcp";
```

MCP SDK types (`Client`, `ConnectOptions`, `OAuthClientProvider`, `OAuthClientMetadata`, `StoredOAuthClientInformation`, `StreamableHTTPClientTransportOptions`) come from `@modelcontextprotocol/client`.

### BrowserAuthOptions

```ts
interface BrowserAuthOptions {
  /** The one MCP server this provider (and its store) serves. */
  serverUrl: string | URL;
  /** Fixed loopback redirect URI, e.g. `http://127.0.0.1:8765/callback` (no port 0). */
  redirectUri: string | URL;
  /** Client name for Dynamic Client Registration; required unless `clientInformation` is set. */
  clientName?: string;
  /** Pre-registered client; `issuer` is the MCP server's `authorization_servers` entry. */
  clientInformation?: StoredOAuthClientInformation & { issuer: string };
  /** Extra client metadata (e.g. `scope`, `grant_types`). */
  clientMetadata?: Partial<
    Omit<
      OAuthClientMetadata,
      "client_name" | "redirect_uris" | "response_types" | "application_type"
    >
  >;
  /** Credential persistence. Default: memory. */
  store?: CredentialStore;
  /** Opens the URL; only a rejection fails the flow. */
  launch?: (url: URL) => unknown;
  /** Milliseconds for one authorization, through token exchange. Default 300_000. */
  timeout?: number;
  successHtml?: string;
  errorHtml?: string;
}
```

### BrowserAuth

```ts
interface BrowserAuth extends OAuthClientProvider {
  connect(
    client: Client,
    options?: ConnectOptions & {
      transportOptions?: Omit<
        StreamableHTTPClientTransportOptions,
        "authProvider"
      >;
    },
  ): Promise<void>;
  completeAuthorization(
    transport: { finishAuth(params: URLSearchParams): Promise<void> },
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}
```

See [browserAuth](/api/browser-auth).

### CredentialStore

```ts
interface CredentialStore {
  /** Returns the saved text, or `undefined` when empty. */
  load(): Promise<string | undefined>;
  /** Replaces the saved text; `undefined` clears it. */
  save(value: string | undefined): Promise<void>;
}
```

See [CredentialStore](/api/credential-store).

## Runtime exports

| Entry point          | Values                              | Types                                                                      |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `oauth-callback`     | `getAuthCode`, `OAuthCallbackError` | `AuthorizationCodeResult`, `AuthorizationUrlBuilder`, `GetAuthCodeOptions` |
| `oauth-callback/mcp` | `browserAuth`, `fileStore`          | `BrowserAuth`, `BrowserAuthOptions`, `CredentialStore`                     |
