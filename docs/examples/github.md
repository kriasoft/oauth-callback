---
title: GitHub Sign-in Example
description: Sign a CLI user in with a GitHub OAuth App using getAuthCode(), a free loopback port and your own token exchange.
---

# GitHub Sign-in Example

Sign a user in with a [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) and print their login. This is the core flow without MCP: `getAuthCode()` captures the code, your code exchanges it.

## Prerequisites

- Node.js 22+, Deno 2 or Bun 1.2+
- A GitHub OAuth App: create one at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL `http://127.0.0.1/callback`

GitHub accepts any port on a loopback callback URL ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)), so the library can bind a free port and nothing has to be configured.

## Code

```ts
import { getAuthCode, OAuthCallbackError } from "oauth-callback";

const clientId = process.env.GITHUB_CLIENT_ID!;
const clientSecret = process.env.GITHUB_CLIENT_SECRET!;

try {
  // Binds 127.0.0.1 on a free port, then appends redirect_uri and state.
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
      redirect_uri: redirectUri, // the exact value the authorization request carried
    }),
  });
  const token = await response.json();
  if (!token.access_token)
    throw new Error(`Token exchange failed: ${token.error}`);

  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((res) => res.json());
  console.log(`Signed in as ${user.login}`);
} catch (error) {
  if (error instanceof OAuthCallbackError) {
    console.error(`GitHub returned ${error.error}`); // e.g. access_denied
  } else {
    throw error;
  }
}
```

To run the version in the repository:

```bash
git clone https://github.com/kriasoft/oauth-callback.git
cd oauth-callback && bun install
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… bun run example:github
```

## How it works

1. `getAuthCode()` binds `http://127.0.0.1:<free port>/callback` and calls the builder with that redirect URI and a fresh `state`.
2. It appends both to the URL and opens the browser; the user approves on GitHub.
3. GitHub redirects to the loopback listener. The callback with the matching `state` resolves the call, the browser shows a neutral "You can close this tab" page, and the listener closes.
4. Your code exchanges the code, sending `redirectUri` verbatim.

## Variations

**Headless or SSH.** Print the URL instead of opening a browser, and open it on the same machine:

```ts
await getAuthCode(build, {
  launch: (url) => console.log(`Open this URL to sign in:\n${url}`),
});
```

**Fixed port.** If you'd rather register an exact callback URL, e.g. `http://127.0.0.1:8765/callback`, pass the same value as `redirectUri`.

**Cancellation.** Pass `signal` (for example, aborted on `SIGINT`) and `timeout`; see [getAuthCode](/api/get-auth-code#cancellation-and-timeout).

## Security

- A client secret embedded in a CLI you ship can be extracted by anyone. Where the provider supports public clients, use [PKCE](/getting-started#pkce) instead.
- Keep the access token out of logs and store it in the OS keychain if you persist it.

## Related

- [Getting Started](/getting-started)
- [getAuthCode](/api/get-auth-code)
- [OAuthCallbackError](/api/oauth-callback-error)
