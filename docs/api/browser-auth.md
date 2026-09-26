---
title: browserAuth
description: Browser authorization provider for the MCP SDK, with connect(client), step-up handling and pluggable credential storage.
---

# browserAuth

Creates an MCP SDK `OAuthClientProvider` that authorizes in the system browser and persists credentials in a [`CredentialStore`](/api/credential-store). `connect(client)` connects an MCP client over Streamable HTTP, running the browser flow when the server requires it.

The MCP SDK owns the OAuth protocol: discovery, Dynamic Client Registration, PKCE, token exchange, refresh and `iss` checks. `browserAuth()` owns the browser, the loopback listener, `state`, flow ownership and credential persistence.

## Signature

```ts
import { browserAuth } from "oauth-callback/mcp";

function browserAuth(options: BrowserAuthOptions): BrowserAuth;
```

Requires `@modelcontextprotocol/client` 2.1+.

## Options

| Option              | Type                                                | Default        | Description                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverUrl`         | `string \| URL`                                     | required       | The one MCP server this provider and its store serve (`https:`, or `http:` on a loopback host)                                                                                              |
| `redirectUri`       | `string \| URL`                                     | required       | Fixed loopback redirect URI, e.g. `http://127.0.0.1:8765/callback`. No port 0                                                                                                               |
| `clientName`        | `string`                                            | —              | Client name for Dynamic Client Registration. Required unless `clientInformation` is set                                                                                                     |
| `clientInformation` | `StoredOAuthClientInformation & { issuer: string }` | —              | Pre-registered client; disables DCR                                                                                                                                                         |
| `clientMetadata`    | `Partial<OAuthClientMetadata>`                      | —              | Extra DCR metadata, e.g. `scope` or `grant_types`                                                                                                                                           |
| `store`             | `CredentialStore`                                   | memory         | Credential persistence                                                                                                                                                                      |
| `launch`            | `(url: URL) => unknown`                             | system browser | Opens the URL. Fulfillment is ignored; a throw or rejection fails the flow                                                                                                                  |
| `timeout`           | `number`                                            | `300000`       | Milliseconds for one authorization, integer in [1, 2³¹−1]. `connect()` aborts its OAuth requests at the deadline; `completeAuthorization()` can't interrupt your transport's `finishAuth()` |
| `successHtml`       | `string`                                            | neutral page   | Static HTML after a successful callback                                                                                                                                                     |
| `errorHtml`         | `string`                                            | neutral page   | Static HTML after an error callback                                                                                                                                                         |

Notes:

