---
title: OAuthCallbackError
description: Error thrown by getAuthCode() when the authorization server returns an OAuth error through the loopback callback.
---

# OAuthCallbackError

Thrown by [`getAuthCode()`](/api/get-auth-code) when the authorization server redirects back with an `error` instead of a `code` ([RFC 6749 §4.1.2.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.2.1)).

## Definition

```ts
class OAuthCallbackError extends Error {
  readonly name: "OAuthCallbackError";
  readonly error: string; // e.g. "access_denied"
  readonly description?: string; // error_description, untrusted provider text
  readonly uri?: string; // error_uri, untrusted provider text
  readonly params: URLSearchParams; // full callback query
}
```

`message` is `"<error>: <description>"`, or just `error` when there is no description.

## Usage

```ts
import { getAuthCode, OAuthCallbackError } from "oauth-callback";

try {
  const { code } = await getAuthCode(build);
} catch (error) {
  if (error instanceof OAuthCallbackError) {
    if (error.error === "access_denied") {
      console.log("Sign-in cancelled.");
    } else {
      console.error(`Authorization failed: ${error.error}`);
    }
  } else {
    throw error;
  }
}
```

The callback is only accepted when its `state` matches the flow, so the error comes from the redirect you started. Still, treat `description` and `uri` as untrusted: don't render them as HTML and don't follow `uri` automatically. If your provider supports [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html), check `error.params.get("iss")` against the expected issuer before trusting the error details.

## Common error codes

| `error`                     | Meaning                                         |
| --------------------------- | ----------------------------------------------- |
| `access_denied`             | The user or server denied the request           |
| `invalid_request`           | Missing, invalid or duplicated parameter        |
| `unauthorized_client`       | The client may not use this grant               |
| `unsupported_response_type` | The server doesn't support `response_type=code` |
| `invalid_scope`             | Unknown or malformed scope                      |
| `server_error`              | Unexpected server condition                     |
| `temporarily_unavailable`   | Server overloaded or down for maintenance       |

OpenID Connect adds codes such as `login_required`, `consent_required` and `interaction_required`.

## Other failures

`getAuthCode()` signals everything else with standard errors:

| Failure          | Error                                              |
| ---------------- | -------------------------------------------------- |
| Timeout          | `DOMException` with `name === "TimeoutError"`      |
| Abort            | Your signal's `reason`                             |
| Invalid input    | `TypeError` or `RangeError`, before anything binds |
| Launcher failure | Whatever your `launch` threw or rejected with      |
| Bind failure     | The listener error, e.g. `EADDRINUSE`              |

```ts
try {
  await getAuthCode(build, { signal });
} catch (error) {
  if (error instanceof OAuthCallbackError) {
    // provider error
  } else if (error instanceof DOMException && error.name === "TimeoutError") {
    // no callback within `timeout`
  } else if (signal.aborted) {
    // cancelled: error === signal.reason
  } else {
    throw error;
  }
}
```

## MCP

`browserAuth()` doesn't throw `OAuthCallbackError`. It passes the callback to the MCP SDK, which checks `iss` and reports errors with its own error types (e.g. the SDK's `OAuthError`).

## Related

- [getAuthCode](/api/get-auth-code)
- [Types](/api/types)
