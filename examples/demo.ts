#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Self-contained OAuth demo with built-in mock authorization server
 *
 * No external setup required - just run: bun run example-demo.ts
 *
 * This example demonstrates the OAuth flow without needing real credentials
 * or external OAuth providers. Perfect for testing and learning.
 */

import { getAuthCode, OAuthError } from "../src/index";
import type { Server } from "bun";

// Mock OAuth Server Implementation
class MockOAuthServer {
  private server: Server | null = null;
  private registeredClients = new Map<string, any>();
  private authorizationCodes = new Map<string, any>();

  async start(port: number = 8080) {
    this.server = Bun.serve({
      port,
      fetch: (req) => this.handleRequest(req),
    });
    console.log(`🎭 Mock OAuth server running on http://localhost:${port}`);
  }

  stop() {
    this.server?.stop();
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Dynamic Client Registration endpoint
    if (url.pathname === "/register" && req.method === "POST") {
      return await this.handleClientRegistration(req);
    }

    // Authorization endpoint
    if (url.pathname === "/authorize") {
      return this.handleAuthorization(url);
    }

    // Token endpoint
    if (url.pathname === "/token" && req.method === "POST") {
      return await this.handleTokenExchange(req);
    }

    // User info endpoint
    if (url.pathname === "/userinfo") {
      return this.handleUserInfo(req);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleClientRegistration(req: Request): Promise<Response> {
    const data = await req.json();
    const clientId = `client_${crypto.randomUUID().slice(0, 8)}`;
    const clientSecret = `secret_${crypto.randomUUID().slice(0, 16)}`;

    this.registeredClients.set(clientId, {
      ...data,
      client_id: clientId,
      client_secret: clientSecret,
      created_at: Date.now(),
    });

    return new Response(
      JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: data.redirect_uris,
        client_name: data.client_name,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  private handleAuthorization(url: URL): Response {
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const responseType = url.searchParams.get("response_type");
    const scenario = url.searchParams.get("scenario");

    if (!redirectUri || responseType !== "code") {
      return new Response("Invalid request", { status: 400 });
    }

    const callbackUrl = new URL(redirectUri);

    // Simulate different scenarios
    if (scenario === "error") {
      callbackUrl.searchParams.set("error", "access_denied");
      callbackUrl.searchParams.set(
        "error_description",
        "User denied the authorization request",
      );
      if (state) callbackUrl.searchParams.set("state", state);
    } else if (scenario === "invalid_scope") {
      callbackUrl.searchParams.set("error", "invalid_request");
      callbackUrl.searchParams.set(
        "error_description",
        "The request is missing a required parameter or includes an invalid parameter value",
      );
      callbackUrl.searchParams.set(
        "error_uri",
        "https://example.com/docs/errors#invalid_request",
      );
      if (state) callbackUrl.searchParams.set("state", state);
    } else if (scenario === "server_error") {
      callbackUrl.searchParams.set("error", "server_error");
      callbackUrl.searchParams.set(
        "error_description",
        "The authorization server encountered an unexpected condition",
      );
      if (state) callbackUrl.searchParams.set("state", state);
    } else {
      // Success case
      const code = `code_${crypto.randomUUID().slice(0, 16)}`;
      this.authorizationCodes.set(code, {
        client_id: clientId,
        redirect_uri: redirectUri,
        created_at: Date.now(),
      });
      callbackUrl.searchParams.set("code", code);
      if (state) callbackUrl.searchParams.set("state", state);
    }

    // Simulate authorization page with auto-redirect
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Mock OAuth Authorization</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
          .box { border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; background: #f0f9ff; }
          h1 { color: #333; }
          .redirect { color: #666; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>🎭 Mock Authorization Server</h1>
          <p>This is a simulated OAuth authorization page.</p>
          <p><strong>Client ID:</strong> ${clientId || "Not provided"}</p>
          <p><strong>Scenario:</strong> ${scenario === "error" ? "❌ Access Denied" : scenario === "invalid_scope" ? "⚠️ Invalid Request" : scenario === "server_error" ? "🔥 Server Error" : "✅ Success"}</p>
          <p class="redirect">Redirecting in 1 second...</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = "${callbackUrl.toString()}";
          }, 1000);
        </script>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  private async handleTokenExchange(req: Request): Promise<Response> {
    const data = await req.formData();
    const code = data.get("code");
    const clientId = data.get("client_id");
    const clientSecret = data.get("client_secret");

    // Simulate token exchange
    const accessToken = `token_${crypto.randomUUID().slice(0, 24)}`;

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "read:user",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  private handleUserInfo(req: Request): Response {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response(
      JSON.stringify({
        id: "12345",
        username: "demo_user",
        name: "Demo User",
        email: "demo@example.com",
        avatar_url: "https://via.placeholder.com/150",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Demo scenarios
async function runScenario(
  scenario: "success" | "error" | "invalid_scope" | "server_error",
  mockServer: MockOAuthServer,
  openBrowser: boolean = true,
): Promise<boolean> {
  console.log("\n" + "=".repeat(60));

  const scenarioTitles = {
    success: "✅ Success Scenario",
    error: "❌ Access Denied Scenario",
    invalid_scope: "⚠️ Invalid Request Scenario",
    server_error: "🔥 Server Error Scenario",
  };

  console.log(`Running: ${scenarioTitles[scenario]}`);
  console.log("=".repeat(60) + "\n");

  // Step 1: Dynamic Client Registration (simplified)
  console.log("📝 Registering OAuth client dynamically...");
  const registrationResponse = await fetch("http://localhost:8080/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "OAuth Demo App",
      redirect_uris: ["http://localhost:3000/callback"],
      grant_types: ["authorization_code"],
    }),
  });

  const clientData = await registrationResponse.json();
  console.log(`   Client ID: ${clientData.client_id}`);
  console.log(`   Client Secret: ${clientData.client_secret?.slice(0, 10)}...`);

  // Step 2: Build authorization URL
  const authUrl = new URL("http://localhost:8080/authorize");
  authUrl.searchParams.set("client_id", clientData.client_id);
  authUrl.searchParams.set("redirect_uri", "http://localhost:3000/callback");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", crypto.randomUUID());
  authUrl.searchParams.set("scenario", scenario);

  console.log("\n🔐 Starting OAuth authorization flow...");
  console.log(`   State: ${authUrl.searchParams.get("state")}`);
  if (openBrowser) {
    console.log("\n🌐 Opening browser for authorization...");
    console.log(
      "   (The mock authorization page will auto-approve after 1 second)",
    );
  }

  try {
    // Step 3: Start the callback server and trigger authorization
    let resultPromise: Promise<any>;

    if (openBrowser) {
      // Normal flow: open browser and wait for callback
      resultPromise = getAuthCode({
        authorizationUrl: authUrl.toString(),
        port: 3000,
        openBrowser: true,
        timeout: 10000,
        // Using default templates to showcase the enhanced UI
        onRequest: (req) => {
          const url = new URL(req.url);
          // Only log the actual callback, not favicon requests
          if (url.pathname === "/callback") {
            console.log(
              `   Callback received: ${url.pathname}${url.search.slice(0, 50)}...`,
            );
          }
        },
      });
    } else {
      // No-browser mode: start server and manually trigger callback
      resultPromise = getAuthCode({
        authorizationUrl: authUrl.toString(),
        port: 3000,
        openBrowser: false,
        timeout: 10000,
        onRequest: (req) => {
          const url = new URL(req.url);
          if (url.pathname === "/callback") {
            console.log(
              `   Callback received: ${url.pathname}${url.search.slice(0, 50)}...`,
            );
          }
        },
      });

      // Wait a bit for the server to start, then manually call the authorization endpoint
      // which will generate the callback URL
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Fetch the authorization endpoint to get the callback URL
      const authResponse = await fetch(authUrl.toString());
      const authHtml = await authResponse.text();

      // Extract the callback URL from the HTML response
      const callbackMatch = authHtml.match(
        /window\.location\.href = "([^"]+)"/,
      );
      if (callbackMatch) {
        const callbackUrl = callbackMatch[1];
        // Manually trigger the callback
        await fetch(callbackUrl);
      }
    }

    const result = await resultPromise;

    console.log("\n✅ Authorization successful!");
    console.log(`   Code: ${result.code}`);
    console.log(`   State: ${result.state}`);

    // Step 4: Exchange code for token
    console.log("\n🔄 Exchanging authorization code for access token...");
    const tokenResponse = await fetch("http://localhost:8080/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: result.code,
        client_id: clientData.client_id,
        client_secret: clientData.client_secret,
        redirect_uri: "http://localhost:3000/callback",
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log(`   Access token: ${tokenData.access_token.slice(0, 15)}...`);
    console.log(`   Token type: ${tokenData.token_type}`);
    console.log(`   Expires in: ${tokenData.expires_in} seconds`);

    // Step 5: Use the token to get user info
    console.log("\n👤 Fetching user information with access token...");
    const userResponse = await fetch("http://localhost:8080/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();
    console.log(`   User ID: ${userData.id}`);
    console.log(`   Username: ${userData.username}`);
    console.log(`   Name: ${userData.name}`);
    console.log(`   Email: ${userData.email}`);

    console.log("\n🎉 Demo scenario completed successfully!");
    return true;
  } catch (error) {
    if (error instanceof OAuthError) {
      console.log(
        "\n❌ OAuth authorization denied (expected for this scenario)",
      );
      console.log(`   Error code: ${error.error}`);
      if (error.error_description) {
        console.log(`   Description: ${error.error_description}`);
      }
      if (error.error_uri) {
        console.log(`   More info: ${error.error_uri}`);
      }
      console.log("\n✅ Error handling worked correctly!");
      return true; // This is expected for error scenarios
    } else if (error instanceof Error && error.message.includes("timeout")) {
      console.error("\n❌ Request timed out - the mock server may be slow");
      return false;
    } else {
      console.error("\n❌ Unexpected error:", error);
      return false;
    }
  }
}

// Main demo
async function main() {
  const args = process.argv.slice(2);
  const shouldOpenBrowser = !args.includes("--no-browser");

  console.log("🚀 OAuth Callback Library - Interactive Demo");
  console.log("=".repeat(60));
  console.log(
    "\nThis demo shows the OAuth flow without needing real credentials.",
  );
  console.log(
    "It includes a mock OAuth server with dynamic client registration.",
  );

  if (!shouldOpenBrowser) {
    console.log("\n📝 Running in --no-browser mode (for automated testing)");
  }
  console.log("\n⏳ The demo will showcase the default templates with:");
  console.log("\n✨ Success page features:");
  console.log("   • Confetti animation and sparkles");
  console.log("   • Auto-close countdown with progress ring");
  console.log("   • Dark mode support");
  console.log("\n❗ Error page features:");
  console.log("   • Context-specific error icons");
  console.log("   • Copy error code button");
  console.log("   • Helpful error messages");
  console.log();

  const mockServer = new MockOAuthServer();
  await mockServer.start(8080);

  try {
    // Run different scenarios with pauses between them
    const success1 = await runScenario(
      "success",
      mockServer,
      shouldOpenBrowser,
    );

    if (success1) {
      console.log("\n" + "─".repeat(60));
      console.log("⏳ Continuing with error scenario in 2 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const success2 = await runScenario("error", mockServer, shouldOpenBrowser);

    console.log("\n" + "─".repeat(60));
    console.log("⏳ Continuing with invalid scope scenario in 2 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const success3 = await runScenario(
      "invalid_scope",
      mockServer,
      shouldOpenBrowser,
    );

    console.log("\n" + "=".repeat(60));
    console.log("🏁 All demo scenarios completed!");
    console.log("\nThis demo showcased:");
    console.log("  • Dynamic client registration");
    console.log("  • Successful authorization flow with confetti animation");
    console.log("  • Error handling for access denied with contextual help");
    console.log("  • Error handling with error_uri and copy button");
    console.log("  • Default templates with dark mode support");
    console.log("  • Token exchange and API usage");
  } finally {
    mockServer.stop();
    console.log("\n🛑 Mock OAuth server stopped");
  }

  process.exit(0);
}

// Run the demo
main().catch(console.error);
