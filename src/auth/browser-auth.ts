/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { randomBytes } from "node:crypto";
import {
  OAuthStoreBrand,
  type BrowserAuthOptions,
  type TokenStore,
  type OAuthStore,
  type Tokens,
  type ClientInfo,
} from "../mcp-types";
import { calculateExpiry } from "../utils/token";
import { inMemoryStore } from "../storage/memory";
import { getAuthCode } from "../index";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  exchangeAuthorization,
  discoverAuthorizationServerMetadata,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * Factory for MCP SDK-compatible OAuth provider using browser flow.
 *
 * @param options Configuration for OAuth flow behavior
 * @returns OAuthClientProvider for MCP SDK transport
 *
 * @example
 * ```typescript
 * import open from "open";
 *
 * const transport = new StreamableHTTPClientTransport(
 *   new URL("https://mcp.notion.com/mcp"),
 *   { authProvider: browserAuth({ launch: open }) }
 * );
 * ```
 */
export function browserAuth(
  options: BrowserAuthOptions = {},
): OAuthClientProvider {
  return new BrowserOAuthProvider(options);
}

/**
 * Browser-based OAuth provider for MCP SDK.
 * @invariant PKCE is always enabled (SDK calls saveCodeVerifier/codeVerifier).
 * @invariant addClientAuthentication() must remain undefined (SDK constraint).
 * @invariant Concurrent auth/refresh attempts are serialized.
 */
class BrowserOAuthProvider implements OAuthClientProvider {
  private readonly _store: TokenStore | OAuthStore;
  private readonly _storeKey: string;
  private readonly _port: number;
  private readonly _hostname: string;
  private readonly _callbackPath: string;
  private readonly _authTimeout: number;
  private readonly _redirectUrl: string;
  private readonly _launch?: (url: string) => unknown;
  private readonly _clientId?: string;
  private readonly _clientSecret?: string;
  private readonly _scope?: string;
  private readonly _successHtml?: string;
  private readonly _errorHtml?: string;
  private readonly _onRequest?: (req: Request) => void;
  private readonly _authServerUrl?: URL;

  /** Mutable OAuth state. Protected by serialization locks. */
  private _clientInfo?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _expiresAt?: number; // Absolute expiry time in ms
  private _codeVerifier?: string;
  private _tokensLoaded = false;
  private _loadingTokens?: Promise<void>;
  private _authInProgress?: Promise<void>;

  constructor(options: BrowserAuthOptions = {}) {
    this._store = options.store ?? inMemoryStore();
    this._storeKey = options.storeKey ?? "mcp-tokens";
    this._port = options.port ?? 3000;
    this._hostname = options.hostname ?? "localhost";
    this._callbackPath = options.callbackPath ?? "/callback";
    this._authTimeout = options.authTimeout ?? 300000;
    this._redirectUrl = `http://${this._hostname}:${this._port}${this._callbackPath}`;
    this._launch = options.launch;
    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._scope = options.scope;

    this._successHtml = options.successHtml;
    this._errorHtml = options.errorHtml;
    this._onRequest = options.onRequest;
    this._authServerUrl = options.authServerUrl
      ? new URL(options.authServerUrl)
      : undefined;
  }

  private async _ensureTokensLoaded(): Promise<void> {
    if (this._tokensLoaded) return;

    if (!this._loadingTokens) {
      this._loadingTokens = this._loadStoredData();
    }

    await this._loadingTokens;
  }

  private async _loadStoredData(): Promise<void> {
    try {
      // Load tokens
      const stored = await this._store.get(this._storeKey);
      if (stored) {
        this._expiresAt = stored.expiresAt;
        // SDK doesn't inspect expires_in from tokens() - we handle expiry via expiresAt
        this._tokens = {
          access_token: stored.accessToken,
          token_type: "Bearer",
          refresh_token: stored.refreshToken,
          scope: stored.scope,
        };
      }

      if (this._isOAuthStore(this._store)) {
        // Load DCR client only if no static clientId is configured.
        // Static clientId takes precedence; persisted DCR client is ignored.
        if (!this._clientId) {
          const clientInfo = await this._store.getClient(this._storeKey);
          if (clientInfo?.clientId) {
            this._clientInfo = {
              client_id: clientInfo.clientId,
              client_secret: clientInfo.clientSecret,
              client_id_issued_at: clientInfo.clientIdIssuedAt,
              client_secret_expires_at: clientInfo.clientSecretExpiresAt,
              redirect_uris: [this.redirectUrl],
            };
          }
        }

        // Load PKCE verifier for crash recovery
        const verifier = await this._store.getCodeVerifier(this._storeKey);
        if (verifier) {
          this._codeVerifier = verifier;
        }
      }

      this._tokensLoaded = true;
    } catch {
      // Ignore store errors; fallback to fresh auth
      this._tokensLoaded = true;
    }
  }

