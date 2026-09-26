# ADR-007: One Redirect URI Concept and the Builder Form

**Status:** Accepted
**Date:** 2026-09-26
**Tags:** api, oauth, security

## Problem

- v2 described the callback address three ways (`port`, `hostname`, `callbackPath`) that had to agree with the `redirect_uri` inside the authorization URL; a mismatch was a silent 5-minute timeout (#58).
- Fixed ports collide; RFC 8252 recommends an OS-assigned loopback port, but the URL must be built after binding.
- PAR/JAR requests carry `state` and `redirect_uri` inside the request object, so the library can't read or add them.

## Decision

- `getAuthCode(authorization, options?)` takes a prebuilt URL or a builder `({ redirectUri, state, signal }) => string | URL | Promise<…>` called after the listener binds. The builder's URL gets `redirect_uri` and `state` appended when absent and must match when present; it is the form for PAR/JAR (the library skips appending when `request`/`request_uri` is present).
- The redirect URI is the only address option: `http:` on `127.0.0.1`, `[::1]` or `localhost`; no fragment, credentials or duplicate query keys; port 0 (ephemeral) only in builder form. Builder default: `http://127.0.0.1:0/callback`. `localhost` is accepted but never generated (RFC 8252 §8.3).
- The redirect URI is kept as the original string (the OAuth value, returned as `redirectUri`) and a parsed URL (validation, listening), so e.g. `:80` is never canonicalized away. Parameters are appended without re-serializing the existing query.
- Every authorization URL is checked before any launcher runs: `https:` (or loopback `http:`), no fragment or credentials, interpreted parameters at most once, `response_type` exactly `code`, `response_mode` absent or `query`. A prebuilt PAR/JAR URL is refused (outer parameters aren't authoritative, RFC 9126 §2.1, RFC 9101 §6.3).
- `launch` is a function receiving the final URL (default: system browser, `open` in a lazily loaded chunk); fulfillment is ignored and only a rejection fails the flow. There is no `launch: false`: the final URL only exists after `state` is appended.
- One composed signal (caller `signal` + `timeout`, default 5 minutes, integer ms in [1, 2³¹−1]) drives every stage; abort and timeout reject with its `reason`. The first terminal event wins.

## Alternatives (brief)

- **`port`/`hostname`/`callbackPath` options (v2)** — three sources of truth for one value.
- **`launch: false`** — gives the caller no way to get the final URL; a logging launcher covers headless use.
- **Byte-exact URL preservation** — `URLSearchParams` can't guarantee it; callers with signed URLs pass `state` or use the builder.

## Impact

- Positive: no redirect mismatch timeouts, ephemeral ports by default, PAR/JAR supported, unsafe URLs never reach a browser.
- Negative/Risks: breaking API; a prebuilt URL without `redirect_uri` needs the `redirectUri` option.

## Links

- Code: `src/get-auth-code.ts`, `src/loopback.ts`, `src/launch.ts`
- RFC 6749 §4.1.3; RFC 8252 §7.3, §8.3; RFC 9126; RFC 9101
- Related: [ADR-004](./004-conditional-state-validation.md), [ADR-008](./008-neutral-callback-pages.md)
