---
title: Getting Started
description: Add a browser OAuth 2.0 sign-in to a CLI tool, desktop app or MCP client with oauth-callback.
---

# Getting Started {#top}

## Prerequisites

- Node.js 22+, Deno 2 or Bun 1.2+
- An OAuth client registered with your provider (or an MCP server that supports Dynamic Client Registration)

## Installation

::: code-group

```bash [Bun]
bun add oauth-callback
```

```bash [npm]
npm install oauth-callback
```

```bash [pnpm]
pnpm add oauth-callback
```

```bash [Deno]
deno add npm:oauth-callback
```

:::

For MCP, also install the SDK client: `@modelcontextprotocol/client` 2.1+.

On Deno, grant `--allow-net` (listener), `--allow-run` (default browser launcher) and `--allow-read`/`--allow-write` if you use `fileStore`.

## Sign in with GitHub

### 1. Register the redirect URI

Create an OAuth App at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL `http://127.0.0.1/callback`. GitHub, like many providers, accepts any port on a loopback redirect URI ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)), so the library can use a free port.

::: tip Fixed ports
If your provider requires an exact match, register e.g. `http://127.0.0.1:8765/callback` and pass the same value as the `redirectUri` option.
:::

### 2. Capture the code

```ts
import { getAuthCode } from "oauth-callback";

const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("scope", "read:user");
  return url; // redirect_uri and state are appended
});
```

`getAuthCode()` binds `http://127.0.0.1:<free port>/callback`, calls your builder with that redirect URI and a fresh `state`, opens the system browser, and resolves once a callback with the right `state` arrives. The listener is always closed afterwards.

### 3. Exchange the code

Send `redirectUri` verbatim in the token request: with a builder it is exactly the value the authorization request carried.

```ts
const response = await fetch("https://github.com/login/oauth/access_token", {
  method: "POST",
  headers: { Accept: "application/json" },
  body: new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    client_secret: process.env.GITHUB_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
  }),
});
const { access_token } = await response.json();
```

### 4. Use the token

```ts
const user = await fetch("https://api.github.com/user", {
  headers: { Authorization: `Bearer ${access_token}` },
}).then((res) => res.json());

console.log(`Signed in as ${user.login}`);
```

## PKCE

Public clients (no client secret) should use [PKCE](https://www.rfc-editor.org/rfc/rfc7636.html). Add the challenge in the builder and the verifier in the token request:

```ts
import { createHash, randomBytes } from "node:crypto";

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://auth.example.com/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
});

// token request: grant_type=authorization_code, code, redirect_uri, code_verifier=verifier
```

## Options

```ts
await getAuthCode(build, {
  redirectUri: "http://127.0.0.1:8765/callback", // default http://127.0.0.1:0/callback
  launch: (url) => console.log(`Open ${url}`), // default: system browser
  timeout: 120_000, // ms, default 300_000
  signal: controller.signal,
  successHtml: "<h1>Done. Back to the terminal.</h1>",
  errorHtml: "<h1>Authorization failed</h1>",
});
```

- **Headless or SSH:** a `launch` that prints the URL. The user opens it in a browser on the same machine (the redirect goes to its loopback interface).
- **Cancellation:** pass an `AbortSignal`; the flow rejects with `signal.reason`.
- **Pages:** `successHtml`/`errorHtml` are static HTML served as-is. Callback data is never rendered.

See [getAuthCode](/api/get-auth-code) for every option.

## Error handling

```ts
import { getAuthCode, OAuthCallbackError } from "oauth-callback";

try {
  const { code } = await getAuthCode(build);
} catch (error) {
  if (error instanceof OAuthCallbackError) {
    console.error(`Authorization failed: ${error.error}`); // e.g. "access_denied"
  } else if (error instanceof DOMException && error.name === "TimeoutError") {
    console.error("No response within 5 minutes");
  } else {
    throw error;
  }
}
```

Invalid options and unsafe authorization URLs throw `TypeError`/`RangeError` before anything binds or opens. See [OAuthCallbackError](/api/oauth-callback-error).

## MCP servers

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
await auth.connect(client); // opens the browser if needed; resolves once connected

const { tools } = await client.listTools();
```

The MCP SDK handles discovery, client registration, PKCE, token exchange and refresh. The second run reuses stored credentials without opening the browser. See [browserAuth](/api/browser-auth) and [CredentialStore](/api/credential-store).

## Try the examples

```bash
git clone https://github.com/kriasoft/oauth-callback.git
cd oauth-callback && bun install

bun run example:demo     # mock authorization server, no credentials needed
bun run example:github   # GitHub OAuth App (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
bun run example:notion   # Notion MCP server with dynamic client registration
```

## Troubleshooting

**`redirect_uri` mismatch at the provider.** The registered redirect URI must match what the library sends. Register `http://127.0.0.1/callback` if the provider ignores loopback ports, or pass the exact registered value as `redirectUri`. The library never generates `localhost`; pass it explicitly if that is what you registered.

**`EADDRINUSE`.** The fixed port in `redirectUri` is taken. Use the default ephemeral port where the provider allows it, or pick another port.

**The flow times out.** Nothing delivered a callback with the right `state` in time. Check that the browser reached the redirect URI and that the provider returns the `state` it received.

**`TypeError: Invalid authorization URL`.** The URL must be `https:` (or loopback `http:`), without fragment or credentials, with `response_type=code` and `response_mode` absent or `query`.

## Next steps

- [Core Concepts](/core-concepts)
- [API Reference](/api/)
- [Notion MCP example](/examples/notion)
