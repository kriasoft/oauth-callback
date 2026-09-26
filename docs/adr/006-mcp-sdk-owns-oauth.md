# ADR-006: The MCP SDK Owns OAuth

**Status:** Accepted
**Date:** 2026-09-26
**Tags:** mcp, oauth, architecture

## Problem

- v2 `browserAuth()` re-implemented parts of OAuth (code exchange inside `redirectToAuthorization()`, fixed client metadata, no refresh tokens) next to the SDK's own implementation. MCP SDK v2 (`@modelcontextprotocol/client`) now covers discovery, DCR, PKCE, exchange, refresh, RFC 9207 `iss` checks, issuer-stamped credentials and client-auth selection.
- Three SDK behaviors are easy to get wrong: `auth()` returns `REDIRECT` right after `redirectToAuthorization()`; `finishAuth(params)` must run on the transport that received the 401/403 (it holds `_scope` and `_resourceMetadataUrl`); `Protocol.connect()` replaces a transport without closing it.

## Decision

- The adapter owns only the browser, the loopback listener, `state`, flow ownership and credential persistence. Everything else is the SDK's.
- `browserAuth()` returns an `OAuthClientProvider` plus `connect(client)` (Streamable HTTP; completes the browser flow and reconnects) and `completeAuthorization(transport)` (any transport with `finishAuth(params)`).
- One interactive authorization per provider at a time. A flow is reserved in `state()` and lasts until its token exchange settles; overlapping attempts fail fast and never merge. On transports `connect()` created the overlap is an `UnauthorizedError`, since `connect()` knows the originating transport and completes the flow there; caller-created transports share one owner, so their overlap is a plain `Error` that can't be mistaken for "call `completeAuthorization(thisTransport)`". The client identity is pinned while a flow is active, and a redirect whose `client_id` no longer matches the stored client is refused.
- `connect()` gives each transport it creates its own provider view, so every flow knows its transport and completes there. It completes any flow pending on one of its transports (initial 401, step-up, or a concurrent request's flow); for a client already connected through one of its transports it then returns without reconnecting, so concurrent step-up retries don't reject each other's requests. It never closes a transport it didn't create.
- `timeout` bounds one flow from `state()` through the exchange; transports created by `connect()` get a `fetch` whose OAuth requests (discovery, DCR, token) abort with it or the `connect()` signal, so a hung token endpoint can't hold the flow. Requests to `serverUrl` itself are never touched: the SSE stream and concurrent MCP requests outlive both signals.
- Credential invalidation (`"all"`, `"client"`, `"tokens"`) bumps a session generation and aborts the in-flight OAuth requests (discovery, registration, refresh, exchange) of transports `connect()` created, so on that path no response from before a sign-out can be saved after it, and an auth pass that began earlier can't fall back to opening the browser. Transports the caller creates share one owner, and the SDK gives provider hooks no attempt identity, so there the guarantee is best-effort: an exchange checks the generation it took when completion started, any other token save is a refresh that may only replace tokens still stored, and registrations and `state()` check the generation their pass saw in `clientInformation()`. OAuth work through the provider directly must be serialized; concurrent attempts on caller-created transports are unsupported.
- Discovery state is snapshotted when a flow is reserved and only the flow's owner reads it; later writes never touch it. Caller-created transports can't be told apart, so their redirected flow stays pending, even failed or expired, until `completeAuthorization()` consumes it: a stale transport can never complete a newer flow.
- The adapter sets no `grant_types`, `application_type` or `token_endpoint_auth_method`: the SDK derives DCR defaults and adds `offline_access` only when the caller declares `refresh_token`. A static `clientInformation` requires `issuer`, is never re-registered, and the provider omits `saveClientInformation` so the SDK refuses DCR and foreign issuers itself.
- Advanced SDK hooks (`dpop()`, `addClientAuthentication`, `prepareTokenRequest`, `validateResourceURL`, CIMD `clientMetadataUrl`) are not mirrored as options; apps needing them implement `OAuthClientProvider` directly.

## Alternatives (brief)

- **Keep the v2 in-redirect exchange** — a parallel OAuth implementation that misses refresh, `iss` checks and SDK fixes.
- **Raw `waitForCallback()` API** — leaves the originating-transport and reconnect traps to every caller, and releases flow ownership before the exchange settles.
- **Merge overlapping flows** — the second attempt's scope and resource metadata live on a different transport.
- **Reconnect on every `connect()`** — rejects in-flight requests, including concurrent step-up retries; callers wanting a fresh session call `client.close()` first.

## Impact

- Positive: refresh tokens, step-up, `iss` validation and SDK fixes come for free; one line connects.
- Negative/Risks: peer dependency on `@modelcontextprotocol/client` ^2.1; `connect()` is Streamable HTTP only (SSE is legacy; use `completeAuthorization()`).

## Links

- Code: `src/mcp/browser-auth.ts`
- Supersedes: [ADR-001](./001-no-refresh-tokens.md), [ADR-002](./002-immediate-token-exchange.md), [ADR-003](./003-stable-client-metadata.md)
- Related: [ADR-005](./005-store-responsibility-reduction.md)
