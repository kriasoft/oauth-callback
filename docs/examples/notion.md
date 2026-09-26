---
title: Notion MCP Example
description: Connect to Notion's hosted MCP server with browserAuth() and Dynamic Client Registration, no pre-registered OAuth app required.
---

# Notion MCP Example

Connect to [Notion's hosted MCP server](https://developers.notion.com/docs/mcp) from a script or CLI. Notion supports Dynamic Client Registration, so there is no OAuth app to create: the MCP SDK registers a client on first run, and `browserAuth()` opens the browser for consent and stores the credentials.

## Prerequisites

- Node.js 22+, Deno 2 or Bun 1.2+
- A Notion account
- A free local port for the redirect URI (the example uses `8765`)

## Installation

::: code-group

```bash [Bun]
bun add oauth-callback @modelcontextprotocol/client
```

```bash [npm]
npm install oauth-callback @modelcontextprotocol/client
```

```bash [pnpm]
pnpm add oauth-callback @modelcontextprotocol/client
```

:::

## Code

```ts
import { Client } from "@modelcontextprotocol/client";
import { browserAuth, fileStore } from "oauth-callback/mcp";
import { homedir } from "node:os";
import { join } from "node:path";

const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "My Notion CLI",
  store: fileStore(join(homedir(), ".config/my-notion-cli/notion.json")),
});

const client = new Client({ name: "my-notion-cli", version: "1.0.0" });
await auth.connect(client);

const { tools } = await client.listTools();
console.log(`Connected. ${tools.length} tools:`);
for (const tool of tools) console.log(`  - ${tool.name}`);

await client.close();
```

Run it twice: the first run opens the browser, the second reuses the stored credentials.

To run the version in the repository:

```bash
git clone https://github.com/kriasoft/oauth-callback.git
cd oauth-callback && bun install
bun run example:notion
```

## How it works

1. `connect()` creates a Streamable HTTP transport and connects `client`.
2. Notion answers 401. The MCP SDK discovers the authorization server, registers a client with `redirect_uris: ["http://127.0.0.1:8765/callback"]`, and builds an authorization URL with PKCE.
3. `browserAuth()` binds `127.0.0.1:8765`, opens the browser, and waits for the callback with the matching `state`.
4. The SDK exchanges the code on the same transport; the client and tokens are saved to the store.
5. `connect()` reconnects with the new tokens and resolves.

Later runs load the stored client and tokens; the SDK refreshes expired tokens when it can, and the browser opens only when a new authorization is required.

## Calling tools

Tool names and arguments come from the server; discover them with `listTools()`:

```ts
const { tools } = await client.listTools();
const search = tools.find((tool) => tool.name.includes("search"));

if (search) {
  const result = await client.callTool({
    name: search.name,
    arguments: { query: "meeting notes" },
  });
  console.log(result.content);
}
```

If a call fails with `UnauthorizedError` because the server needs more scope, call `await auth.connect(client)` and retry. See [step-up authorization](/api/browser-auth#step-up-authorization).

## Variations

**Ephemeral credentials.** Omit `store` to keep credentials in memory; every run authorizes again.

**Headless.** Print the URL instead of opening a browser:

```ts
const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "My Notion CLI",
  launch: (url) => console.log(`Open to authorize:\n${url}`),
});
```

**Sign out.** `await auth.invalidateCredentials("all")` clears the store.

## Troubleshooting

**`EADDRINUSE`.** Port 8765 is taken. Pick another port; a stored client registered for the old redirect URI is re-registered automatically.

**`Stored MCP credentials belong to …`.** The store holds another server's credentials. Use one store per MCP server.

**Browser doesn't open.** Pass a `launch` that prints the URL, and open it on the same machine.

## Security

- The credential file is created with mode `0600`; keep it out of version control. For production apps, prefer the OS keychain via a custom [CredentialStore](/api/credential-store#keychain-example).
- The callback page never shows callback data and forbids scripts.

## Related

- [browserAuth](/api/browser-auth)
- [CredentialStore](/api/credential-store)
- [Linear MCP example](/examples/linear)
