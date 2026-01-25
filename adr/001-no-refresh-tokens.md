---
url: /oauth-callback/adr/001-no-refresh-tokens.md
---
# ADR-001: No Refresh Tokens in browserAuth

**Status:** Accepted
**Date:** 2025-01-25
**Tags:** oauth, mcp, security

## Problem

* Should `browserAuth` handle OAuth refresh tokens and automatic token renewal?

## Decision

* `browserAuth` intentionally does not request or handle refresh tokens.
* When tokens expire, `tokens()` returns `undefined`, signaling the MCP SDK to re-authenticate.
* The SDK's built-in retry logic handles re-auth transparently.

Rationale:

* **MCP SDK lifecycle**: The SDK expects auth providers to return `undefined` for expired tokens, triggering its standard re-auth flow.
* **CLI/desktop UX**: Interactive re-consent is acceptable and often preferred over silent background refresh.
* **Simplicity**: Avoiding refresh eliminates token rotation complexity, race conditions, and concurrent refresh handling.
* **Security**: No long-lived refresh tokens stored; each session requires explicit user consent.

## Alternatives (brief)

* **Implement refresh flow** — Adds complexity (token rotation, concurrency), conflicts with SDK's re-auth expectations, stores long-lived credentials.
* **Optional refresh via config** — Increases API surface, creates two divergent code paths to maintain.

## Impact

* Positive: Simpler implementation, predictable behavior, aligns with MCP SDK design.
* Negative/Risks: More frequent browser prompts for long-running sessions (acceptable for CLI tools).

## Links

* Code: `src/auth/browser-auth.ts`
* Related: MCP SDK auth interface in `@modelcontextprotocol/sdk/client/auth`
