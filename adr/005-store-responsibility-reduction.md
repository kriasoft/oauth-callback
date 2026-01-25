---
url: /oauth-callback/adr/005-store-responsibility-reduction.md
---
# ADR-005: OAuthStore Responsibility Reduction

**Status:** Accepted
**Date:** 2025-01-25
**Tags:** api, storage, simplification

## Problem

The store was accumulating OAuth flow state (session, nonce, state parameter) alongside persistent data (tokens, client registration). This blurred the line between "what survives a crash" and "what's ephemeral by design," making the API harder to reason about and test.

## Decision

The store is responsible **only** for data that must survive process restarts:

| Stored                | Not Stored        |
| --------------------- | ----------------- |
| `tokens`              | `state` parameter |
| `client` (DCR result) | `nonce`           |
| `codeVerifier` (PKCE) | session objects   |

The `codeVerifier` is the sole flow artifact persisted—it enables completing an in-progress authorization if the process crashes after browser launch but before callback.

## Alternatives (brief)

* **Full session persistence** — Would enable crash-recovery at any point, but adds complexity for a rare edge case. Users can simply restart the flow.
* **No verifier persistence** — Simpler, but loses the most common crash scenario (user switches apps, process dies).

## Impact

* Positive: Cleaner mental model; store implementations are trivial to write and test.
* Negative: If the process crashes before `codeVerifier` is saved, the flow must restart. This is acceptable—it's a sub-second window.

## Links

* Code: `src/storage/`, `src/mcp-types.ts`
* Related: ADR-002 (Immediate Token Exchange)
