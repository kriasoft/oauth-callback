---
title: Linear MCP Example
description: Connect to Linear's MCP server with browserAuth() to automate issues and projects from a CLI.
---

# Linear MCP Example

Connect to [Linear's MCP server](https://linear.app/docs/mcp) to work with issues, projects and comments from a CLI or agent. Linear supports Dynamic Client Registration, so `browserAuth()` needs only a client name.

## Prerequisites

- Node.js 22+, Deno 2 or Bun 1.2+
- A Linear workspace
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
  serverUrl: "https://mcp.linear.app/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "My Linear CLI",
  store: fileStore(join(homedir(), ".config/my-linear-cli/linear.json")),
});

const client = new Client({ name: "my-linear-cli", version: "1.0.0" });
await auth.connect(client);

const { tools } = await client.listTools();
for (const tool of tools) console.log(`${tool.name}: ${tool.description}`);

await client.close();
```

The first run opens Linear's consent page; later runs reuse the stored credentials.

## Calling tools

Tool names and input schemas come from the server and can change; `listTools()` returns the current ones. For example:

```ts
const { tools } = await client.listTools();
const listIssues = tools.find((tool) => tool.name === "list_issues");
console.log(listIssues?.inputSchema);

const result = await client.callTool({
  name: "list_issues",
  arguments: { assignee: "me", limit: 10 },
});
console.log(result.content);
```

## Handling step-up

If a tool needs more scope than the current token grants, the server answers 403 `insufficient_scope`, the SDK starts a new authorization and the call fails with `UnauthorizedError`. `connect()` completes it on the existing connection:

```ts
import { UnauthorizedError } from "@modelcontextprotocol/client";

async function callTool(name: string, args: Record<string, unknown>) {
  try {
    return await client.callTool({ name, arguments: args });
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
    await auth.connect(client); // opens the browser, then returns
    return await client.callTool({ name, arguments: args });
  }
}
```

## Storing credentials in the keychain

For a tool you ship to users, keep credentials in the OS keychain instead of a file:

```ts
import { Entry } from "@napi-rs/keyring";
import type { CredentialStore } from "oauth-callback/mcp";

const entry = new Entry("my-linear-cli", "linear-mcp");
const store: CredentialStore = {
  load: async () => entry.getPassword() ?? undefined,
  save: async (value) => {
    if (value === undefined) entry.deletePassword();
    else entry.setPassword(value);
  },
};

const auth = browserAuth({
  serverUrl: "https://mcp.linear.app/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "My Linear CLI",
  store,
});
```

## Cancellation

`connect()` accepts the SDK's connect options, including a `signal`:

```ts
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

await auth.connect(client, { signal: controller.signal });
```

Each authorization is also bounded by `timeout` (5 minutes by default).

## Troubleshooting

**`An MCP authorization is already in progress`.** A provider runs one browser authorization at a time. `connect()` calls on one provider queue up, but a transport you created with the same provider may hold the pending flow: finish it with `auth.completeAuthorization(transport)` first.

**`client is connected over a transport browserAuth didn't create`.** Use `auth.connect(client)` on a fresh client, or `auth.completeAuthorization(transport)` for your own transport. See [browserAuth](/api/browser-auth#custom-transport).

**Stale credentials.** `await auth.invalidateCredentials("all")` clears the store; the next `connect()` authorizes again.

## Related

- [browserAuth](/api/browser-auth)
- [CredentialStore](/api/credential-store)
- [Notion MCP example](/examples/notion)
