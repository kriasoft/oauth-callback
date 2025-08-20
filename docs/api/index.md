---
title: API Reference
description: Complete API documentation for OAuth Callback library functions, types, and interfaces.
---

# API Reference

OAuth Callback provides a comprehensive set of APIs for handling OAuth 2.0 authorization flows in CLI tools, desktop applications, and Model Context Protocol (MCP) clients. The library is designed with modern Web Standards APIs and works across Node.js 18+, Deno, and Bun.

## Quick Navigation

<div class="api-grid">

### Core Functions

- [**getAuthCode**](/api/get-auth-code) - Capture OAuth authorization codes via localhost callback
- [**browserAuth**](/api/browser-auth) - MCP SDK-compatible OAuth provider with DCR support

### Storage Providers

- [**Storage Providers**](/api/storage-providers) - Token persistence interfaces and implementations
- **inMemoryStore** - Ephemeral in-memory token storage
- **fileStore** - Persistent file-based token storage

### Error Handling

- [**OAuthError**](/api/oauth-error) - OAuth-specific error class with RFC 6749 compliance

### Type Definitions

- [**Types**](/api/types) - Complete TypeScript type reference

</div>

## Import Methods

OAuth Callback supports multiple import patterns to suit different use cases:

### Main Package Import

```typescript
// Core functionality
import { getAuthCode, OAuthError } from "oauth-callback";

// Namespace import for MCP features
import { mcp } from "oauth-callback";
const authProvider = mcp.browserAuth({ store: mcp.fileStore() });
```

### MCP-Specific Import

```typescript
// Direct MCP imports (recommended for MCP projects)
import { browserAuth, fileStore, inMemoryStore } from "oauth-callback/mcp";
import type { TokenStore, OAuthStore, Tokens } from "oauth-callback/mcp";
```

## Core APIs

### getAuthCode(input)

The primary function for capturing OAuth authorization codes through a localhost callback server.

```typescript
function getAuthCode(
  input: string | GetAuthCodeOptions,
): Promise<CallbackResult>;
```

**Key Features:**

- Automatic browser opening
- Configurable port and timeout
- Custom HTML templates
- AbortSignal support
- Comprehensive error handling

[**Full Documentation →**](/api/get-auth-code)

### browserAuth(options)

MCP SDK-compatible OAuth provider that handles the complete OAuth flow including Dynamic Client Registration.

```typescript
function browserAuth(options?: BrowserAuthOptions): OAuthClientProvider;
```

**Key Features:**

- Dynamic Client Registration (RFC 7591)
- Automatic token refresh
- PKCE support (RFC 7636)
- Flexible token storage
- MCP SDK integration

[**Full Documentation →**](/api/browser-auth)

## Storage APIs

### Storage Interfaces

OAuth Callback provides two storage interfaces for different levels of state management:

```typescript
// Basic token storage
interface TokenStore {
  get(key: string): Promise<Tokens | null>;
  set(key: string, tokens: Tokens): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Extended storage with DCR support
interface OAuthStore extends TokenStore {
  getClient(key: string): Promise<ClientInfo | null>;
  setClient(key: string, client: ClientInfo): Promise<void>;
  getSession(key: string): Promise<OAuthSession | null>;
  setSession(key: string, session: OAuthSession): Promise<void>;
}
```

[**Full Documentation →**](/api/storage-providers)

### Built-in Implementations

#### inMemoryStore()

Ephemeral storage that keeps tokens in memory:

```typescript
const authProvider = browserAuth({
  store: inMemoryStore(), // Tokens lost on restart
});
```

#### fileStore(filepath?)

Persistent storage that saves tokens to a JSON file:

```typescript
const authProvider = browserAuth({
  store: fileStore(), // Default: ~/.mcp/tokens.json
});
```

## Error Handling

### OAuthError

Specialized error class for OAuth-specific failures:

```typescript
class OAuthError extends Error {
  error: string; // OAuth error code
  error_description?: string; // Human-readable description
  error_uri?: string; // URI with more information
}
```

**Common Error Codes:**

- `access_denied` - User denied authorization
- `invalid_scope` - Requested scope is invalid
- `server_error` - Authorization server error
- `temporarily_unavailable` - Service temporarily down

[**Full Documentation →**](/api/oauth-error)

## Type System

OAuth Callback is fully typed with TypeScript, providing comprehensive type definitions for all APIs:

### Core Types

```typescript
interface GetAuthCodeOptions {
  authorizationUrl: string;
  port?: number;
  hostname?: string;
  callbackPath?: string;
  timeout?: number;
  openBrowser?: boolean;
  successHtml?: string;
  errorHtml?: string;
  signal?: AbortSignal;
  onRequest?: (req: Request) => void;
}

interface CallbackResult {
  code: string;
  state?: string;
  [key: string]: any;
}
```

### Storage Types

```typescript
interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

interface ClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}
```

[**Full Type Reference →**](/api/types)

## Usage Patterns

