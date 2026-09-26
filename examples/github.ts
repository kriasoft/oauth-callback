#!/usr/bin/env bun
/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * GitHub OAuth App login from a CLI.
 *
 * 1. Create an OAuth App at https://github.com/settings/developers with the
 *    callback URL `http://127.0.0.1/callback` (GitHub accepts any loopback port).
 * 2. GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… bun run example:github
 */

import { getAuthCode, OAuthCallbackError } from "../src/index";

const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (see the header of this file).",
  );
  process.exit(1);
}

try {
  // The library binds 127.0.0.1 on a free port, then appends redirect_uri and state.
  const { code, redirectUri } = await getAuthCode(() => {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", "read:user");
    return url;
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const token = (await response.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!token.access_token)
    throw new Error(`Token exchange failed: ${token.error}`);

  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const { login } = (await user.json()) as { login: string };
  console.log(`Signed in as ${login}`);
} catch (error) {
  if (error instanceof OAuthCallbackError)
    console.error(`GitHub returned ${error.error}`);
  else console.error(error);
  process.exit(1);
}
