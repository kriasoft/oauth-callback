# ADR-004: State Validation

**Status:** Accepted
**Date:** 2025-01-25
**Updated:** 2026-09-26 (v3: state is always present)
**Tags:** oauth, security, csrf

## Problem

- A loopback callback endpoint can be reached by stale browser tabs, other local processes, or any web page linking to it.
- Validating `state` only when the caller remembered to add it makes CSRF protection opt-in.
- Rejecting a mismatched callback only after it resolved still lets unrelated traffic end a legitimate flow.

## Decision

- Every flow has a `state`. Builder form: the library generates 32 random bytes (base64url) and appends it. URL form: an existing single non-empty `state` is used; a missing one is appended; a duplicate or empty one is a `TypeError` before anything binds.
- A callback completes the flow only if it carries exactly one `state` equal to the expected value, the redirect URI's own query parameters, and either `code` (exactly once, non-empty, no `error` key) or `error` (exactly once, non-empty, no `code` key). Key presence counts: `?code=abc&error=` is invalid.
- `code`, `state`, `error`, `error_description`, `error_uri` and `iss` must not repeat, so `OAuthCallbackError` fields are deterministic. Extension parameters stay multi-valued in `params`.
- Invalid callbacks get a 400 with neutral plain text; the flow keeps waiting under its original deadline.
- A valid `error` callback ends the flow (`OAuthCallbackError` in core; passed to the SDK's `finishAuth()`, which checks `iss` first, in `/mcp`).

## Alternatives (brief)

- **Validate only when present (v2)** — safe only for callers who add `state`; every flow now has one.
- **Validate after resolving** — detects a mismatch but still aborts the real flow.
- **Separate `expectedState` option** — duplicates what the URL says and makes validation opt-in.

## Impact

- Positive: no callback can complete a flow without its exact `state`; invalid traffic can't win the race.
- Negative/Risks: URL-form URLs gain a `state` parameter; callers with byte-sensitive (signed) URLs supply `state` themselves or use the builder.

## Links

- Code: `src/loopback.ts` (`isValidCallback`), `src/get-auth-code.ts`
- RFC 6749 §10.12; RFC 8252 §7.3, §8.3; RFC 9207
- Related: [ADR-007](./007-redirect-uri-and-builder.md)
