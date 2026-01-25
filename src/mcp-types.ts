/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * OAuth 2.0 token response fields stored locally.
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-5.1
 */
export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Absolute expiry time in Unix ms, computed from expires_in
  scope?: string; // Space-delimited list of granted scopes
}

/**
 * Dynamic client registration data (RFC 7591) for session reuse.
 * Stored after successful registration to avoid re-registration.
 */
export interface ClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}

/**
 * Minimal storage interface for OAuth tokens.
 * @invariant Keys are scoped to avoid collisions between multiple OAuth flows.
 */
export interface TokenStore {
  get(key: string): Promise<Tokens | null>;
  set(key: string, tokens: Tokens): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Brand symbol for OAuthStore type detection. */
export const OAuthStoreBrand: unique symbol = Symbol("OAuthStore");

/**
 * Extended storage with client registration and PKCE verifier persistence.
 * Enables crash recovery mid-flow and reuse of dynamic registration.
 * @invariant Implementations must include `[OAuthStoreBrand]: true` property.
 */
export interface OAuthStore extends TokenStore {
  readonly [OAuthStoreBrand]: true;

  getClient(key: string): Promise<ClientInfo | null>;
  setClient(key: string, client: ClientInfo): Promise<void>;
  deleteClient(key: string): Promise<void>;

  getCodeVerifier(key: string): Promise<string | null>;
  setCodeVerifier(key: string, verifier: string): Promise<void>;
  deleteCodeVerifier(key: string): Promise<void>;
}

/**
 * Configuration for browser-based OAuth flows with MCP servers.
 * Defaults follow OAuth 2.0 Security BCP (RFC 8252): PKCE enabled, localhost redirect.
 * @see https://datatracker.ietf.org/doc/html/rfc8252
 */
export interface BrowserAuthOptions {
  /**
   * Pre-registered OAuth client ID. Omit to use dynamic client registration.
   * When provided, takes precedence over any DCR-obtained client.
   */
  clientId?: string;
  /**
   * Pre-registered client secret (for confidential clients).
   * Determines auth method for token requests: `client_secret_post` if set, `none` otherwise.
   * This is fixed at construction - DCR-obtained secrets don't change the auth method.
   */
  clientSecret?: string;

  scope?: string;

  /** Local callback server config. Must match redirect_uri in client registration. */
  port?: number; // Default: 3000
  hostname?: string; // Default: "localhost" (use "127.0.0.1" for IPv4-only)
  callbackPath?: string; // Default: "/callback"

  store?: TokenStore; // Default: in-memory (lost on restart). Use OAuthStore for persistence.
  storeKey?: string; // Storage key for token isolation. Default: "mcp-tokens"

  /** Callback to launch the authorization URL. Omit for headless mode.
   * Returns `unknown` to accept any launcher (e.g., `open` → `Promise<ChildProcess>`). */
  launch?: (url: string) => unknown;

  authTimeout?: number; // Max wait for user authorization. Default: 300000ms (5 min)

  /** Custom HTML templates for callback pages. Supports {{placeholders}}. */
  successHtml?: string;
  errorHtml?: string;

  /** Request inspection callback for debugging OAuth flows. */
  onRequest?: (req: Request) => void;

  /**
   * Authorization server base URL (issuer) for token endpoint discovery.
   * Pass the origin (e.g., `https://auth.example.com`), not `/token`.
   * Defaults to the authorization URL origin. Discovery failures are non-fatal.
   */
  authServerUrl?: string | URL;
}
