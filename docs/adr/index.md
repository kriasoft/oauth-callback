# Architecture Decision Records

Key design decisions with context and rationale.

| ADR                                            | Decision                                                        |
| ---------------------------------------------- | --------------------------------------------------------------- |
| [001](./001-no-refresh-tokens.md)              | ~~No refresh tokens~~ (superseded by 006)                       |
| [002](./002-immediate-token-exchange.md)       | ~~Token exchange inside `redirectToAuthorization()`~~ (by 006)  |
| [003](./003-stable-client-metadata.md)         | ~~Immutable client metadata across DCR~~ (by 006)               |
| [004](./004-conditional-state-validation.md)   | Every flow has a `state`; only exact, unambiguous callbacks win |
| [005](./005-store-responsibility-reduction.md) | Credential store holds opaque text; one slot per MCP server     |
| [006](./006-mcp-sdk-owns-oauth.md)             | The MCP SDK owns OAuth; the adapter owns browser and flow       |
| [007](./007-redirect-uri-and-builder.md)       | One redirect URI concept; builder form; URL validation          |
| [008](./008-neutral-callback-pages.md)         | Callback pages never render callback data; security headers     |
