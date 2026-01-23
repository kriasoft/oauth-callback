/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Configuration options for OAuth authorization code flow
 */
export interface GetAuthCodeOptions {
  /**
   * OAuth authorization URL that the user will be redirected to.
   * Should include all necessary query parameters like client_id, redirect_uri, etc.
   */
  authorizationUrl: string;

  /**
   * Port for the local callback server. Make sure this matches the
   * redirect_uri registered with your OAuth provider.
   * @default 3000
   */
  port?: number;

  /**
   * Hostname to bind the server to. Should typically be "localhost" or "127.0.0.1"
   * for security reasons to prevent external access.
   * @default "localhost"
   */
  hostname?: string;

  /**
   * URL path for the OAuth callback. Must match the path in your registered
   * redirect_uri with the OAuth provider.
   * @default "/callback"
   */
  callbackPath?: string;

  /**
   * Timeout in milliseconds to wait for OAuth callback.
   * If no callback is received within this time, the operation will fail.
   * @default 30000
   */
  timeout?: number;

  /**
   * Whether to automatically open the authorization URL in the user's default browser.
   * Set to false for testing or when you want to handle browser opening manually.
   * If set to "manual", the authorization URL will not be opened automatically and
   * the return value will be an object containing a promise to get the auth code and
   * a promise to cleanup resources (close the server).
   * @default true
   */
  openBrowser?: boolean | "manual";

  /**
   * Custom HTML content to display when authorization is successful.
   * If not provided, a default success page with auto-close functionality is used.
   */
  successHtml?: string;

  /**
   * Custom HTML template to display when authorization fails.
   * Supports placeholders: {{error}}, {{error_description}}, {{error_uri}}
   * If not provided, a default error page is used.
   */
  errorHtml?: string;

  /**
   * AbortSignal for cancellation support. Allows you to cancel the
   * OAuth flow programmatically (e.g., on user request or timeout).
   */
  signal?: AbortSignal;

  /**
   * Callback function fired when any HTTP request is received by the server.
   * Useful for logging, debugging, or custom request handling.
   * @param req - The incoming HTTP request
   */
  onRequest?: (req: Request) => void;
}
