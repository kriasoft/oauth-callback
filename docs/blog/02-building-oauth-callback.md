---
link: https://levelup.gitconnected.com/building-a-localhost-oauth-callback-server-in-node-js-866be0765d44
title: Building a Localhost OAuth Callback Server in Node.js
summary: The missing guide to implementing secure OAuth flows in command-line tools and desktop apps
date: 2025-01-18
author: Konstantin Tarkus
tags: [nodejs, tutorial, oauth, authentication]
---

# Building a Localhost OAuth Callback Server in Node.js

When building CLI tools or desktop applications that integrate with OAuth providers, you face a unique challenge: how do you capture the authorization code when there's no public-facing server to receive the callback? The answer lies in a clever technique that's been right under our noses — spinning up a temporary localhost server to catch the OAuth redirect.

This tutorial walks through building a production-ready OAuth callback server that works across Node.js, Deno, and Bun. We'll cover everything from the basic HTTP server setup to handling edge cases that trip up most implementations.

## Understanding the OAuth Callback Flow

Before diving into code, let's clarify what we're building. In a typical OAuth 2.0 authorization code flow, your application redirects users to an authorization server (like GitHub or Google), where they grant permissions. The authorization server then redirects back to your application with an authorization code.

For web applications, this redirect goes to a public URL. But for CLI tools and desktop apps, we use a localhost UR — typically `http://localhost:3000/callback`. The OAuth provider redirects to this local address, and our temporary server captures the authorization code from the query parameters.

This approach is explicitly blessed by OAuth 2.0 for Native Apps (RFC 8252) and is used by major tools like the GitHub CLI and Google's OAuth libraries.

## Setting Up the Basic HTTP Server

The first step is creating an HTTP server that can listen on localhost. Modern JavaScript runtimes provide different APIs for this, but we can abstract them behind a common interface using Web Standards Request and Response objects.

```typescript
interface CallbackServer {
  start(options: ServerOptions): Promise<void>;
  waitForCallback(path: string, timeout: number): Promise<CallbackResult>;
  stop(): Promise<void>;
}

function createCallbackServer(): CallbackServer {
  // Runtime detection
  if (typeof Bun !== "undefined") return new BunCallbackServer();
  if (typeof Deno !== "undefined") return new DenoCallbackServer();
  return new NodeCallbackServer();
}
```

Each runtime implementation follows the same pattern: create a server, listen for requests, and resolve a promise when the callback arrives. Here's the Node.js version that bridges between Node's `http` module and Web Standards:

```typescript
class NodeCallbackServer implements CallbackServer {
  private server?: http.Server;
  private callbackPromise?: {
    resolve: (result: CallbackResult) => void;
    reject: (error: Error) => void;
  };

  async start(options: ServerOptions): Promise<void> {
    const { createServer } = await import("node:http");

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        const request = this.nodeToWebRequest(req, options.port);
        const response = await this.handleRequest(request);

        res.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        res.end(await response.text());
      });

      this.server.listen(options.port, options.hostname, resolve);
      this.server.on("error", reject);
    });
  }

  private nodeToWebRequest(req: http.IncomingMessage, port: number): Request {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      }
    }

    return new Request(url.toString(), {
      method: req.method,
      headers,
    });
  }
}
```

The beauty of this approach is that once we convert to Web Standards, the actual request handling logic is identical across all runtimes.

## Capturing the OAuth Callback

The heart of our server is the callback handler. When the OAuth provider redirects back, we need to extract the authorization code (or error) from the query parameters:

```typescript
private async handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === this.callbackPath) {
    const params: CallbackResult = {};

    // Extract all query parameters
    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    // Resolve the waiting promise
    if (this.callbackPromise) {
      this.callbackPromise.resolve(params);
    }

    // Return success page to the browser
    return new Response(this.generateSuccessHTML(), {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  }

  return new Response("Not Found", { status: 404 });
}
```

Notice how we capture all query parameters, not just the authorization code. OAuth providers send additional information like `state` for CSRF protection, and error responses include `error` and `error_description` fields. Our implementation preserves everything for maximum flexibility.

## Handling Timeouts and Cancellation

Real-world OAuth flows can fail in numerous ways. Users might close the browser, deny permissions, or simply walk away. Our server needs robust timeout and cancellation handling:

```typescript
async waitForCallback(path: string, timeout: number): Promise<CallbackResult> {
  this.callbackPath = path;

  return new Promise((resolve, reject) => {
    let isResolved = false;

    // Set up timeout
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error(`OAuth callback timeout after ${timeout}ms`));
      }
    }, timeout);

    // Wrap resolve/reject to handle cleanup
    const wrappedResolve = (result: CallbackResult) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    this.callbackPromise = {
      resolve: wrappedResolve,
      reject: (error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    };
  });
}
```

