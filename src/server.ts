/**
 * Cross-runtime HTTP server for handling OAuth callbacks.
 *
 * SPDX-FileCopyrightText: 2025-present Kriasoft
 * SPDX-License-Identifier: MIT
 */

import { successTemplate, renderError } from "./templates";

/**
 * Result object returned from OAuth callback containing authorization code or error details.
 */
export interface CallbackResult {
  /** Authorization code returned by OAuth provider */
  code?: string;
  /** State parameter for CSRF protection */
  state?: string;
  /** OAuth error code (e.g., 'access_denied', 'invalid_request') */
  error?: string;
  /** Human-readable error description */
  error_description?: string;
  /** URI with additional error information */
  error_uri?: string;
  /** Additional query parameters from OAuth provider */
  [key: string]: string | undefined;
}

/**
 * Configuration options for the OAuth callback server.
 */
export interface ServerOptions {
  /** Port number to bind the server to */
  port: number;
  /** Hostname to bind the server to (default: "localhost") */
  hostname?: string;
  /** Custom HTML content for successful authorization */
  successHtml?: string;
  /** Custom HTML template for error pages (supports {{error}}, {{error_description}}, {{error_uri}} placeholders) */
  errorHtml?: string;
  /** AbortSignal for cancelling the server operation */
  signal?: AbortSignal;
  /** Callback function called for each HTTP request (useful for logging/debugging) */
  onRequest?: (req: Request) => void;
}

/**
 * Interface for OAuth callback server implementations across different runtimes.
 */
export interface CallbackServer {
  /** Start the HTTP server with the given options */
  start(options: ServerOptions): Promise<void>;
  /** Wait for OAuth callback on the specified path with timeout */
  waitForCallback(path: string, timeout: number): Promise<CallbackResult>;
  /** Stop the server and cleanup resources */
  stop(): Promise<void>;
}

/**
 * Generate HTML response for OAuth callback.
 * @param params - OAuth callback parameters (code, error, etc.)
 * @param successHtml - Custom success HTML template
 * @param errorHtml - Custom error HTML template with placeholder support
 * @returns Rendered HTML content
 */
function generateCallbackHTML(
  params: CallbackResult,
  successHtml?: string,
  errorHtml?: string,
): string {
  if (params.error) {
    if (errorHtml) {
      return errorHtml
        .replace(/{{error}}/g, params.error || "")
        .replace(/{{error_description}}/g, params.error_description || "")
        .replace(/{{error_uri}}/g, params.error_uri || "");
    }
    return renderError({
      error: params.error,
      error_description: params.error_description,
      error_uri: params.error_uri,
    });
  }
  return successHtml || successTemplate;
}

/**
 * Base class with shared logic for all runtime implementations.
 */
abstract class BaseCallbackServer implements CallbackServer {
  protected callbackPromise?: {
    resolve: (result: CallbackResult) => void;
    reject: (error: Error) => void;
  };
  protected callbackPath: string = "/callback";
  protected successHtml?: string;
  protected errorHtml?: string;
  protected onRequest?: (req: Request) => void;
  private abortHandler?: () => void;
  private signal?: AbortSignal;

  // Abstract methods to be implemented by subclasses for runtime-specific logic.
  public abstract start(options: ServerOptions): Promise<void>;
  protected abstract stopServer(): Promise<void>;

  /**
   * Sets up common properties and handles the abort signal.
   */
  protected setup(options: ServerOptions): void {
    const { successHtml, errorHtml, signal, onRequest } = options;
    this.successHtml = successHtml;
    this.errorHtml = errorHtml;
    this.onRequest = onRequest;
    this.signal = signal;

    if (signal) {
      if (signal.aborted) {
        throw new Error("Operation aborted");
      }
      this.abortHandler = () => {
        this.stop();
        if (this.callbackPromise) {
          this.callbackPromise.reject(new Error("Operation aborted"));
        }
      };
      signal.addEventListener("abort", this.abortHandler);
    }
  }

