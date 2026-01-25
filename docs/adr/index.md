# Architecture Decision Records

Key design decisions with context and rationale.

| ADR                                            | Decision                                              |
| ---------------------------------------------- | ----------------------------------------------------- |
| [001](./001-no-refresh-tokens.md)              | No refresh tokens—rely on MCP SDK's re-auth flow      |
| [002](./002-immediate-token-exchange.md)       | Token exchange inside `redirectToAuthorization()`     |
| [003](./003-stable-client-metadata.md)         | Immutable client metadata across DCR                  |
| [004](./004-conditional-state-validation.md)   | Validate `state` only when present in auth URL        |
| [005](./005-store-responsibility-reduction.md) | Store persists only tokens, client, and PKCE verifier |
