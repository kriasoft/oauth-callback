# OAuth Callback Project Guide

## Project Structure

```bash
oauth-callback/
├── src/                     # Source code
│   ├── index.ts             # Main entry - exports getAuthCode(), OAuthError, browserAuth()
│   ├── server.ts            # HTTP server for OAuth callbacks
│   ├── errors.ts            # OAuthError class and error handling
│   ├── mcp-types.ts         # TypeScript interfaces for MCP integration
│   ├── auth/                # Authentication providers
│   │   ├── browser-auth.ts  # MCP SDK-compatible OAuth provider
│   │   └── browser-auth.test.ts
│   ├── storage/             # Token storage implementations
│   │   └── memory.ts        # In-memory token store
│   └── utils/               # Utility functions
│       └── token.ts         # Token expiry calculations
│
├── templates/               # HTML templates for callback pages
│   ├── success.html         # Success page with animated checkmark
│   ├── error.html           # Error page for OAuth failures
│   └── build.ts             # Template compiler (bundles HTML into TypeScript)
│
├── examples/                # Usage examples
│   ├── demo.ts              # Interactive demo with mock OAuth server
│   ├── github.ts            # GitHub OAuth integration example
│   └── notion.ts            # Notion MCP with Dynamic Client Registration
│
├── dist/                    # Build output (generated)
│   ├── index.js             # Compiled JavaScript
│   ├── index.d.ts           # TypeScript declarations
│   └── ...
│
├── package.json             # Project metadata and dependencies
├── tsconfig.json            # TypeScript configuration
├── README.md                # User documentation
└── CLAUDE.md                # This file - AI assistant context
```

## Key Constraints

- Design Philosophy: Prioritize ideal design over backward compatibility
- Runtime: Always use Bun (not Node.js/NPM). Bun auto-loads .env files
- MCP SDK: OAuth/auth implementation in `node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js`, `node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts`
