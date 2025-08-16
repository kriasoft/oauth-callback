# OAuth Callback

[![npm version](https://badge.fury.io/js/oauth-callback.svg)](https://badge.fury.io/js/oauth-callback)
[![npm downloads](https://img.shields.io/npm/dm/oauth-callback.svg)](https://npmjs.com/package/oauth-callback)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/kriasoft/oauth-callback/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

A lightweight OAuth 2.0 callback handler for Node.js, Deno, and Bun with built-in browser flow and MCP SDK integration. Perfect for CLI tools, desktop applications, and development environments that need to capture OAuth authorization codes.

<div align="center">
  <img src="https://raw.githubusercontent.com/kriasoft/oauth-callback/main/examples/notion.gif" alt="OAuth Callback Demo" width="100%" style="max-width: 800px; height: auto;">
</div>

## Features

- 🚀 **Multi-runtime support** - Works with Node.js 18+, Deno, and Bun
- 🔒 **Secure localhost-only server** for OAuth callbacks
- 🤖 **MCP SDK integration** - Built-in OAuth provider for Model Context Protocol
- ⚡ **Minimal dependencies** - Only requires `open` package
- 🎯 **TypeScript support** out of the box
- 🛡️ **Comprehensive OAuth error handling** with detailed error classes
- 🔄 **Automatic server cleanup** after callback
- 💾 **Flexible token storage** - In-memory and file-based options
- 🎪 **Clean success pages** with animated checkmark
- 🎨 **Customizable HTML templates** with placeholder support
- 🚦 **AbortSignal support** for programmatic cancellation
- 📝 **Request logging and debugging** callbacks
- 🌐 **Modern Web Standards APIs** (Request/Response/URL)

## Installation

```bash
bun add oauth-callback
```

Or with npm:

```bash
npm install oauth-callback
```

## Quick Start

```typescript
import {
  getAuthCode,
  OAuthError,
  browserAuth,
  fileStore,
} from "oauth-callback";

// Simple usage
const result = await getAuthCode(
  "https://example.com/oauth/authorize?client_id=xxx&redirect_uri=http://localhost:3000/callback",
);
console.log("Authorization code:", result.code);

// MCP SDK integration
const authProvider = browserAuth({ store: fileStore() });
```

## Usage Examples

### Basic OAuth Flow

```typescript
import { getAuthCode, OAuthError } from "oauth-callback";

async function authenticate() {
  const authUrl =
    "https://github.com/login/oauth/authorize?" +
    new URLSearchParams({
      client_id: "your_client_id",
      redirect_uri: "http://localhost:3000/callback",
      scope: "user:email",
      state: "random_state_string",
    });

  try {
    const result = await getAuthCode(authUrl);
    console.log("Authorization code:", result.code);
    console.log("State:", result.state);

    // Exchange code for access token
    // ... your token exchange logic here
  } catch (error) {
    if (error instanceof OAuthError) {
      console.error("OAuth error:", error.error);
      console.error("Description:", error.error_description);
    } else {
      console.error("Unexpected error:", error);
    }
  }
}
```

### Custom Port Configuration

```typescript
import { getAuthCode } from "oauth-callback";

const result = await getAuthCode({
  authorizationUrl: authUrl,
  port: 8080, // Use custom port (default: 3000)
  timeout: 60000, // Custom timeout in ms (default: 30000)
});
```

### Handling Different OAuth Providers

```typescript
// Google OAuth
const googleAuth = await getAuthCode(
  "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: "http://localhost:3000/callback",
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
    }),
);

// Microsoft OAuth
const microsoftAuth = await getAuthCode(
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      redirect_uri: "http://localhost:3000/callback",
      response_type: "code",
      scope: "user.read",
      response_mode: "query",
    }),
);
```

### MCP SDK Integration

The `browserAuth()` function provides a drop-in OAuth provider for the Model Context Protocol SDK:

```typescript
import { browserAuth, inMemoryStore } from "oauth-callback";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Create MCP-compatible OAuth provider
const authProvider = browserAuth({
  port: 3000,
  scope: "read write",
  store: inMemoryStore(), // Or fileStore() for persistence
});

// Use with MCP SDK transport
const transport = new StreamableHTTPClientTransport(
  new URL("https://mcp.notion.com/mcp"),
  { authProvider },
);

const client = new Client(
  { name: "my-app", version: "1.0.0" },
  { capabilities: {} },
);

await client.connect(transport);
```

#### Token Storage Options

```typescript
import { browserAuth, inMemoryStore, fileStore } from "oauth-callback";

// Ephemeral storage (tokens lost on restart)
const ephemeralAuth = browserAuth({
  store: inMemoryStore(),
});

// Persistent file storage (default: ~/.mcp/tokens.json)
const persistentAuth = browserAuth({
  store: fileStore(),
  storeKey: "my-app-tokens", // Namespace for multiple apps
});

// Custom file location
const customAuth = browserAuth({
  store: fileStore("/path/to/tokens.json"),
});
```

#### Pre-configured Client Credentials

If you have pre-registered OAuth client credentials:

```typescript
const authProvider = browserAuth({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  scope: "read write",
  store: fileStore(), // Persist tokens across sessions
});
```

### Advanced Usage

```typescript
// With custom HTML templates and logging
const result = await getAuthCode({
  authorizationUrl: authUrl,
  port: 3000,
  hostname: "127.0.0.1", // Bind to specific IP
  successHtml: "<h1>Success! You can close this window.</h1>",
  errorHtml: "<h1>Error: {{error_description}}</h1>",
  onRequest: (req) => {
    console.log(`Received request: ${req.method} ${req.url}`);
  },
});

// With cancellation support
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

try {
  const result = await getAuthCode({
    authorizationUrl: authUrl,
    signal: controller.signal,
  });
} catch (error) {
  if (error.message === "Operation aborted") {
    console.log("Authorization was cancelled");
  }
}
```

## API Reference

### `getAuthCode(input)`

Starts a local HTTP server and opens the authorization URL in the user's browser.

#### Parameters

- `input` (string | GetAuthCodeOptions): Either a string containing the OAuth authorization URL, or an options object with:
  - `authorizationUrl` (string): The OAuth authorization URL
  - `port` (number): Port for the local server (default: 3000)
  - `hostname` (string): Hostname to bind the server to (default: "localhost")
  - `callbackPath` (string): URL path for the OAuth callback (default: "/callback")
  - `timeout` (number): Timeout in milliseconds (default: 30000)
  - `openBrowser` (boolean): Whether to open browser automatically (default: true)
  - `successHtml` (string): Custom HTML to display on successful authorization
  - `errorHtml` (string): Custom HTML to display on authorization error
  - `signal` (AbortSignal): AbortSignal for cancellation support
  - `onRequest` (function): Callback fired when a request is received (for logging/debugging)

#### Returns

Promise that resolves to:

```typescript
{
  code: string;        // Authorization code
  state?: string;      // State parameter (if provided)
  [key: string]: any;  // Additional query parameters
}
```

#### Throws

- `OAuthError`: When the OAuth provider returns an error (always thrown for OAuth errors)
- `Error`: For timeout or other unexpected errors

### `OAuthError`

Custom error class for OAuth-specific errors.

```typescript
class OAuthError extends Error {
  error: string; // OAuth error code
  error_description?: string; // Human-readable error description
  error_uri?: string; // URI with error information
}
```

### `browserAuth(options)`

Creates an MCP SDK-compatible OAuth provider for browser-based flows. Handles Dynamic Client Registration (DCR), token storage, and automatic refresh.

#### Parameters

- `options` (BrowserAuthOptions): Configuration object with:
  - `port` (number): Port for callback server (default: 3000)
  - `hostname` (string): Hostname to bind to (default: "localhost")
  - `callbackPath` (string): URL path for OAuth callback (default: "/callback")
  - `scope` (string): OAuth scopes to request
  - `clientId` (string): Pre-registered client ID (optional)
  - `clientSecret` (string): Pre-registered client secret (optional)
  - `store` (TokenStore): Token storage implementation (default: inMemoryStore())
  - `storeKey` (string): Storage key for tokens (default: "mcp-tokens")
  - `authTimeout` (number): Authorization timeout in ms (default: 300000)
  - `successHtml` (string): Custom success page HTML
  - `errorHtml` (string): Custom error page HTML
  - `onRequest` (function): Request logging callback

#### Returns

OAuthClientProvider compatible with MCP SDK transports.

### `inMemoryStore()`

Creates an ephemeral in-memory token store. Tokens are lost when the process exits.

#### Returns

TokenStore implementation for temporary token storage.

### `fileStore(filepath?)`

Creates a persistent file-based token store.

#### Parameters

- `filepath` (string): Optional custom file path (default: `~/.mcp/tokens.json`)

#### Returns

TokenStore implementation for persistent token storage.

## How It Works

1. **Server Creation**: Creates a temporary HTTP server on the specified port
2. **Browser Launch**: Opens the authorization URL in the user's default browser
3. **Callback Handling**: Waits for the OAuth provider to redirect back with the authorization code
4. **Cleanup**: Automatically closes the server after receiving the callback
5. **Result**: Returns the authorization code and any additional parameters

## Security Considerations

- The server only accepts connections from localhost
- Server is closed immediately after receiving the callback
- No data is stored persistently
- State parameter validation should be implemented by the application

## Running the Examples

### Interactive Demo (No Setup Required)

Try the library instantly with the built-in demo that includes a mock OAuth server:

```bash
# Run the demo - no credentials needed!
bun run example:demo

# Run without opening browser (for CI/testing)
bun run examples/demo.ts --no-browser
```

The demo showcases:

- Dynamic client registration (simplified OAuth 2.0 DCR)
- Complete authorization flow with mock provider
- Multiple scenarios (success, access denied, invalid scope)
- Custom HTML templates for success/error pages
- Token exchange and API usage simulation

### Real OAuth Examples

#### GitHub OAuth

For testing with GitHub OAuth:

```bash
# Set up GitHub OAuth App credentials
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"

# Run the GitHub example
bun run example:github
```

This example demonstrates:

- Setting up OAuth with GitHub
- Handling the authorization callback
- Exchanging the code for an access token
- Using the token to fetch user information

#### Notion MCP with Dynamic Client Registration

For testing with Notion's Model Context Protocol server:

```bash
# No credentials needed - uses Dynamic Client Registration!
bun run example:notion
```

This example demonstrates:

- Dynamic Client Registration (OAuth 2.0 DCR) - no pre-configured client ID/secret needed
- Integration with Model Context Protocol (MCP) servers
- Automatic client registration with the authorization server
- Using `browserAuth()` provider with MCP SDK's `StreamableHTTPClientTransport`
- Token persistence with `inMemoryStore()` for ephemeral sessions

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build

# Run examples
bun run example:demo    # Interactive demo
bun run example:github  # GitHub OAuth example
bun run example:notion  # Notion MCP example with Dynamic Client Registration
```

## Requirements

- Node.js 18+ (for native Request/Response support), Deno, or Bun 1.0+
- A registered OAuth application with a provider
- Redirect URI configured as `http://localhost:[port]/callback`

## Common Issues

### Port Already in Use

If port 3000 is already in use, specify a different port:

```typescript
const result = await getAuthCode({ authorizationUrl: authUrl, port: 8080 });
```

### Firewall Warnings

On first run, your OS may show a firewall warning. Allow the connection for localhost only.

### Browser Doesn't Open

If the browser doesn't open automatically, manually navigate to the authorization URL.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is released under the MIT License. Feel free to use it in your projects, modify it to suit your needs, and share it with others. We believe in open source and hope this tool makes OAuth integration easier for everyone!

## Related Projects

- [**MCP Client Generator**](https://github.com/kriasoft/mcp-client-gen) - Generate TypeScript clients from MCP server specifications. Perfect companion for building MCP-enabled applications with OAuth support ([npm](https://www.npmjs.com/package/mcp-client-gen)).
- [**React Starter Kit**](https://github.com/kriasoft/react-starter-kit) - Full-stack React application template with authentication, including OAuth integration examples.

## Backers

Support this project by becoming a backer. Your logo will show up here with a link to your website.

<a href="https://reactstarter.com/b/1"><img src="https://reactstarter.com/b/1.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/2"><img src="https://reactstarter.com/b/2.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/3"><img src="https://reactstarter.com/b/3.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/4"><img src="https://reactstarter.com/b/4.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/5"><img src="https://reactstarter.com/b/5.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/6"><img src="https://reactstarter.com/b/6.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/7"><img src="https://reactstarter.com/b/7.png" height="60" /></a>&nbsp;&nbsp;<a href="https://reactstarter.com/b/8"><img src="https://reactstarter.com/b/8.png" height="60" /></a>

## Support

Found a bug or have a question? Please open an issue on the [GitHub issue tracker](https://github.com/kriasoft/oauth-callback/issues) and we'll be happy to help. If this project saves you time and you'd like to support its continued development, consider [becoming a sponsor](https://github.com/sponsors/koistya). Every bit of support helps maintain and improve this tool for the community. Thank you!
