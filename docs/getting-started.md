---
title: Getting Started
description: Quick start guide to implement OAuth 2.0 authorization code flow in your CLI tools, desktop apps, and MCP clients using oauth-callback.
---

# Getting Started {#top}

This guide will walk you through adding OAuth authentication to your application in just a few minutes. Whether you're building a CLI tool, desktop app, or MCP client, **OAuth Callback** handles the complexity of receiving authorization codes via localhost callbacks.

## Prerequisites

Before you begin, ensure you have:

- **Runtime**: Node.js 18+, Deno, or Bun installed
- **OAuth App**: Registered with your OAuth provider (unless using Dynamic Client Registration)
- **Redirect URI**: Set to `http://localhost:3000/callback` in your OAuth app settings

## Installation

Install the package using your preferred package manager:

::: code-group

```bash [Bun]
bun add oauth-callback
```

```bash [npm]
npm install oauth-callback
```

```bash [pnpm]
pnpm add oauth-callback
```

```bash [Yarn]
yarn add oauth-callback
```

:::

## Basic Usage

The simplest way to capture an OAuth authorization code is with the `getAuthCode()` function:

```typescript
import { getAuthCode } from "oauth-callback";

// Construct your OAuth authorization URL
const authUrl =
  "https://github.com/login/oauth/authorize?" +
  new URLSearchParams({
    client_id: "your_client_id",
    redirect_uri: "http://localhost:3000/callback",
    scope: "user:email",
    state: crypto.randomUUID(), // For CSRF protection
  });

// Get the authorization code
const result = await getAuthCode(authUrl);

console.log("Authorization code:", result.code);
console.log("State:", result.state);
```

That's it! The library will:

1. Start a local HTTP server on port 3000
2. Open the user's browser to the authorization URL
3. Capture the callback with the authorization code
4. Return the code and automatically shut down the server

## Step-by-Step Implementation

Let's build a complete OAuth flow for a CLI application:

### Step 1: Register Your OAuth Application

First, register your application with your OAuth provider:

::: details GitHub OAuth Setup

1. Go to **Settings** → **Developer settings** → **OAuth Apps**
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: Your app name
   - **Homepage URL**: Your website or GitHub repo
   - **Authorization callback URL**: `http://localhost:3000/callback`
4. Save and copy your **Client ID** and **Client Secret**
   :::

::: details Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the necessary APIs
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth client ID**
6. Choose **Desktop app** as application type
7. Add `http://localhost:3000/callback` to authorized redirect URIs
8. Copy your **Client ID** and **Client Secret**
   :::

### Step 2: Implement the Authorization Flow

Create a file `auth.ts` with your OAuth implementation:

```typescript
import { getAuthCode, OAuthError } from "oauth-callback";

async function authenticate() {
  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Build authorization URL
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", "http://localhost:3000/callback");
  authUrl.searchParams.set("scope", "user:email");
  authUrl.searchParams.set("state", state);

  try {
    // Get authorization code
    console.log("Opening browser for authentication...");
    const result = await getAuthCode(authUrl.toString());

    // Validate state
    if (result.state !== state) {
      throw new Error("State mismatch - possible CSRF attack");
    }

    console.log("✅ Authorization successful!");
    return result.code;
  } catch (error) {
    if (error instanceof OAuthError) {
      console.error("❌ OAuth error:", error.error_description || error.error);
    } else {
      console.error("❌ Unexpected error:", error);
    }
    throw error;
  }
}
```

### Step 3: Exchange Code for Access Token

After getting the authorization code, exchange it for an access token:

```typescript
async function exchangeCodeForToken(code: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`OAuth error: ${data.error_description || data.error}`);
  }

  return data.access_token;
}
```

### Step 4: Use the Access Token

Now you can use the access token to make authenticated API requests:

```typescript
async function getUserInfo(accessToken: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}

// Complete flow
async function main() {
  const code = await authenticate();
  const token = await exchangeCodeForToken(code);
  const user = await getUserInfo(token);

  console.log(`Hello, ${user.name}! 👋`);
  console.log(`Email: ${user.email}`);
}

main().catch(console.error);
```

## MCP SDK Integration

For Model Context Protocol applications, use the `browserAuth()` provider for seamless integration:

### Quick Setup

```typescript
import { browserAuth, inMemoryStore } from "oauth-callback/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Create OAuth provider for MCP
const authProvider = browserAuth({
  store: inMemoryStore(), // Or fileStore() for persistence
  scope: "read write",
});

// Connect to MCP server with OAuth
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

### Token Storage Options

Choose between ephemeral and persistent token storage:

::: code-group

```typescript [Ephemeral (Memory)]
import { browserAuth, inMemoryStore } from "oauth-callback/mcp";

// Tokens are lost when the process exits
const authProvider = browserAuth({
  store: inMemoryStore(),
});
```

```typescript [Persistent (File)]
import { browserAuth, fileStore } from "oauth-callback/mcp";

// Tokens persist across sessions
const authProvider = browserAuth({
  store: fileStore(), // Saves to ~/.mcp/tokens.json
});

