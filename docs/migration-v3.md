# Migrating to v3

v3 narrows the library to one job — turning a browser authorization into a validated authorization code on a loopback redirect URI — and lets the MCP SDK own OAuth in `oauth-callback/mcp`. Requirements: Node.js 22+, Deno 2, or Bun 1.2+; `@modelcontextprotocol/client` 2.1+ for `/mcp`.

## `getAuthCode()`

```ts
// v2
const result = await getAuthCode({
  authorizationUrl: url, // with redirect_uri=http://localhost:3000/callback
  port: 3000,
  launch: true,
  timeout: 30000,
});
result.code;
result.state;

// v3
const { code, redirectUri, params } = await getAuthCode(url);
params.get("state");
```

| v2                                              | v3                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getAuthCode({ authorizationUrl })`             | `getAuthCode(url, options?)`, or a builder `getAuthCode(({ redirectUri, state }) => url)`        |
| `port`, `hostname`, `callbackPath`              | `redirectUri` option, or the URL's `redirect_uri`; builder default `http://127.0.0.1:0/callback` |
| `launch: true`                                  | default                                                                                          |
| `launch: false`                                 | `launch: (url) => console.log(url)` — the final URL includes the generated `state`               |
| `launch: fn(url: string)`                       | `launch: (url: URL) => …`; a rejection now fails the flow                                        |
| `timeout` default 30 s                          | default 5 min; integer ms in [1, 2³¹−1]                                                          |
| result `{ code, state, …params }`               | `{ code, redirectUri, params: URLSearchParams }`                                                 |
| `OAuthError` (`error_description`, `error_uri`) | `OAuthCallbackError` (`error`, `description`, `uri`, `params`)                                   |
| `TimeoutError` class                            | `DOMException` with `name === "TimeoutError"`                                                    |
| abort → `Error("Operation aborted")`            | rejects with `signal.reason`                                                                     |
| `errorHtml` placeholders `{{error}}`            | static HTML, served verbatim (callback data is never rendered)                                   |
| `onRequest`                                     | removed                                                                                          |
| `getRedirectUrl()`                              | removed — use the builder's `redirectUri`                                                        |
| `mcp` namespace, root store exports             | removed — import from `oauth-callback/mcp`                                                       |

Behavior changes:

- **State is always present.** A URL without `state` gets one appended; callbacks must echo it.
- **URLs are validated before launch.** `https:` (or loopback `http:`), no fragment or credentials, `response_type` and `response_mode`, if present, must be `code` and `query`. Prebuilt PAR/JAR URLs are rejected — use the builder.
- **Default host is `127.0.0.1`**, not `localhost` (RFC 8252 §8.3). `localhost` redirect URIs still work.
- **Register the loopback redirect** your provider expects, e.g. `http://127.0.0.1/callback` for providers that allow any loopback port (RFC 8252 §7.3), or a fixed `http://127.0.0.1:8765/callback` with `redirectUri`.

## `oauth-callback/mcp`

```ts
// v2
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { browserAuth, fileStore } from "oauth-callback/mcp";

const authProvider = browserAuth({
  port: 3000,
  scope: "read write",
  store: fileStore(),
});
try {
  await client.connect(
    new StreamableHTTPClientTransport(serverUrl, { authProvider }),
  );
} catch {
  await client.connect(
    new StreamableHTTPClientTransport(serverUrl, { authProvider }),
  );
}

// v3
import { Client } from "@modelcontextprotocol/client";
import { browserAuth, fileStore } from "oauth-callback/mcp";

const auth = browserAuth({
  serverUrl,
  redirectUri: "http://127.0.0.1:3000/callback",
  clientName: "My CLI",
  clientMetadata: { scope: "read write" },
  store: fileStore(path.join(os.homedir(), ".config/my-cli/mcp.json")),
});
await auth.connect(client);
```

| v2                                   | v3                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` 1.x      | `@modelcontextprotocol/client` 2.1+                                                |
| connect-retry boilerplate            | `auth.connect(client)`; custom transports: `auth.completeAuthorization(transport)` |
| `port`, `hostname`, `callbackPath`   | `redirectUri` (required, fixed port)                                               |
| —                                    | `serverUrl` (required; the provider and its store serve one server)                |
| DCR client name fixed                | `clientName` (required unless `clientInformation`)                                 |
| `clientId`, `clientSecret`           | `clientInformation: { client_id, client_secret?, issuer }`                         |
| `scope`                              | `clientMetadata: { scope }`; the server's challenge and metadata take priority     |
| `authTimeout`                        | `timeout` (one flow; `connect()` aborts its OAuth requests at the deadline)        |
| `store: TokenStore`, `storeKey`      | `store: CredentialStore` (`load()`/`save(text)`), one per server                   |
| `inMemoryStore()`                    | default                                                                            |
| `fileStore()` → `~/.mcp/tokens.json` | `fileStore(absolutePath)`, no default path                                         |
| no refresh tokens                    | refresh handled by the SDK                                                         |
| `onRequest`                          | removed                                                                            |

Stored v2 token files aren't read by v3: users authorize once after upgrading. To opt into `offline_access` refresh tokens, declare `clientMetadata: { grant_types: ["authorization_code", "refresh_token"] }`.
