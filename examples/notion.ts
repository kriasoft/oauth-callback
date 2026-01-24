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
import open from "open";
import { browserAuth, inMemoryStore } from "../src/mcp";

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
  }) as any; // Cast required: getPendingAuthCode() is SDK workaround, not public API

  try {
    console.log("🔌 Connecting to Notion MCP server...");

    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider,
    });

    const client = new Client(
      {
        name: "oauth-callback-example",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Initial connect triggers OAuth flow when no valid tokens exist
    try {
      await client.connect(transport);
      console.log("\n🎉 Successfully connected with existing credentials!");

      await listServerCapabilities(client);
      await client.close();
    } catch (error: any) {
      if (error.constructor.name === "UnauthorizedError") {
        console.log("\n📋 Authorization required. Opening browser...");
        console.log(
          "   (If browser doesn't open, check the terminal for the URL)\n",
        );

        // SDK workaround: retrieve auth code captured during redirectToAuthorization()
        const pendingAuth = authProvider.getPendingAuthCode();

        if (pendingAuth?.code) {
          console.log("\n✅ Authorization callback received!");
          console.log("   Code:", pendingAuth.code);
          console.log("   State:", pendingAuth.state);

          console.log("\n🔄 Exchanging authorization code for access token...");

          await transport.finishAuth(pendingAuth.code);

          console.log("\n✅ Token exchange successful!");
          console.log("\n🔌 Creating new connection with authentication...");

          // SDK constraint: transport cannot be reused after finishAuth()
          const newTransport = new StreamableHTTPClientTransport(serverUrl, {
            authProvider,
          });
          const newClient = new Client(
            {
              name: "oauth-callback-example",
              version: "1.0.0",
            },
            {
              capabilities: {},
            },
          );

          await newClient.connect(newTransport);
          console.log(
            "\n🎉 Successfully authenticated with Notion MCP server!",
          );

          await listServerCapabilities(newClient);
          await newClient.close();
        } else {
          throw new Error("Failed to get authorization code");
        }
      } else {
        throw error;
      }
    }

    console.log("\n✨ OAuth flow completed successfully!");
    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("401")
      ) {
        console.log(
          "\n⚠️  Authorization required. Please check the browser for the authorization page.",
        );
      } else {
        console.error("\n❌ Failed to authenticate:", error.message);
      }
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
