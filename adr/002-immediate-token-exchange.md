---
url: /oauth-callback/adr/002-immediate-token-exchange.md
---
# ADR-002: Immediate Token Exchange in redirectToAuthorization()

**Status:** Accepted
**Date:** 2025-01-25
**Tags:** oauth, mcp, sdk-integration

## Problem

The MCP SDK's `auth()` flow works as follows:

1. Check `provider.tokens()` — if valid tokens exist, return `'AUTHORIZED'`
2. If no tokens, start authorization: call `redirectToAuthorization(url)`
3. **Immediately** return `'REDIRECT'` (without re-checking tokens)

For web-based OAuth, this makes sense: `redirectToAuthorization()` triggers a page redirect and control never returns synchronously. The SDK expects authentication to complete in a subsequent request.

For CLI/desktop apps using `browserAuth()`, control **does** return synchronously—we capture the callback in-process via a local HTTP server. We exchange tokens inside `redirectToAuthorization()`, but the SDK has already decided to return `'REDIRECT'`, causing `UnauthorizedError`.

## Decision

Exchange tokens **inside** `redirectToAuthorization()` and document the retry pattern as the expected usage:

```typescript
// First connect triggers OAuth flow and saves tokens, but SDK returns
// 'REDIRECT' before checking. Second connect finds valid tokens.
async function connectWithOAuthRetry(client, serverUrl, authProvider) {
  const transport = new StreamableHTTPClientTransport(serverUrl, {
    authProvider,
  });
  try {
    await client.connect(transport);
  } catch (error) {
    if (error.message === "Unauthorized") {
      await client.connect(
        new StreamableHTTPClientTransport(serverUrl, { authProvider }),
      );
    } else throw error;
  }
}
```

**Why a new transport on retry?** The transport caches connection state internally. A fresh transport ensures clean reconnection.

## Rationale

* **SDK constraint**: No hook exists between redirect completion and the `'REDIRECT'` return. The SDK interface (`Promise<void>`) cannot signal "auth completed."
* **In-process capture**: CLI apps don't have page redirects that would trigger a fresh auth check cycle.
* **Correctness over elegance**: The retry is unusual but reliable—tokens are always saved before the error.

## Alternatives Considered

| Alternative                                    | Why Rejected                                                  |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `transport.finishAuth(callbackUrl)`            | Breaks provider encapsulation; doesn't fit in-process capture |
| Return tokens from `redirectToAuthorization()` | SDK interface expects `Promise<void>`                         |
| Upstream SDK change                            | Not viable for library consumers                              |

## Impact

* **Positive**: Self-contained auth flow; no external coordination needed
* **Negative**: First connection always throws `UnauthorizedError` after OAuth—must be documented clearly

## Links

* Code: `src/auth/browser-auth.ts` lines 254-368
* MCP SDK auth interface: `@modelcontextprotocol/sdk/client/auth.js`
* Related: ADR-001 (no refresh tokens)
