#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Example OAuth flow using GitHub as the provider
 *
 * Prerequisites:
 * 1. Create a GitHub OAuth App at https://github.com/settings/developers
 * 2. Set Authorization callback URL to: http://localhost:3000/callback
 * 3. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables
 *
 * Usage:
 *   bun run example.ts
 */

import open from "open";
import { getAuthCode, OAuthError } from "../src/index";

// Check for required environment variables
const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("❌ Missing required environment variables");
  console.error("\nPlease set the following environment variables:");
  console.error("  GITHUB_CLIENT_ID     - Your GitHub OAuth App client ID");
  console.error("  GITHUB_CLIENT_SECRET - Your GitHub OAuth App client secret");
  console.error("\nYou can create a GitHub OAuth App at:");
  console.error("  https://github.com/settings/developers");
  console.error("\nSet the Authorization callback URL to:");
  console.error("  http://localhost:3000/callback");
  process.exit(1);
}

async function main() {
  console.log("🚀 Starting OAuth flow example with GitHub\n");

  // Build the authorization URL
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", "http://localhost:3000/callback");
  authUrl.searchParams.set("scope", "user:email");
  authUrl.searchParams.set("state", crypto.randomUUID() as string);

  console.log("📋 Authorization URL:", authUrl.toString());
  console.log("\n⏳ Opening browser for authorization...");
  console.log("   (If browser doesn't open, visit the URL above manually)\n");

  try {
    // Start the OAuth flow
    const result = await getAuthCode({
      authorizationUrl: authUrl.toString(),
      port: 3000,
      timeout: 60000,
      launch: open,
      onRequest: (req) => {
        const url = new URL(req.url);
        console.log(`📨 Received ${req.method} request to ${url.pathname}`);
      },
    });

    console.log("\n✅ Authorization successful!");
    console.log("   Code:", result.code);
    console.log("   State:", result.state);

    // Exchange the authorization code for an access token
    console.log("\n🔄 Exchanging authorization code for access token...");

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: result.code,
        }),
      },
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(
        `Token exchange failed: ${tokenData.error_description || tokenData.error}`,
      );
    }

    console.log("\n🎉 Access token obtained successfully!");
    console.log("   Token:", tokenData.access_token.substring(0, 10) + "...");
    console.log("   Scope:", tokenData.scope);
    console.log("   Type:", tokenData.token_type);

    // Use the access token to fetch user information
    console.log("\n👤 Fetching user information...");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const userData = await userResponse.json();

    console.log("\n📝 User information:");
    console.log("   Username:", userData.login);
    console.log("   Name:", userData.name || "Not set");
    console.log("   Email:", userData.email || "Not public");
    console.log("   Bio:", userData.bio || "No bio");
    console.log("   Public repos:", userData.public_repos);
    console.log("   Followers:", userData.followers);

    console.log("\n✨ OAuth flow completed successfully!");
  } catch (error) {
    if (error instanceof OAuthError) {
      console.error("\n❌ OAuth authorization failed");
      console.error("   Error:", error.error);
      if (error.error_description) {
        console.error("   Description:", error.error_description);
      }
      if (error.error_uri) {
        console.error("   More info:", error.error_uri);
      }
    } else if (error instanceof Error) {
      console.error("\n❌ Error:", error.message);
    } else {
      console.error("\n❌ Unexpected error:", error);
    }
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