Supporting `AbortSignal` enables programmatic cancellation, essential for GUI applications where users might close a window mid-flow:

```typescript
if (signal) {
  if (signal.aborted) {
    throw new Error("Operation aborted");
  }

  const abortHandler = () => {
    this.stop();
    if (this.callbackPromise) {
      this.callbackPromise.reject(new Error("Operation aborted"));
    }
  };

  signal.addEventListener("abort", abortHandler);
}
```

## Providing User Feedback

When users complete the OAuth flow, they see a browser page indicating success or failure. Instead of a blank page or cryptic message, provide clear feedback with custom HTML:

```typescript
function generateCallbackHTML(
  params: CallbackResult,
  templates: Templates,
): string {
  if (params.error) {
    // OAuth error - show error page
    return templates.errorHtml
      .replace(/{{error}}/g, params.error)
      .replace(/{{error_description}}/g, params.error_description || "");
  }

  // Success - show confirmation
  return (
    templates.successHtml ||
    `
    <html>
      <body style="font-family: system-ui; padding: 2rem; text-align: center;">
        <h1>✅ Authorization successful!</h1>
        <p>You can now close this window and return to your terminal.</p>
      </body>
    </html>
  `
  );
}
```

For production applications, consider adding CSS animations, auto-close functionality, or deep links back to your desktop application.

## Security Considerations

While localhost servers are inherently more secure than public endpoints, several security measures are crucial:

**1. Bind to localhost only:** Never bind to `0.0.0.0` or public interfaces. This prevents network-based attacks:

```typescript
this.server.listen(port, "localhost"); // NOT "0.0.0.0"
```

**2. Validate the state parameter:** OAuth's state parameter prevents CSRF attacks. Generate it before starting the flow and validate it in the callback:

```typescript
const state = crypto.randomBytes(32).toString("base64url");
const authUrl = `${provider}/authorize?state=${state}&...`;

// In callback handler
if (params.state !== expectedState) {
  throw new Error("State mismatch - possible CSRF attack");
}
```

**3. Close the server immediately:** Once you receive the callback, shut down the server to minimize the attack surface:

```typescript
const result = await server.waitForCallback("/callback", 30000);
await server.stop(); // Always cleanup
```

**4. Use unpredictable ports when possible:** If your OAuth provider supports dynamic redirect URIs, use random high ports to prevent port-squatting attacks.

## Putting It All Together

Here's a complete example that ties everything together:

```typescript
import { createCallbackServer } from "./server";
import { spawn } from "child_process";

export async function getAuthCode(authUrl: string): Promise<string> {
  const server = createCallbackServer();

  try {
    // Start the server
    await server.start({
      port: 3000,
      hostname: "localhost",
      successHtml: "<h1>Success! You can close this window.</h1>",
      errorHtml: "<h1>Error: {{error_description}}</h1>",
    });

    // Open the browser
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    spawn(opener, [authUrl], { detached: true });

    // Wait for callback
    const result = await server.waitForCallback("/callback", 30000);

    if (result.error) {
      throw new Error(`OAuth error: ${result.error_description}`);
    }

    return result.code!;
  } finally {
    // Always cleanup
    await server.stop();
  }
}

// Usage
const code = await getAuthCode(
  "https://github.com/login/oauth/authorize?" +
    "client_id=xxx&redirect_uri=http://localhost:3000/callback",
);
```

## Best Practices and Next Steps

Building a robust OAuth callback server requires attention to detail, but the patterns are consistent across implementations. Key takeaways:

- **Use Web Standards APIs** for cross-runtime compatibility
- **Handle all error cases** including timeouts and user cancellation
- **Provide clear user feedback** with custom success/error pages
- **Implement security measures** like state validation and localhost binding
- **Clean up resources** by always stopping the server after use

This localhost callback approach has become the de facto standard for OAuth in CLI tools. Libraries like `oauth-callback` provide production-ready implementations with additional features like automatic browser detection, token persistence, and PKCE support.

Modern OAuth is moving toward even better solutions like Device Code Flow for headless environments and Dynamic Client Registration for eliminating pre-shared secrets. But for now, the localhost callback server remains the most widely supported and user-friendly approach for bringing OAuth to command-line tools.

Ready to implement OAuth in your CLI tool? Check out the complete [oauth-callback](https://github.com/kriasoft/oauth-callback) library for a battle-tested implementation that handles all the edge cases discussed here.

---

_This tutorial is part of a series on modern authentication patterns. Follow [@koistya](https://x.com/koistya) for more insights on building secure, user-friendly developer tools._
