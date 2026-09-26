---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "OAuth flow for your CLI or desktop app"
  text: ""
  tagline: "Capture an authorization code on a loopback redirect URI in Node.js, Deno and Bun, with a one-line browser provider for the MCP SDK"
  image:
    src: https://raw.githubusercontent.com/kriasoft/oauth-callback/main/examples/notion.gif
    alt: OAuth Callback Demo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Migrate from v2
      link: /migration-v3
    - theme: alt
      text: View on GitHub
      link: https://github.com/kriasoft/oauth-callback

features:
  - icon: 🚀
    title: Node.js, Deno and Bun
    details: One node:http listener on Node.js 22+, Deno 2 and Bun 1.2+.
  - icon: 🔌
    title: Ephemeral loopback ports
    details: Binds 127.0.0.1 on a free port (RFC 8252) and hands you the redirect URI. No port collisions, no port config.
  - icon: 🛡️
    title: Secure by default
    details: A state on every flow, strict callback and URL validation, neutral pages with security headers.
  - icon: 🤖
    title: MCP SDK integration
    details: browserAuth().connect(client) runs the whole browser flow; the MCP SDK does discovery, DCR, PKCE, exchange and refresh.
  - icon: ⚡
    title: Zero runtime dependencies
    details: The browser launcher is bundled and loaded lazily, only when it is used.
  - icon: 🎯
    title: Small, typed API
    details: One function, one error class, and a two-method credential store.
---

## Quick Start

::: code-group

```ts [getAuthCode]
import { getAuthCode } from "oauth-callback";

const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  return url; // redirect_uri and state are appended
});

await exchangeCode({ code, redirectUri }); // your token request
```

```ts [MCP SDK]
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
await auth.connect(client); // opens the browser if needed
```

```bash [Installation]
bun add oauth-callback
# or
npm install oauth-callback
```

:::

<div style="margin-top: 2rem; text-align: center;">
  <a href="https://www.npmjs.com/package/oauth-callback" target="_blank">
    <img src="https://img.shields.io/npm/v/oauth-callback.svg" alt="npm version" style="display: inline-block; margin: 0 0.5rem;">
  </a>
  <a href="https://www.npmjs.com/package/oauth-callback" target="_blank">
    <img src="https://img.shields.io/npm/dm/oauth-callback.svg" alt="npm downloads" style="display: inline-block; margin: 0 0.5rem;">
  </a>
  <a href="https://github.com/kriasoft/oauth-callback/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" style="display: inline-block; margin: 0 0.5rem;">
  </a>
</div>
