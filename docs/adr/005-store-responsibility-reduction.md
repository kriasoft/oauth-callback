# ADR-005: Credential Store Holds Opaque Text

**Status:** Accepted
**Date:** 2025-01-25
**Updated:** 2026-09-26 (v3 rewrite)
**Tags:** api, storage, mcp

## Problem

- v2 stores had typed methods per record (tokens, client, verifier) plus a branded `OAuthStore`, so every custom store (keychain, database) re-implemented serialization and schema details.
- A store shared between MCP servers could hand audience-bound tokens (RFC 8707) to the wrong server; the SDK reads ctx-less `tokens()` before discovery, so the issuer can't disambiguate.

## Decision

- `CredentialStore` is `{ load(): Promise<string | undefined>; save(value: string | undefined): Promise<void> }`. A keychain store is four lines.
- The adapter owns the format: `{ version: 1, serverUrl, client?, tokens? }` with the SDK's issuer-stamped `StoredOAuthClientInformation`/`StoredOAuthTokens` preserved verbatim. Tokens also carry the `client_id` they were issued to and are only returned to that client, so a changed static client or a re-registration never reuses another client's tokens. Unparseable text, an unknown version, or a document for another `serverUrl` throws; nothing is silently discarded.
- One credential slot per store (one client, one token set). The SDK's issuer stamps (`discardIfIssuerMismatch`) already reject credentials from a different authorization server; a new registration replaces the slot and drops tokens issued to the old client.
- Flow state (state, PKCE verifier, discovery state, callback) is memory-only.
- `fileStore(path)` needs an absolute path (no `~` expansion, no cwd-relative credentials); writes are atomic, with 0600 files (and 0700 for directories it creates) on POSIX and queued per instance; cross-process locking is a non-goal. The default store is memory.

## Alternatives (brief)

- **Typed record methods (v2)** — more surface for every store author; the adapter must own migration anyway.
- **Per-issuer maps** — the SDK's issuer stamps already cover authorization-server switches for a single-slot provider.
- **One store for many servers** — audience-bound tokens make sharing wrong even under one issuer.

## Impact

- Positive: custom stores are trivial; format changes stay inside the adapter.
- Negative/Risks: one store per MCP server; `serverUrl` mismatches fail loudly by design.

## Links

- Code: `src/mcp/credential-store.ts`, `src/mcp/file-store.ts`
- Related: [ADR-006](./006-mcp-sdk-owns-oauth.md)
