---
title: getAuthCode
description: Captures an OAuth 2.0 authorization code on a loopback redirect URI in CLI tools and desktop apps.
---

# getAuthCode

Binds a loopback redirect URI, opens the authorization URL, and resolves with the authorization code from the first valid callback. The listener is always closed afterwards.

## Signature

```ts
function getAuthCode(
  authorization: string | URL | AuthorizationUrlBuilder,
  options?: GetAuthCodeOptions,
): Promise<AuthorizationCodeResult>;

type AuthorizationUrlBuilder = (ctx: {
  redirectUri: URL; // bound redirect URI, e.g. http://127.0.0.1:53124/callback
  state: string; // 32 random bytes, base64url
  signal: AbortSignal; // aborted on timeout or cancellation
}) => string | URL | Promise<string | URL>;
```

## Parameters

### `authorization`

- **Builder** (recommended): called after the listener binds. The returned URL gets `redirect_uri` and `state` appended when absent; if present, they must equal the provided values. Required for PAR/JAR.
- **URL**: the library listens on its `redirect_uri` (or on `options.redirectUri` when absent) and appends `state` when missing. A URL with `request` or `request_uri` is rejected; use the builder.

Either way the final URL must be `https:` (or loopback `http:`), with no fragment or credentials, no duplicated `state`, `redirect_uri`, `response_type`, `response_mode`, `request` or `request_uri`, `response_type` absent or `code`, and `response_mode` absent or `query`.

### `options`

| Option        | Type                    | Default                        | Description                                                                      |
| ------------- | ----------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `redirectUri` | `string \| URL`         | `http://127.0.0.1:0/callback`¹ | Loopback redirect URI to listen on                                               |
| `launch`      | `(url: URL) => unknown` | system browser                 | Opens the final URL. Fulfillment is ignored; a throw or rejection fails the flow |
| `timeout`     | `number`                | `300000`                       | Milliseconds for the whole attempt; integer in [1, 2³¹−1]                        |
| `signal`      | `AbortSignal`           | —                              | Cancels the flow                                                                 |
| `successHtml` | `string`                | neutral page                   | Static HTML served after a successful callback                                   |
| `errorHtml`   | `string`                | neutral page                   | Static HTML served after an error callback                                       |

¹ Builder form. In URL form the default is the URL's `redirect_uri`; the option is required when the URL has none, and must match it when both are given.

`redirectUri` must be `http:` on `127.0.0.1`, `[::1]` or `localhost`, with no fragment, credentials, duplicate query keys, or callback parameters (`state`, `code`, `error`, `error_description`, `error_uri`, `iss`) in its query. Port 0 (OS-assigned) is allowed only in builder form. `localhost` listens on `127.0.0.1`.

## Returns

```ts
interface AuthorizationCodeResult {
  code: string;
  redirectUri: string;
  params: URLSearchParams;
}
```

- **`code`**: the authorization code.
- **`redirectUri`**: the exact redirect URI of this flow, never re-serialized. When the authorization request carried `redirect_uri` (always in builder form), send it verbatim as `redirect_uri` in the token request. In builder form with port 0 it contains the bound port.
- **`params`**: the full callback query (`state`, `iss`, `scope`, provider extensions).

## Throws

| Error                                             | When                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| [`OAuthCallbackError`](/api/oauth-callback-error) | The callback carried `error`                                                |
| `DOMException` named `TimeoutError`               | No valid callback within `timeout`                                          |
| `signal.reason`                                   | `signal` aborted (immediately if already aborted)                           |
| `TypeError`                                       | Invalid redirect URI, authorization URL or option, before the browser opens |
| `RangeError`                                      | `timeout` out of range                                                      |
| Launcher error                                    | `launch` threw or rejected                                                  |
| Listener error                                    | Bind failure, e.g. `EADDRINUSE` on a fixed port                             |

## Examples

### Builder with PKCE

```ts
import { createHash, randomBytes } from "node:crypto";
import { getAuthCode } from "oauth-callback";

const verifier = randomBytes(32).toString("base64url");

const { code, redirectUri } = await getAuthCode(() => {
  const url = new URL("https://auth.example.com/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url;
});

const tokens = await fetch("https://auth.example.com/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }),
}).then((res) => res.json());
```

### Fixed redirect URI

For providers that require an exact redirect URI match:

```ts
const { code } = await getAuthCode(build, {
  redirectUri: "http://127.0.0.1:8765/callback",
});
```

### Prebuilt URL

```ts
const url = new URL("https://auth.example.com/authorize");
url.searchParams.set("client_id", CLIENT_ID);
url.searchParams.set("redirect_uri", "http://127.0.0.1:8765/callback");

const { code, params } = await getAuthCode(url); // state is appended
```

### PAR

```ts
const { code, redirectUri } = await getAuthCode(
  async ({ redirectUri, state, signal }) => {
    const res = await fetch(PAR_ENDPOINT, {
      method: "POST",
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri.href,
        state,
        code_challenge,
        code_challenge_method: "S256",
      }),
      signal,
    });
    const { request_uri } = await res.json();
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("request_uri", request_uri);
    return url;
  },
);
```

### Headless or custom launch

```ts
await getAuthCode(build, {
  launch: (url) => console.log(`Open this URL to sign in:\n${url}`),
});
```

### Cancellation and timeout

```ts
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

try {
  const { code } = await getAuthCode(build, {
    signal: controller.signal,
    timeout: 120_000,
  });
} catch (error) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    console.error("Timed out waiting for authorization");
  } else if (controller.signal.aborted) {
    console.error("Cancelled");
  } else {
    throw error;
  }
}
```

### Custom pages

```ts
await getAuthCode(build, {
  successHtml:
    "<!doctype html><title>Signed in</title><h1>Back to the terminal</h1>",
  errorHtml: "<!doctype html><title>Failed</title><h1>Sign-in failed</h1>",
});
```

Pages are served verbatim with `Content-Security-Policy` (no scripts), `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. Callback data is never rendered; show error details in your app.

### Testing

A `launch` that requests the URL plays the user against a mock authorization server:

```ts
const { code } = await getAuthCode(
  () => new URL("/authorize", mockServer.url),
  {
    launch: (url) => fetch(url), // the mock redirects to the callback
    timeout: 10_000,
  },
);
```

## Related

- [OAuthCallbackError](/api/oauth-callback-error)
- [Types](/api/types)
- [Core Concepts](/core-concepts)