// Or specify custom location
const customAuth = browserAuth({
  store: fileStore("/path/to/tokens.json"),
});
```

:::

### Pre-configured Credentials

If you have pre-registered OAuth credentials:

```typescript
const authProvider = browserAuth({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  scope: "read write",
  store: fileStore(),
  storeKey: "my-app", // Namespace for multiple apps
});
```

## Advanced Configuration

### Custom Port and Timeout

Configure the callback server port and timeout:

```typescript
const result = await getAuthCode({
  authorizationUrl: authUrl,
  port: 8080, // Use port 8080 instead of 3000
  timeout: 60000, // 60 second timeout (default: 30s)
  hostname: "127.0.0.1", // Bind to specific IP
});
```

### Custom HTML Templates

Customize the success and error pages shown to users:

```typescript
const result = await getAuthCode({
  authorizationUrl: authUrl,
  successHtml: `
    <html>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>✅ Authorization Successful!</h1>
        <p>You can now close this window and return to the application.</p>
      </body>
    </html>
  `,
  errorHtml: `
    <html>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>❌ Authorization Failed</h1>
        <p>Error: {{error_description}}</p>
        <p>Please try again or contact support.</p>
      </body>
    </html>
  `,
});
```

### Request Logging

Add logging for debugging OAuth flows:

```typescript
const result = await getAuthCode({
  authorizationUrl: authUrl,
  onRequest: (req) => {
    console.log(`[OAuth] ${req.method} ${req.url}`);
    console.log("[OAuth] Headers:", Object.fromEntries(req.headers));
  },
});
```

### Programmatic Cancellation

Support user cancellation with AbortSignal:

```typescript
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

// Or cancel on user input
process.on("SIGINT", () => {
  console.log("\nCancelling OAuth flow...");
  controller.abort();
});

try {
  const result = await getAuthCode({
    authorizationUrl: authUrl,
    signal: controller.signal,
  });
} catch (error) {
  if (error.message === "Operation aborted") {
    console.log("OAuth flow was cancelled");
  }
}
```

## Error Handling

Proper error handling ensures a good user experience:

```typescript
import { getAuthCode, OAuthError } from "oauth-callback";

try {
  const result = await getAuthCode(authUrl);
  // Success path
} catch (error) {
  if (error instanceof OAuthError) {
    // OAuth-specific errors from the provider
    switch (error.error) {
      case "access_denied":
        console.error("User denied access");
        break;
      case "invalid_scope":
        console.error("Invalid scope requested");
        break;
      case "server_error":
        console.error("Authorization server error");
        break;
      default:
        console.error(`OAuth error: ${error.error_description || error.error}`);
    }
  } else if (error.message === "Timeout waiting for callback") {
    console.error("Authorization timed out - please try again");
  } else if (error.message === "Operation aborted") {
    console.error("Authorization was cancelled");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Security Best Practices

### Always Use State Parameter

Protect against CSRF attacks with a state parameter:

```typescript
const state = crypto.randomUUID();

const authUrl = `https://example.com/authorize?state=${state}&...`;
const result = await getAuthCode(authUrl);

if (result.state !== state) {
  throw new Error("State mismatch - possible CSRF attack");
}
```

### Implement PKCE for Public Clients

For enhanced security, implement Proof Key for Code Exchange:

```typescript
import { createHash, randomBytes } from "node:crypto";

// Generate PKCE challenge
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

// Include in authorization request
const authUrl = new URL("https://example.com/authorize");
authUrl.searchParams.set("code_challenge", challenge);
authUrl.searchParams.set("code_challenge_method", "S256");
// ... other parameters

const result = await getAuthCode(authUrl.toString());

// Include verifier in token exchange
const tokenResponse = await fetch(tokenUrl, {
  method: "POST",
  body: new URLSearchParams({
    code: result.code,
    code_verifier: verifier,
    // ... other parameters
  }),
});
```

### Secure Token Storage

Choose appropriate token storage based on your security requirements:

- **Use `inMemoryStore()`** for maximum security (tokens lost on restart)
- **Use `fileStore()`** only when persistence is required
- **Never commit tokens** to version control
- **Consider encryption** for file-based storage in production

## Testing Your Implementation

### Local Testing with Demo

Test the library without real OAuth credentials:

```bash
# Run interactive demo
bun run example:demo

# The demo includes a mock OAuth server for testing
```

### Testing with Real Providers

::: code-group

```bash [GitHub]
# Set credentials in .env file
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# Run example
bun run example:github
```

```bash [Notion MCP]
# No credentials needed - uses Dynamic Client Registration
bun run example:notion
```

:::

## Troubleshooting

### Common Issues and Solutions

::: details Port Already in Use
If port 3000 is already in use:

```typescript
const result = await getAuthCode({
  authorizationUrl: authUrl,
  port: 8080, // Use a different port
});
```

Also update your OAuth app's redirect URI to match.
:::

::: details Browser Doesn't Open
If the browser doesn't open automatically:

```typescript
const result = await getAuthCode({
  authorizationUrl: authUrl,
  openBrowser: false, // Disable auto-open
});

console.log(`Please open: ${authUrl}`);
```

:::

::: details Firewall Warnings
On first run, your OS firewall may show a warning. Allow connections for:

- **localhost** only
- The specific port you're using (default: 3000)
  :::

::: details Token Refresh Errors
For MCP apps with token refresh issues:

```typescript
const authProvider = browserAuth({
  store: fileStore(), // Use persistent storage
  authTimeout: 300000, // Increase timeout to 5 minutes
});
```

:::

## Getting Help

Need assistance? Here are your options:

- 📝 [GitHub Issues](https://github.com/kriasoft/oauth-callback/issues) - Report bugs or request features
- 💬 [GitHub Discussions](https://github.com/kriasoft/oauth-callback/discussions) - Ask questions and share ideas
- 💬 [Discord Community](https://discord.gg/zQQXyqvs5x) - Join our Discord server for real-time help and discussions
- 📚 [Stack Overflow](https://stackoverflow.com/questions/tagged/oauth-callback) - Search or ask questions with the `oauth-callback` tag

Happy coding! 🚀
