#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * OAuth flow with Notion MCP server using Dynamic Client Registration (RFC 7591).
 *
 * @requires Browser for OAuth consent flow
 * @requires Port 3000 available for callback server
 *
 * Usage:
 *   bun run example:notion
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import open from "open";
import { browserAuth, inMemoryStore } from "../src/mcp";

/**
 * Connect with OAuth retry handling.
 *
 * The MCP SDK's auth flow returns 'REDIRECT' after `redirectToAuthorization()`
 * completes, without re-checking for tokens. For in-process OAuth (CLI/desktop),
 * tokens ARE saved but the SDK doesn't know—causing an initial UnauthorizedError.
 * Retry succeeds because tokens exist.
 */
async function connectWithOAuthRetry(
  client: Client,
  serverUrl: URL,
  authProvider: OAuthClientProvider,
): Promise<void> {
  const createTransport = () =>
    new StreamableHTTPClientTransport(serverUrl, { authProvider });

  try {
    await client.connect(createTransport());
  } catch (error: unknown) {
    const isUnauthorized =
      error instanceof Error &&
      (error.constructor.name === "UnauthorizedError" ||
        error.message === "Unauthorized");

    if (isUnauthorized) {
      // Tokens were saved during first attempt; fresh transport succeeds
      await client.connect(createTransport());
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("🚀 Starting OAuth flow example with Notion MCP Server\n");
  console.log("This example demonstrates Dynamic Client Registration:");
  console.log("- No pre-configured client ID or secret required");
  console.log("- Automatic registration with the authorization server");
  console.log("- Integration with Model Context Protocol");
  console.log("- Using browserAuth provider from oauth-callback\n");

  const serverUrl = new URL("https://mcp.notion.com/mcp");

  const authProvider = browserAuth({
    port: 3000,
    scope: "read write",
    store: inMemoryStore(), // Ephemeral storage - tokens lost on restart
    launch: open, // Opens browser for OAuth consent
    onRequest(req) {
      const url = new URL(req.url);
      console.log(`📨 Received ${req.method} request to ${url.pathname}`);
    },
  });

  try {
    console.log("🔌 Connecting to Notion MCP server...");

    const client = new Client(
      { name: "oauth-callback-example", version: "1.0.0" },
      { capabilities: {} },
    );

    await connectWithOAuthRetry(client, serverUrl, authProvider);

    console.log("\n🎉 Successfully connected to Notion MCP server!");
    await listServerCapabilities(client);
    await client.close();

    console.log("\n✨ OAuth flow completed successfully!");
    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error("\n❌ Failed to authenticate:", error.message);
    } else {
      console.error("\n❌ Unexpected error:", error);
    }
    process.exit(1);
  }
}

async function listServerCapabilities(client: Client) {
  console.log("\n🔧 Fetching available tools...");
  const tools = await client.listTools();

  if (tools.tools && tools.tools.length > 0) {
    console.log("\n📝 Available tools:");
    for (const tool of tools.tools) {
      const desc = tool.description?.substring(0, 50).replace(/\n/g, " ");
      console.log(`   - ${tool.name}: ${desc}`);
    }
  } else {
    console.log("   No tools available");
  }

  console.log("\n📚 Fetching available resources...");
  const resources = await client.listResources();

  if (resources.resources && resources.resources.length > 0) {
    console.log("\n📂 Available resources:");
    for (const resource of resources.resources) {
      console.log(`   - ${resource.uri}: ${resource.name}`);
    }
  } else {
    console.log("   No resources available");
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
