#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Notion's hosted MCP server: Dynamic Client Registration, browser consent, and
 * credentials persisted between runs (run it twice: the second run skips the browser).
 *
 *   bun run example:notion
 */

import { Client } from "@modelcontextprotocol/client";
import { homedir } from "node:os";
import { join } from "node:path";
import { browserAuth, fileStore } from "../src/mcp/index";

const auth = browserAuth({
  serverUrl: "https://mcp.notion.com/mcp",
  redirectUri: "http://127.0.0.1:8765/callback",
  clientName: "oauth-callback example",
  store: fileStore(
    join(homedir(), ".config/oauth-callback-example/notion.json"),
  ),
});

const client = new Client({ name: "oauth-callback-example", version: "1.0.0" });
await auth.connect(client);

const { tools } = await client.listTools();
console.log(`Connected. ${tools.length} tools:`);
for (const tool of tools) console.log(`  - ${tool.name}`);
await client.close();
