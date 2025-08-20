---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "OAuth flow for your CLI or Node.js app"
  text: ""
  tagline: "Lightweight, cross-runtime, with native MCP SDK integration for AI agents"
  image:
    src: https://raw.githubusercontent.com/kriasoft/oauth-callback/main/examples/notion.gif
    alt: OAuth Callback Demo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/kriasoft/oauth-callback

features:
  - icon: 🚀
    title: Multi-Runtime Support
    details: Works seamlessly across Node.js 18+, Deno, and Bun. Write once, run anywhere with modern Web Standards APIs.
  - icon: 🤖
    title: MCP SDK Integration
    details: Built-in OAuth provider for Model Context Protocol. Enable AI agents with secure authentication using browserAuth().
  - icon: ⚡
    title: Zero Configuration
    details: Automatic localhost server setup, browser launching, and cleanup. Just pass your OAuth URL and get the auth code.
  - icon: 📘
    title: TypeScript First
    details: Full TypeScript support with comprehensive types. Get IntelliSense and type safety throughout your OAuth flows.
  - icon: 💾
    title: Flexible Token Storage
    details: Choose between ephemeral in-memory storage or persistent file-based tokens. Perfect for both CLI tools and long-running apps.
  - icon: 🛡️
    title: Production Ready
    details: Battle-tested error handling with OAuthError class, customizable templates, and timeout protection. Handle real-world OAuth scenarios.
---

## Quick Start

::: code-group

```typescript [Basic Usage]
import { getAuthCode } from "oauth-callback";

// Just pass your OAuth URL - that's it!
const result = await getAuthCode(
  "https://github.com/login/oauth/authorize?client_id=xxx",
);

console.log("Auth code:", result.code);
```

```typescript [MCP Integration]
import { browserAuth, inMemoryStore } from "oauth-callback/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// OAuth provider for Notion MCP server
// See: https://developers.notion.com/docs/get-started-with-mcp
const authProvider = browserAuth({
  store: inMemoryStore(), // Ephemeral tokens (lost on restart)
});

// Connect to Notion's MCP server with OAuth
const transport = new StreamableHTTPClientTransport(
  new URL("https://mcp.notion.com/mcp"),
  { authProvider },
);

const client = new Client(
  { name: "my-app", version: "1.0.0" },
  { capabilities: {} },
);

await client.connect(transport);
// Now you can use Notion's MCP tools!
```

```bash [Installation]
# Using Bun (recommended)
bun add oauth-callback

# Using npm
npm install oauth-callback

# Using pnpm
pnpm add oauth-callback
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
