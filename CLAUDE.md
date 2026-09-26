# OAuth Callback Project Guide

## Documentation

**ADRs** (`docs/adr/NNN-slug.md`): Architectural decisions (reference as ADR-NNN)  
**SPECs** (`docs/specs/slug.md`): Design specifications (reference as SPEC-slug)

## Project Structure

```bash
oauth-callback/
├── src/
│   ├── index.ts             # Root exports: getAuthCode, OAuthCallbackError, types
│   ├── get-auth-code.ts     # getAuthCode(), URL validation, lifecycle (ADR-004, ADR-007)
│   ├── loopback.ts          # Redirect URI parsing, node:http callback listener, pages (ADR-008)
│   ├── launch.ts            # Default launcher (lazy `open` chunk)
│   └── mcp/
│       ├── index.ts         # /mcp exports: browserAuth, fileStore, types
│       ├── browser-auth.ts  # MCP SDK provider, connect(), flow ownership (ADR-006)
│       ├── credential-store.ts # CredentialStore + stored document format (ADR-005)
│       └── file-store.ts    # fileStore(absolutePath)
├── test/                    # bun:test suites, mock MCP/AS server, runtime smoke test
├── scripts/build.ts         # Split bundle (root, /mcp, lazy launcher chunk)
├── examples/                # demo (mock AS), GitHub, Notion MCP
└── docs/                    # VitePress site, ADRs, migration guide
```

## Module Organization

### Main Export (`oauth-callback`)

- `getAuthCode(authorization, options?)` - URL or builder form; resolves `{ code, redirectUri, params }`
- `OAuthCallbackError` - error callback from the authorization server
- Core never imports MCP code

### MCP Export (`oauth-callback/mcp`)

- `browserAuth()` - `OAuthClientProvider` + `connect(client)` + `completeAuthorization(transport)`
- `fileStore(path)` - persistent `CredentialStore`
- Types: `BrowserAuth`, `BrowserAuthOptions`, `CredentialStore` (SDK types are never re-exported)

## Key Constraints

- Design Philosophy: Prioritize ideal design over backward compatibility
- Runtime: Always use Bun (not Node.js/NPM). Bun auto-loads .env files
- MCP SDK: `@modelcontextprotocol/client` 2.x (optional peer); OAuth implementation in `node_modules/@modelcontextprotocol/client/dist/index.mjs` (`auth`, `authInternal`), typings in `dist/index.d.mts`
- Zero runtime dependencies: `open` is a devDependency bundled into a lazy chunk