- **`redirectUri`** is registered with the authorization server, so it must be fixed. It follows the same loopback rules as [`getAuthCode()`](/api/get-auth-code#options).
- **`clientMetadata`** can't override `client_name`, `redirect_uris`, `response_types` or `application_type`. The SDK derives the other DCR defaults; requested scopes from the server's challenge and metadata take priority over `scope`.
- **`clientInformation.issuer`** is the `authorization_servers` entry of the MCP server's protected-resource metadata. A static client is never re-registered, and the SDK refuses a different issuer.
- **Refresh tokens.** To opt into `offline_access`, declare `clientMetadata: { grant_types: ["authorization_code", "refresh_token"] }`.

Invalid options throw `TypeError` (or `RangeError` for `timeout`) immediately.

## Return value

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

### `connect(client, options?)`

Connects `client` to `serverUrl` over a Streamable HTTP transport it creates, completing browser authorization if required. Resolves once `client` is connected.

- Reuses stored tokens; the browser opens only when the SDK needs a new authorization.
- For a client it already connected, it returns without reconnecting, after completing any authorization pending on that connection (step-up). Calling it again on `UnauthorizedError` is safe.
- Throws if `client` is connected over a transport it didn't create. It never closes such a transport; use `completeAuthorization()` there.
- `options.signal` cancels the call, including waiting for the browser; `transportOptions` (e.g. `requestInit`, `fetch`) configure the transport.
- Calls on one provider run one at a time.

### `completeAuthorization(transport, options?)`

Low-level, for transports you create. After the SDK throws `UnauthorizedError`, waits for the pending callback and exchanges it on `transport`, which must be the transport that received the 401/403. Then close it and reconnect with a new transport. A flow on your own transports stays pending until `completeAuthorization()` consumes it, even after its launcher failed or it timed out (it then rejects with that error), so always call it after `UnauthorizedError`. Give that transport a bounded `fetch`, since the library can't cancel a request it didn't start.

### Provider hooks

The `OAuthClientProvider` members (`redirectUrl`, `clientMetadata`, `state()`, `tokens()`, `saveTokens()`, `redirectToAuthorization()`, `invalidateCredentials()`, …) are called by the SDK. Of these, only `invalidateCredentials("all")` is useful to call yourself: it clears the stored credentials. It doesn't close a live connection, so to sign out call `await client.close()` first.

## Examples

### Dynamic Client Registration

```ts
import { Client } from "@modelcontextprotocol/client";
import { browserAuth, fileStore } from "oauth-callback/mcp";
import { homedir } from "node:os";
import { join } from "node:path";

const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: fileStore(join(homedir(), ".config/acme/notion.json")),
});

const client = new Client({ name: "acme", version: "1.0.0" });
await auth.connect(client);
```

### Pre-registered client

```ts
const auth = browserAuth({
  serverUrl: "https://mcp.example.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientInformation: {
    client_id: process.env.MCP_CLIENT_ID!,
    client_secret: process.env.MCP_CLIENT_SECRET,
    issuer: "https://auth.example.com",
  },
  clientMetadata: { scope: "read write" },
});
```

### Step-up authorization

When the server answers a request with 403 `insufficient_scope`, the SDK starts a new authorization and the request fails with `UnauthorizedError`. `connect()` completes it on the same connection:

```ts
import { UnauthorizedError } from "@modelcontextprotocol/client";

try {
  await client.callTool(request);
} catch (error) {
  if (!(error instanceof UnauthorizedError)) throw error;
  await auth.connect(client); // completes the pending authorization
  await client.callTool(request);
}
```

### Custom transport

```ts
import {
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";

const serverUrl = new URL("https://mcp.example.com/mcp");
const transport = new StreamableHTTPClientTransport(serverUrl, {
  authProvider: auth,
});
try {
  await client.connect(transport);
} catch (error) {
  if (!(error instanceof UnauthorizedError)) throw error;
  try {
    await auth.completeAuthorization(transport);
  } finally {
    await transport.close(); // client.connect() won't close the old transport
  }
  await client.connect(
    new StreamableHTTPClientTransport(serverUrl, { authProvider: auth }),
  );
}
```

### Headless launch

```ts
const auth = browserAuth({
  serverUrl,
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  launch: (url) => console.log(`Open this URL to authorize:\n${url}`),
});
```

### Sign out

```ts
await client.close(); // clearing credentials doesn't close a live connection
await auth.invalidateCredentials("all");
```

## Behavior

- **One flow at a time.** A provider runs one interactive authorization at a time, from the SDK's `state()` call until the token exchange settles. Overlapping attempts fail fast and are never merged: with `UnauthorizedError` on transports `connect()` created (so `connect()` can complete the flow, then retry), with a plain `Error` on transports you created (only the transport that started a flow may complete it).
- **Timeout.** `timeout` bounds one authorization, including the token exchange. On transports created by `connect()`, a hung token endpoint is aborted too.
- **Client identity.** While a flow is active, registration can't replace the client. A stored DCR client registered for a different redirect URI is re-registered.
- **Callbacks.** Same validation, pages and security headers as [`getAuthCode()`](/core-concepts#state-and-callback-validation). Error callbacks go to the SDK, which checks `iss` before trusting them.
- **Storage.** Use one store per MCP server. See [CredentialStore](/api/credential-store).

## Related

- [CredentialStore](/api/credential-store)
- [Notion MCP example](/examples/notion)
- [Core Concepts: MCP authorization](/core-concepts#mcp-authorization)
