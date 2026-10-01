# OAuth Callback

<a href="https://www.npmjs.com/package/oauth-callback"><img src="https://img.shields.io/npm/v/oauth-callback?label=npm" height="20"></a>
<a href="https://www.npmjs.com/package/oauth-callback"><img src="https://img.shields.io/npm/dm/oauth-callback" height="20"></a>
<a href="https://kriasoft.com/oauth-callback/"><img src="https://img.shields.io/badge/Docs-007ec6" height="20"></a>
<a href="https://github.com/sponsors/koistya"><img src="https://img.shields.io/badge/-GitHub-%23555.svg?logo=github-sponsors" height="20"></a>
<a href="https://discord.gg/bSsv7XM"><img src="https://img.shields.io/discord/643523529131950086?label=Chat" height="20"></a>
<a href="https://github.com/kriasoft/oauth-callback/stargazers"><img src="https://img.shields.io/github/stars/kriasoft/oauth-callback.svg?style=social&label=Star&maxAge=3600" height="20"></a>
<a href="https://x.com/koistya"><img src="https://img.shields.io/badge/Follow-%40koistya-black?logo=x&style=social" height="20"></a>

Turn a browser authorization into a validated OAuth 2.0 authorization code on a loopback redirect URI, in Node.js, Deno and Bun. For CLI tools and desktop apps, with a one-line browser authorization provider for the MCP SDK.

<div align="center">
  <img src="https://raw.githubusercontent.com/kriasoft/oauth-callback/main/examples/notion.gif" alt="OAuth Callback Demo" width="100%" style="max-width: 800px; height: auto;">
</div>

## Features

- 🚀 **Node.js 22+, Deno 2 and Bun** — one `node:http` listener everywhere
- 🔌 **Ephemeral loopback ports** (RFC 8252) — the default for `getAuthCode()`: no port collisions, no port config
- 🛡️ **Secure by default** — `state` on every flow, strict callback and URL validation, neutral pages with security headers
- 🤖 **MCP SDK integration** — `browserAuth().connect(client)` handles the whole browser flow
- ⚡ **Zero runtime dependencies** — the browser launcher is bundled and loaded lazily
- 🎯 **Small, typed API** — one function, one error class

## Installation

```bash
bun add oauth-callback   # or: npm install oauth-callback

# for oauth-callback/mcp, also the MCP SDK (optional peer dependency)
bun add @modelcontextprotocol/client
```

## Quick Start

```ts
import { getAuthCode } from "oauth-callback";

const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  return url; // redirect_uri and state are appended
});

await exchangeCode({ code, redirectUri }); // your token request
```

`getAuthCode()` binds `http://127.0.0.1:<free port>/callback`, calls your builder with that redirect URI and a fresh `state`, opens the system browser, and resolves with the code once a callback with the right `state` arrives. The listener is always closed afterwards.

## Usage

### Builder or prebuilt URL

```ts
// Builder (recommended): the library picks the port and the state
await getAuthCode(({ redirectUri, state, signal }) =>
  buildUrl(redirectUri, state),
);

// Prebuilt URL: listens on its redirect_uri, appends state if missing
await getAuthCode(
  "https://auth.example.com/authorize?client_id=app&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2Fcallback",
);

// Prebuilt URL without redirect_uri (the provider uses its registered one)
await getAuthCode(authUrl, { redirectUri: "http://127.0.0.1:8765/callback" });
```

Use the builder for PAR/JAR: put the provided `redirectUri` and `state` into the pushed request and return the short URL. `signal` aborts with the flow, so pass it to `fetch`.

```ts
const { code, redirectUri } = await getAuthCode(
  async ({ redirectUri, state, signal }) => {
    const res = await fetch(PAR_ENDPOINT, {
      method: "POST",
      body: new URLSearchParams({
        client_id,
        response_type: "code",
        redirect_uri: redirectUri,
        state,
        code_challenge,
        code_challenge_method: "S256",
      }),
      signal,
    });
    const { request_uri } = await res.json();
    return `${AUTHORIZE}?client_id=${client_id}&request_uri=${encodeURIComponent(request_uri)}`;
  },
);
```

### Options

```ts
await getAuthCode(build, {
  redirectUri: "http://127.0.0.1:8765/callback", // default http://127.0.0.1:0/callback (port 0 = free port)
  launch: (url) => console.log(`Open ${url}`), // default: system browser
  timeout: 120_000, // ms, default 300_000
  signal: controller.signal,
  successHtml: "<h1>Done — back to the terminal</h1>",
  errorHtml: "<h1>Authorization failed</h1>",
});
```

- **`launch`** receives the final URL. Use it for headless/SSH sessions, QR codes, webviews or tests. Its return value is ignored; if it throws or rejects, the flow fails with that error.
- **`redirectUri`** must be `http:` on `127.0.0.1`, `[::1]` or `localhost`, without `state`, `code`, `error*` or `iss` in its query. The result's `redirectUri` is the exact string, never re-serialized (with a builder, the one the builder got): when the authorization request carried `redirect_uri`, pass it verbatim to your token request.
- **Pages** never show callback data. `successHtml`/`errorHtml` are served as-is.

### Errors

```ts
import { getAuthCode, OAuthCallbackError } from "oauth-callback";

try {
  const { code } = await getAuthCode(build, { signal });
} catch (error) {
  if (error instanceof OAuthCallbackError) {
    error.error; // e.g. "access_denied"
    error.description; // provider text, untrusted
    error.message; // Authorization failed: "access_denied" (safe to log)
  } else if (error instanceof DOMException && error.name === "TimeoutError") {
    // no callback within `timeout`
  } else if (signal.aborted) {
    // cancelled: `error` is signal.reason
  }
}
```

