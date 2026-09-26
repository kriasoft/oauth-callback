---
title: API Reference
description: API reference for the oauth-callback library and its MCP SDK integration.
---

# API Reference

The package has two entry points.

## `oauth-callback`

```ts
import { getAuthCode, OAuthCallbackError } from "oauth-callback";
import type {
  AuthorizationCodeResult,
  AuthorizationUrlBuilder,
  GetAuthCodeOptions,
} from "oauth-callback";
```

| Export                                            | Description                                           |
| ------------------------------------------------- | ----------------------------------------------------- |
| [`getAuthCode()`](/api/get-auth-code)             | Captures an authorization code on a loopback redirect |
| [`OAuthCallbackError`](/api/oauth-callback-error) | The authorization server returned an OAuth error      |
| [Types](/api/types)                               | Options, builder and result types                     |

```ts
const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  return url;
});
```

## `oauth-callback/mcp`

Requires `@modelcontextprotocol/client` 2.1+ (an optional peer dependency).

```ts
import { browserAuth, fileStore } from "oauth-callback/mcp";
import type {
  BrowserAuth,
  BrowserAuthOptions,
  CredentialStore,
} from "oauth-callback/mcp";
```

| Export                                           | Description                                          |
| ------------------------------------------------ | ---------------------------------------------------- |
| [`browserAuth()`](/api/browser-auth)             | MCP SDK `OAuthClientProvider` with `connect(client)` |
| [`CredentialStore`](/api/credential-store)       | Two-method persistence interface for MCP credentials |
| [`fileStore()`](/api/credential-store#filestore) | File-backed `CredentialStore`                        |

```ts
const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
});
await auth.connect(client);
```

SDK types (`Client`, `OAuthClientProvider`, `OAuthClientMetadata`, `UnauthorizedError`, …) come from `@modelcontextprotocol/client`, not from this package.

## Errors at a glance

| Error                               | When                                                |
| ----------------------------------- | --------------------------------------------------- |
| `OAuthCallbackError`                | The callback carried `error` (e.g. `access_denied`) |
| `DOMException` named `TimeoutError` | No valid callback within `timeout`                  |
| `signal.reason`                     | Your `AbortSignal` aborted                          |
| `TypeError` / `RangeError`          | Invalid option, redirect URI or authorization URL   |
| Launcher's error                    | Your `launch` threw or rejected                     |
| Listener error (e.g. `EADDRINUSE`)  | The fixed port is taken                             |

## Runtimes

Node.js 22+, Deno 2 and Bun 1.2+. Zero runtime dependencies. `oauth-callback/mcp` additionally depends on the runtime support of `@modelcontextprotocol/client`.