  private _isOAuthStore(store: TokenStore): store is OAuthStore {
    return OAuthStoreBrand in store;
  }

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    // Auth method is fixed based on whether clientSecret was provided at construction.
    // Don't check _clientInfo.client_secret here - metadata must be stable for DCR.
    return {
      client_name: "OAuth Callback Handler",
      client_uri: "https://github.com/kriasoft/oauth-callback",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: this._scope,
      token_endpoint_auth_method: this._clientSecret
        ? "client_secret_post"
        : "none",
    };
  }

  async state(): Promise<string> {
    const buffer = randomBytes(32);
    return buffer.toString("base64url");
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (this._clientId) {
      return {
        client_id: this._clientId,
        client_secret: this._clientSecret,
      };
    }

    if (this._clientInfo) {
      return {
        client_id: this._clientInfo.client_id,
        client_secret: this._clientInfo.client_secret,
      };
    }

    return undefined;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    this._clientInfo = clientInformation;

    // Persist client info if using extended store
    if (this._isOAuthStore(this._store)) {
      const clientInfo: ClientInfo = {
        clientId: clientInformation.client_id,
        clientSecret: clientInformation.client_secret,
        clientIdIssuedAt: clientInformation.client_id_issued_at,
        clientSecretExpiresAt: clientInformation.client_secret_expires_at,
      };
      await this._store.setClient(this._storeKey, clientInfo);
    }
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    await this._ensureTokensLoaded();

    if (!this._tokens) {
      return undefined;
    }

    // Return undefined when expired (with 60s buffer) to signal MCP SDK to re-authenticate
    if (this._expiresAt && Date.now() >= this._expiresAt - 60000) {
      return undefined;
    }

    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
    this._expiresAt = tokens.expires_in
      ? calculateExpiry(tokens.expires_in)
      : undefined;
    this._tokensLoaded = true;

    const storedTokens: Tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: this._expiresAt,
      scope: tokens.scope,
    };

    await this._store.set(this._storeKey, storedTokens);
  }

  /**
   * Completes the full OAuth authorization flow synchronously.
   *
   * Despite the name (dictated by the MCP SDK interface), this method does more
   * than redirect: it launches the browser, captures the callback, validates state,
   * exchanges the authorization code for tokens, and persists them to storage.
   *
   * Concurrent calls are serialized: subsequent callers wait for and share the
   * result (or error) of the in-flight attempt.
   *
   * @see ADR-002 for rationale on immediate token exchange
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    // Concurrent callers share both success and failure of the in-flight attempt.
    if (this._authInProgress) {
      await this._authInProgress;
      return;
    }

    this._authInProgress = this._completeAuthorizationFlow(authorizationUrl);
    try {
      await this._authInProgress;
    } finally {
      this._authInProgress = undefined;
    }
  }

  private async _completeAuthorizationFlow(
    authorizationUrl: URL,
  ): Promise<void> {
    // Use managed mode (with launch) or headless mode based on _launch presence
    const baseOptions = {
      port: this._port,
      hostname: this._hostname,
      callbackPath: this._callbackPath,
      timeout: this._authTimeout,
      successHtml: this._successHtml,
      errorHtml: this._errorHtml,
      onRequest: this._onRequest,
    };

    const result = await getAuthCode(
      this._launch
        ? {
            ...baseOptions,
            authorizationUrl: authorizationUrl.href,
            launch: this._launch,
          }
        : baseOptions,
    );

    // getAuthCode() throws OAuthError if result.error exists; this is a defensive
    // check for the edge case where neither code nor error is present.
    if (!result.code) {
      throw new Error("No authorization code received");
    }

    // Validate state from callback against the URL we were given (CSRF protection).
    // Works regardless of whether state() was used - validates whatever is in the URL.
    const expectedState = authorizationUrl.searchParams.get("state");
    if (expectedState && result.state !== expectedState) {
      throw new Error("OAuth state mismatch - possible CSRF attack");
    }

    /**
     * Exchange auth code for tokens immediately after capture.
     *
     * The MCP SDK's auth() returns 'REDIRECT' after redirectToAuthorization()
     * without re-checking for tokens. By exchanging now, subsequent auth calls
     * will find valid tokens and return 'AUTHORIZED'.
     *
     * This enables synchronous browser flows for CLI/desktop apps where the
     * callback is captured in-process rather than via page redirect.
     */
    await this._exchangeCodeForTokens(authorizationUrl, result.code);
  }

  /**
   * Exchange authorization code for tokens and persist them.
   *
   * The MCP SDK's auth() returns 'REDIRECT' after redirectToAuthorization() without
   * re-checking for tokens, causing the transport to throw UnauthorizedError. However,
   * tokens are now saved, so a subsequent connect() attempt will succeed.
   *
   * For CLI/desktop apps, the recommended pattern is:
   * ```typescript
   * try {
   *   await client.connect(transport);
   * } catch (e) {
   *   if (e.message === 'Unauthorized') {
   *     // Tokens acquired during first attempt; retry succeeds
   *     await client.connect(transport);
   *   } else throw e;
   * }
   * ```
   */
  private async _exchangeCodeForTokens(
    authorizationUrl: URL,
    code: string,
  ): Promise<void> {
    // Derive auth server URL from authorization endpoint origin.
    // If the token endpoint is on a different origin, authServerUrl must be explicitly configured.
    const authServerUrl =
      this._authServerUrl ?? new URL("/", authorizationUrl.origin);

    // Discover token endpoint; non-fatal if .well-known is unavailable
    const metadata = await discoverAuthorizationServerMetadata(
      authServerUrl,
    ).catch(() => undefined);

    const clientInfo = await this.clientInformation();
    if (!clientInfo) {
      throw new Error(
        "Client information required for token exchange. " +
          "Provide clientId in options or ensure DCR succeeded.",
      );
    }

    if (!this._codeVerifier) {
      throw new Error("Code verifier required for token exchange");
    }

    let tokens: OAuthTokens;
    try {
      tokens = await exchangeAuthorization(authServerUrl, {
        metadata,
        clientInformation: clientInfo,
        authorizationCode: code,
        codeVerifier: this._codeVerifier,
        redirectUri: this.redirectUrl,
      });
    } catch (error) {
      // Improve error message when discovery failed and authServerUrl wasn't explicitly set.
      // This helps users diagnose cases where auth and token endpoints are on different origins.
      if (!this._authServerUrl && !metadata) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Token exchange failed: ${msg}. ` +
            `If the token endpoint differs from ${authorizationUrl.origin}, set authServerUrl explicitly.`,
        );
      }
      throw error;
    }

    await this.saveTokens(tokens);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;

    if (this._isOAuthStore(this._store)) {
      await this._store.setCodeVerifier(this._storeKey, codeVerifier);
    }
  }

  async codeVerifier(): Promise<string> {
    if (!this._codeVerifier) {
      throw new Error("Code verifier not found");
    }
    return this._codeVerifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier",
  ): Promise<void> {
    switch (scope) {
      case "all":
        // Scoped deletion: only clear data for this storeKey, not the entire store
        this._clientInfo = undefined;
        this._tokens = undefined;
        this._expiresAt = undefined;
        this._codeVerifier = undefined;
        this._tokensLoaded = false;
        await this._store.delete(this._storeKey);
        if (this._isOAuthStore(this._store)) {
          await this._store.deleteClient(this._storeKey);
          await this._store.deleteCodeVerifier(this._storeKey);
        }
        break;
      case "client":
        this._clientInfo = undefined;
        if (this._isOAuthStore(this._store)) {
          await this._store.deleteClient(this._storeKey);
        }
        break;
      case "tokens":
        this._tokens = undefined;
        this._expiresAt = undefined;
        await this._store.delete(this._storeKey);
        break;
      case "verifier":
        this._codeVerifier = undefined;
        if (this._isOAuthStore(this._store)) {
          await this._store.deleteCodeVerifier(this._storeKey);
        }
        break;
    }
  }

  /** Delegates RFC 8707 resource validation to SDK default behavior. */
  async validateResourceURL(
    _serverUrl: string | URL,
    _resource?: string,
  ): Promise<URL | undefined> {
    return undefined;
  }
}
