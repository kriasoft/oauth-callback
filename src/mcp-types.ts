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
 * Active OAuth flow state for crash recovery.
 * Preserves PKCE verifier and state across process restarts.
 */
export interface OAuthSession {
  codeVerifier?: string;
  state?: string;
}

/**
 * Minimal storage interface for OAuth tokens.
 * @invariant Implementations must be thread-safe within process.
 * @invariant Keys are scoped to avoid collisions between multiple OAuth flows.
 */
export interface TokenStore {
  get(key: string): Promise<Tokens | null>;
  set(key: string, tokens: Tokens): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Full OAuth state storage including client registration and session.
 * Enables recovery from crashes mid-flow and reuse of dynamic registration.
 */
export interface OAuthStore extends TokenStore {
  getClient(key: string): Promise<ClientInfo | null>;
  setClient(key: string, client: ClientInfo): Promise<void>;
  getSession(key: string): Promise<OAuthSession | null>;
  setSession(key: string, session: OAuthSession): Promise<void>;
}

/**
 * Configuration for browser-based OAuth flows with MCP servers.
 * Defaults follow OAuth 2.0 Security BCP (RFC 8252): PKCE enabled, localhost redirect.
 * @see https://datatracker.ietf.org/doc/html/rfc8252
 */
export interface BrowserAuthOptions {
  /** Pre-registered OAuth client credentials. Omit for dynamic registration. */
  clientId?: string;
  clientSecret?: string;

  scope?: string;

  /** Local callback server config. Must match redirect_uri in client registration. */
  port?: number; // Default: 3000
  hostname?: string; // Default: "localhost" (use "127.0.0.1" for IPv4-only)
  callbackPath?: string; // Default: "/callback"

  store?: TokenStore; // Default: in-memory (lost on restart). Use OAuthStore for persistence.
  storeKey?: string; // Storage key prefix. Default: "mcp-tokens"

  openBrowser?: boolean | string; // Default: true. Set false for headless/CI environments.

  authTimeout?: number; // Max wait for user authorization. Default: 300000ms (5 min)

  usePKCE?: boolean; // Enable PKCE (RFC 7636). Default: true. Required for public clients.

  /** Custom HTML templates for callback pages. Supports {{placeholders}}. */
  successHtml?: string;
  errorHtml?: string;

  /** Request inspection callback for debugging OAuth flows. */
  onRequest?: (req: Request) => void;
}
