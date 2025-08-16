/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { randomBytes } from "node:crypto";
import type {
  BrowserAuthOptions,
  TokenStore,
  OAuthStore,
  Tokens,
  ClientInfo,
  OAuthSession,
} from "../mcp-types";
import { calculateExpiry } from "../utils/token";
import { inMemoryStore } from "../storage/memory";
import { getAuthCode } from "../index";
import { OAuthError } from "../errors";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
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
 * const transport = new StreamableHTTPClientTransport(
 *   new URL("https://mcp.notion.com/mcp"),
 *   { authProvider: browserAuth() }
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
  private readonly _usePKCE: boolean;
  private readonly _openBrowser: boolean | string;
  private readonly _clientId?: string;
  private readonly _clientSecret?: string;
  private readonly _scope?: string;
  private readonly _successHtml?: string;
  private readonly _errorHtml?: string;
  private readonly _onRequest?: (req: Request) => void;

  /** Mutable OAuth state. Protected by serialization locks. */
  private _clientInfo?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _pendingAuthCode?: string;
  private _pendingAuthState?: string;
  private _isExchangingCode = false;
  private _tokensLoaded = false;
  private _loadingTokens?: Promise<void>;
  private _authInProgress?: Promise<void>;
  private _refreshInProgress?: Promise<void>;

  constructor(options: BrowserAuthOptions = {}) {
    this._store = options.store ?? inMemoryStore();
    this._storeKey = options.storeKey ?? "mcp-tokens";
    this._port = options.port ?? 3000;
    this._hostname = options.hostname ?? "localhost";
    this._callbackPath = options.callbackPath ?? "/callback";
    this._authTimeout = options.authTimeout ?? 300000;
    this._usePKCE = options.usePKCE ?? true;
    this._openBrowser = options.openBrowser ?? true;

    this._clientId = options.clientId;
    this._clientSecret = options.clientSecret;
    this._scope = options.scope;

    this._successHtml = options.successHtml;
    this._errorHtml = options.errorHtml;
    this._onRequest = options.onRequest;
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
        this._tokens = {
          access_token: stored.accessToken,
          token_type: "Bearer",
          refresh_token: stored.refreshToken,
          expires_in: stored.expiresAt
            ? Math.floor((stored.expiresAt - Date.now()) / 1000)
            : undefined,
          scope: stored.scope,
        };
      }

      // Load client info if using extended store
      if (this._isOAuthStore(this._store)) {
        const clientInfo = await this._store.getClient(this._storeKey);
        if (clientInfo) {
          this._clientInfo = {
            client_id: clientInfo.clientId,
            client_secret: clientInfo.clientSecret,
            client_id_issued_at: clientInfo.clientIdIssuedAt,
            client_secret_expires_at: clientInfo.clientSecretExpiresAt,
            redirect_uris: [this.redirectUrl],
          };
        }

        // Load session state
        const session = await this._store.getSession(this._storeKey);
        if (session) {
          this._codeVerifier = session.codeVerifier;
        }
      }

      this._tokensLoaded = true;
    } catch (error) {
      console.warn("Failed to load stored data:", error);
      this._tokensLoaded = true;
    }
  }

  private _isOAuthStore(store: any): store is OAuthStore {
    return typeof store.getClient === "function";
  }

  get redirectUrl(): string {
    return `http://${this._hostname}:${this._port}${this._callbackPath}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "OAuth Callback Handler",
      client_uri: "https://github.com/kriasoft/oauth-callback",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
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

    // Check expiry using stored expiresAt from initial token response
    const stored = await this._store.get(this._storeKey);
    if (stored?.expiresAt) {
      if (Date.now() >= stored.expiresAt - 60000) {
        // Expired with 60s buffer
        if (this._tokens.refresh_token) {
          try {
            await this._refreshTokens();
            return this._tokens;
          } catch (error) {
            console.warn("Token refresh failed:", error);
            return undefined;
          }
        }
        return undefined;
      }
    }

    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
    this._tokensLoaded = true;

    const storedTokens: Tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? calculateExpiry(tokens.expires_in)
        : undefined,
      scope: tokens.scope,
    };

    await this._store.set(this._storeKey, storedTokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    /** Serialize concurrent auth attempts to prevent race conditions. */
    if (this._authInProgress) {
      await this._authInProgress;
      return;
    }

    this._authInProgress = this._doAuthorization(authorizationUrl);
    try {
      await this._authInProgress;
    } finally {
      this._authInProgress = undefined;
    }
  }

  private async _doAuthorization(authorizationUrl: URL): Promise<void> {
    let lastError: Error | undefined;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await getAuthCode({
          authorizationUrl: authorizationUrl.href,
          port: this._port,
          hostname: this._hostname,
          callbackPath: this._callbackPath,
          timeout: this._authTimeout,
          openBrowser:
            typeof this._openBrowser === "boolean" ? this._openBrowser : true,
          successHtml: this._successHtml,
          errorHtml: this._errorHtml,
          onRequest: this._onRequest,
        });

        /** Cache auth code for SDK's separate token exchange call. */
        this._pendingAuthCode = result.code;
        this._pendingAuthState = result.state;

        /** Auto-cleanup stale auth codes after timeout to prevent leaks. */
        setTimeout(() => {
          if (this._pendingAuthCode === result.code) {
            this._pendingAuthCode = undefined;
            this._pendingAuthState = undefined;
          }
        }, this._authTimeout);

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof OAuthError) {
          throw error; // OAuth errors are user-actionable, don't retry
        }

        if (attempt < maxRetries) {
          console.warn(
            `Auth attempt ${attempt + 1} failed, retrying...`,
            error,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
        }
      }
    }

    throw new Error(
      `OAuth authorization failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;

    // Persist session state if using extended store
    if (this._isOAuthStore(this._store)) {
      const session: OAuthSession = {
        codeVerifier,
        state: this._pendingAuthState,
      };
      await this._store.setSession(this._storeKey, session);
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
    /**
     * WORKAROUND: SDK calls invalidate("all") during token exchange.
     * Must preserve client info and verifier until exchange completes.
     */
    if (scope === "all" && this._isExchangingCode) {
      /** Only clear tokens; preserve client and verifier for ongoing exchange. */
      this._tokens = undefined;
      await this._store.delete(this._storeKey);
      return;
    }

    if (this._isExchangingCode && (scope === "client" || scope === "all")) {
      this._isExchangingCode = false;
    }

    switch (scope) {
      case "all":
        this._clientInfo = undefined;
        this._tokens = undefined;
        this._codeVerifier = undefined;
        this._tokensLoaded = false;
        await this._store.clear();
        break;
      case "client":
        this._clientInfo = undefined;
        if (this._isOAuthStore(this._store)) {
          await this._store.setClient(this._storeKey, {
            clientId: "",
          });
        }
        break;
      case "tokens":
        this._tokens = undefined;
        await this._store.delete(this._storeKey);
        break;
      case "verifier":
        this._codeVerifier = undefined;
        if (this._isOAuthStore(this._store)) {
          await this._store.setSession(this._storeKey, {});
        }
        break;
    }
  }

  async validateResourceURL(
    _serverUrl: string | URL,
    _resource?: string,
  ): Promise<URL | undefined> {
    return undefined;
  }

  /**
   * Retrieves pending auth code from browser callback.
   * @returns Auth code and state, or undefined if none pending
   * @sideeffect Marks exchange in progress for invalidate() workaround
   * @security Single-use: clears code after retrieval
   */
  getPendingAuthCode(): { code?: string; state?: string } | undefined {
    if (this._pendingAuthCode) {
      const result = {
        code: this._pendingAuthCode,
        state: this._pendingAuthState,
      };

      /** Signal token exchange to protect state in invalidateCredentials(). */
      this._isExchangingCode = true;

      this._pendingAuthCode = undefined;
      this._pendingAuthState = undefined;

      return result;
    }
    return undefined;
  }

  private async _refreshTokens(): Promise<void> {
    /** Serialize refresh attempts to prevent token corruption. */
    if (this._refreshInProgress) {
      await this._refreshInProgress;
      return;
    }

    this._refreshInProgress = this._doRefreshTokens();
    try {
      await this._refreshInProgress;
    } finally {
      this._refreshInProgress = undefined;
    }
  }

  private async _doRefreshTokens(): Promise<void> {
    if (!this._tokens?.refresh_token) {
      throw new Error("No refresh token available");
    }

    const clientInfo = await this.clientInformation();
    if (!clientInfo?.client_id) {
      throw new Error("No client information available for refresh");
    }

    /** TODO: Implement refresh when token endpoint URL is available from server metadata. */
    throw new Error(
      "Token refresh not yet implemented - requires token endpoint URL",
    );
  }

  /** SDK constraint: addClientAuthentication() must not exist on this class. */
}