### Simple OAuth Flow

```typescript
import { getAuthCode } from "oauth-callback";

const result = await getAuthCode(
  "https://github.com/login/oauth/authorize?client_id=xxx",
);
console.log("Code:", result.code);
```

### MCP Integration

```typescript
import { browserAuth, fileStore } from "oauth-callback/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const authProvider = browserAuth({
  store: fileStore(),
  scope: "read write",
});

const transport = new StreamableHTTPClientTransport(
  new URL("https://mcp.example.com"),
  { authProvider },
);
```

### Error Handling

```typescript
import { getAuthCode, OAuthError } from "oauth-callback";

try {
  const result = await getAuthCode(authUrl);
} catch (error) {
  if (error instanceof OAuthError) {
    console.error(`OAuth error: ${error.error}`);
    console.error(`Details: ${error.error_description}`);
  }
}
```

### Custom Storage

```typescript
import { TokenStore, Tokens } from "oauth-callback/mcp";

class RedisStore implements TokenStore {
  async get(key: string): Promise<Tokens | null> {
    // Implementation
  }
  async set(key: string, tokens: Tokens): Promise<void> {
    // Implementation
  }
  // ... other methods
}

const authProvider = browserAuth({
  store: new RedisStore(),
});
```

## Security Considerations

### Built-in Security Features

- **PKCE by default** - Proof Key for Code Exchange enabled
- **State validation** - Automatic CSRF protection
- **Localhost-only binding** - Server only accepts local connections
- **Automatic cleanup** - Server shuts down after callback
- **Secure file permissions** - Mode 0600 for file storage

### Best Practices

```typescript
// Always validate state for CSRF protection
const state = crypto.randomUUID();
const authUrl = `https://example.com/authorize?state=${state}&...`;
const result = await getAuthCode(authUrl);
if (result.state !== state) {
  throw new Error("State mismatch - possible CSRF attack");
}

// Use ephemeral storage for maximum security
const authProvider = browserAuth({
  store: inMemoryStore(), // No disk persistence
});

// Implement PKCE for public clients
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
```

## Platform Support

### Runtime Compatibility

| Runtime | Minimum Version | Status             |
| ------- | --------------- | ------------------ |
| Node.js | 18.0.0          | ✅ Fully supported |
| Deno    | 1.0.0           | ✅ Fully supported |
| Bun     | 1.0.0           | ✅ Fully supported |

### OAuth Provider Compatibility

OAuth Callback works with any OAuth 2.0 provider that supports the authorization code flow:

- ✅ GitHub
- ✅ Google
- ✅ Microsoft
- ✅ Notion (with DCR)
- ✅ Linear
- ✅ Any RFC 6749 compliant provider

### Browser Compatibility

The library opens the user's default browser for authorization. All modern browsers are supported:

- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Any browser that handles `http://localhost` URLs

## Advanced Features

### Dynamic Client Registration

Automatically register OAuth clients without pre-configuration:

```typescript
// No client_id or client_secret needed!
const authProvider = browserAuth({
  scope: "read write",
  store: fileStore(),
});
```

### Multi-Environment Support

```typescript
function createAuthProvider(env: "dev" | "staging" | "prod") {
  const configs = {
    dev: { port: 3000, store: inMemoryStore() },
    staging: { port: 3001, store: fileStore("~/.mcp/staging.json") },
    prod: { port: 3002, store: fileStore("~/.mcp/prod.json") },
  };
  return browserAuth(configs[env]);
}
```

### Request Logging

```typescript
const authProvider = browserAuth({
  onRequest: (req) => {
    const url = new URL(req.url);
    console.log(`[OAuth] ${req.method} ${url.pathname}`);
  },
});
```

## Migration Guides

### From Manual OAuth Implementation

```typescript
// Before: Manual OAuth flow
const server = http.createServer();
server.listen(3000);
// ... complex callback handling ...

// After: Using OAuth Callback
const result = await getAuthCode(authUrl);
```

### To MCP Integration

```typescript
// Before: Custom OAuth provider
class CustomOAuthProvider {
  /* ... */
}

// After: Using browserAuth
const authProvider = browserAuth({ store: fileStore() });
```

## API Stability

| API             | Status | Since  | Notes                         |
| --------------- | ------ | ------ | ----------------------------- |
| `getAuthCode`   | Stable | v1.0.0 | Core API, backward compatible |
| `browserAuth`   | Stable | v2.0.0 | MCP integration               |
| `OAuthError`    | Stable | v1.0.0 | Error handling                |
| `inMemoryStore` | Stable | v2.0.0 | Storage provider              |
| `fileStore`     | Stable | v2.0.0 | Storage provider              |
| Types           | Stable | v1.0.0 | TypeScript definitions        |

## Related Resources

- [Core Concepts](/core-concepts) - Architecture and design patterns
- [Getting Started](/getting-started) - Quick start guide
- [GitHub Repository](https://github.com/kriasoft/oauth-callback) - Source code and issues