  /**
   * Handles incoming HTTP requests using Web Standards APIs.
   * This logic is the same for all runtimes.
   */
  protected handleRequest(request: Request): Response {
    if (this.onRequest) {
      this.onRequest(request);
    }

    const url = new URL(request.url);

    if (url.pathname === this.callbackPath) {
      const params: CallbackResult = {};

      for (const [key, value] of url.searchParams) {
        params[key] = value;
      }

      if (this.callbackPromise) {
        this.callbackPromise.resolve(params);
      }

      return new Response(
        generateCallbackHTML(params, this.successHtml, this.errorHtml),
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    return new Response("Not Found", { status: 404 });
  }

  /**
   * Waits for the OAuth callback on a specific path.
   * This logic is the same for all runtimes.
   */
  public async waitForCallback(
    path: string,
    timeout: number,
  ): Promise<CallbackResult> {
    this.callbackPath = path;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.callbackPromise = undefined;
          reject(
            new Error(
              `OAuth callback timeout after ${timeout}ms waiting for ${path}`,
            ),
          );
        }
      }, timeout);

      const wrappedResolve = (result: CallbackResult) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          this.callbackPromise = undefined;
          resolve(result);
        }
      };

      const wrappedReject = (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          this.callbackPromise = undefined;
          reject(error);
        }
      };

      this.callbackPromise = { resolve: wrappedResolve, reject: wrappedReject };
    });
  }

  /**
   * Stops the server and cleans up resources.
   * This handles shared cleanup logic and calls the runtime-specific stop method.
   */
  public async stop(): Promise<void> {
    if (this.abortHandler && this.signal) {
      this.signal.removeEventListener("abort", this.abortHandler);
      this.abortHandler = undefined;
    }
    if (this.callbackPromise) {
      this.callbackPromise.reject(
        new Error("Server stopped before callback received"),
      );
      this.callbackPromise = undefined;
    }
    await this.stopServer();
  }
}

/**
 * Bun runtime implementation using Bun.serve().
 */
class BunCallbackServer extends BaseCallbackServer {
  private server: any; // Bun.Server

  public async start(options: ServerOptions): Promise<void> {
    this.setup(options);
    const { port, hostname = "localhost" } = options;

    // @ts-ignore - Bun global not available in TypeScript definitions
    this.server = Bun.serve({
      port,
      hostname,
      fetch: (request: Request) => this.handleRequest(request),
    });
  }

  protected async stopServer(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = undefined;
    }
  }
}

/**
 * Deno runtime implementation using Deno.serve().
 */
class DenoCallbackServer extends BaseCallbackServer {
  private abortController?: AbortController;

  public async start(options: ServerOptions): Promise<void> {
    this.setup(options);
    const { port, hostname = "localhost" } = options;
    this.abortController = new AbortController();

    // The user's signal will abort our internal controller.
    options.signal?.addEventListener("abort", () => this.abortController?.abort());

    // @ts-ignore - Deno global not available in TypeScript definitions
    Deno.serve(
      { port, hostname, signal: this.abortController.signal },
      (request: Request) => this.handleRequest(request),
    );
  }

  protected async stopServer(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }
}

/**
 * Node.js implementation using node:http with Web Standards APIs.
 */
class NodeCallbackServer extends BaseCallbackServer {
  private server?: any; // http.Server

  public async start(options: ServerOptions): Promise<void> {
    this.setup(options);
    const { port, hostname = "localhost" } = options;
    const { createServer } = await import("node:http");

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          const request = this.nodeToWebRequest(req, port, hostname);
          const response = this.handleRequest(request);

          res.writeHead(
            response.status,
            Object.fromEntries(response.headers.entries()),
          );
          const body = await response.text();
          res.end(body);
        } catch (error) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      });

      // Tie server closing to the abort signal if provided.
      if (options.signal) {
        options.signal.addEventListener("abort", () => this.server.close());
      }

      this.server.listen(port, hostname, () => resolve());
      this.server.on("error", reject);
    });
  }

  protected async stopServer(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = undefined;
          resolve();
        });
      });
    }
  }

  /**
   * Converts a Node.js IncomingMessage to a Web Standards Request.
   */
  private nodeToWebRequest(req: any, port: number, hostname?: string): Request {
    const host = req.headers.host || `${hostname}:${port}`;
    const url = new URL(req.url!, `http://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    return new Request(url.toString(), {
      method: req.method,
      headers,
    });
  }
}

/**
 * Create a callback server for the current runtime (Bun, Deno, or Node.js).
 * Automatically detects the runtime and returns the appropriate server implementation.
 * @returns CallbackServer instance optimized for the current runtime.
 */
export function createCallbackServer(): CallbackServer {
  // @ts-ignore - Bun global not available in TypeScript definitions
  if (typeof Bun !== "undefined") {
    return new BunCallbackServer();
  }

  // @ts-ignore - Deno global not available in TypeScript definitions
  if (typeof Deno !== "undefined") {
    return new DenoCallbackServer();
  }

  return new NodeCallbackServer();
}