Invalid options and unsafe or unusable authorization URLs (`javascript:`, remote `http:`, `response_type` other than `code`, `response_mode` other than `query`, both `request` and `request_uri`, …) throw `TypeError`/`RangeError` before the browser opens (options and prebuilt URLs before anything binds).

## MCP SDK

```ts
import { Client, UnauthorizedError } from "@modelcontextprotocol/client";
import { homedir } from "node:os";
import { join } from "node:path";
import { browserAuth, fileStore } from "oauth-callback/mcp";

const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "Acme CLI",
  store: fileStore(join(homedir(), ".config/acme/notion.json")),
});

const client = new Client({ name: "acme", version: "1.0.0" });
await auth.connect(client); // opens the browser if needed; resolves once connected
```

The MCP SDK does the OAuth work (discovery, dynamic client registration, PKCE, token exchange, refresh, issuer checks). `browserAuth()` adds the browser, the loopback listener and credential storage. A second run reuses stored tokens without opening the browser.

**Step-up** (the server asks for more scope mid-session):

```ts
try {
  await client.callTool(request);
} catch (error) {
  if (!(error instanceof UnauthorizedError)) throw error;
  await auth.connect(client); // completes the pending authorization
  await client.callTool(request);
}
```

**Options:** `serverUrl`, `redirectUri` (fixed port; DCR registers it; give providers that may authorize at the same time their own port), either `clientName` (for DCR, optionally with a CIMD `clientMetadataUrl`) or `clientInformation` (pre-registered client with its `issuer`), `clientMetadata` (e.g. `{ scope }`), `store` (default: memory), `launch`, `timeout`, `successHtml`, `errorHtml`.

**Custom transports:** pass `auth` as the transport's `authProvider`; on `UnauthorizedError`, call `await auth.completeAuthorization(transport)`, close that transport, and reconnect with a new one. Only the transport that started a flow gets `UnauthorizedError`; another one gets `An MCP authorization is already in progress`. Always call `completeAuthorization()` after that `UnauthorizedError`: the flow stays pending until it does, even if it failed. Run OAuth work on caller-created transports one attempt at a time; `connect()` handles concurrency for you.

**Storage:** a `CredentialStore` is two methods over an opaque string, so a keychain store is four lines:

```ts
const store: CredentialStore = {
  load: () => keychain.get(name),
  save: (v) =>
    v === undefined ? keychain.delete(name) : keychain.set(name, v),
};
```

Use one store per MCP server. To sign out, close the client, then clear the credentials: `await client.close(); await auth.invalidateCredentials("all")`.

## Security

- Every flow has a `state`; only a callback with exactly that `state` and an unambiguous `code` or `error` completes it. Anything else is refused (400, or 404/405 for a wrong path or method) and the flow keeps waiting.
- The listener binds loopback only and closes when the flow ends.
- Callback pages never render callback data and send `Content-Security-Policy`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.
- `error_description` and `error_uri` are provider text: treat them as untrusted. `OAuthCallbackError.message` carries only the escaped `error` code. In `/mcp`, the SDK checks `iss` before trusting error callbacks.
- `fileStore()` writes atomically with owner-only permissions (0600) on POSIX. For production, prefer the OS keychain.

## Runtimes

- **Node.js** 22+
- **Bun** 1.2+
- **Deno** 2: `--allow-net` (listener), `--allow-run` and `--allow-env` (default launcher), `--allow-read`/`--allow-write` (`fileStore`)

These cover `getAuthCode()` and `fileStore()`, which CI smoke-tests on each minimum version. `browserAuth()` additionally depends on the runtime support of `@modelcontextprotocol/client`.

## Examples

```bash
bun run example:demo     # mock authorization server, no credentials needed
bun run example:github   # GitHub OAuth App (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
bun run example:notion   # Notion MCP server with dynamic client registration
```

## Upgrading from v2

See the [migration guide](docs/migration-v3.md).

## Development

```bash
bun install
bun run test            # unit + MCP e2e tests
bun run test:runtimes   # smoke test of the build on Node, Deno and Bun
bun run build
bun run docs:dev
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup instructions.

**Maintainers wanted** — we're looking for people to help maintain this project. If interested, reach out on [Discord](https://discord.gg/bSsv7XM) or open an issue.

## License

This project is released under the MIT License. Feel free to use it in your projects, modify it to suit your needs, and share it with others. We believe in open source and hope this tool makes OAuth integration easier for everyone!

## Related Projects

- [**MCP Client Generator**](https://github.com/kriasoft/mcp-client-gen) - Generate TypeScript clients from MCP server specifications. Perfect companion for building MCP-enabled applications with OAuth support ([npm](https://www.npmjs.com/package/mcp-client-gen)).
- [**React Starter Kit**](https://github.com/kriasoft/react-starter-kit) - Full-stack React application template with authentication, including OAuth integration examples.

## Backers

Support this project by becoming a backer. Your logo will show up here with a link to your website.

<a href="https://reactstarter.com/b/1"><img src="https://reactstarter.com/b/1.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/2"><img src="https://reactstarter.com/b/2.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/3"><img src="https://reactstarter.com/b/3.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/4"><img src="https://reactstarter.com/b/4.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/5"><img src="https://reactstarter.com/b/5.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/6"><img src="https://reactstarter.com/b/6.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/7"><img src="https://reactstarter.com/b/7.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/8"><img src="https://reactstarter.com/b/8.png" height="60" /></a>

## Support

Found a bug or have a question? Please open an issue on the [GitHub issue tracker](https://github.com/kriasoft/oauth-callback/issues) and we'll be happy to help. If this project saves you time and you'd like to support its continued development, consider [becoming a sponsor](https://github.com/sponsors/koistya). Every bit of support helps maintain and improve this tool for the community. Thank you!
