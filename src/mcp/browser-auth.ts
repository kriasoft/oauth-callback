/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * MCP SDK bridge (ADR-006): the SDK owns OAuth (discovery, DCR, PKCE, exchange, refresh,
 * issuer checks); this provider owns the browser, the loopback listener, flow ownership
 * and credential persistence.
 */

import {
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type Client,
  type ConnectOptions,
  type FetchLike,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/client";
import {
  checkAuthorizationUrl,
  checkTimeout,
  deadline,
  generateState,
  launchUrl,
  raceSignal,
} from "../get-auth-code.js";
import { openBrowser } from "../launch.js";
import {
  checkPages,
  isLoopbackHost,
  listenForCallback,
  parseRedirectUri,
  sameUrl,
  type CallbackListener,
  type CallbackPages,
  type RedirectUri,
} from "../loopback.js";
import {
  CredentialSlot,
  memoryStore,
  type CredentialStore,
} from "./credential-store.js";

export interface BrowserAuthOptions {
  /** The one MCP server this provider (and its store) serves. */
  serverUrl: string | URL;
  /** Fixed loopback redirect URI, e.g. `http://127.0.0.1:8765/callback` (no port 0: DCR registers it). */
  redirectUri: string | URL;
  /** Client name for Dynamic Client Registration; required unless `clientInformation` is set. */
  clientName?: string;
  /** Pre-registered client. `issuer` is the `authorization_servers` entry of the server's protected-resource metadata. */
  clientInformation?: StoredOAuthClientInformation & { issuer: string };
  /** Extra client metadata (e.g. `scope`, `grant_types`); redirect and response fields are set by the adapter. */
  clientMetadata?: Partial<
    Omit<
      OAuthClientMetadata,
      "client_name" | "redirect_uris" | "response_types" | "application_type"
    >
  >;
  /** Credential persistence. Default: memory (process lifetime). */
  store?: CredentialStore;
  /** Same contract as `getAuthCode()`: opens the URL; only a rejection fails the flow. */
  launch?: (url: URL) => unknown;
  /**
   * Milliseconds one interactive authorization may take, from state creation through token
   * exchange. Default 300_000. `connect()` aborts its OAuth requests at the deadline;
   * `completeAuthorization()` can't interrupt your transport's `finishAuth()`: bound its fetch.
   */
  timeout?: number;
  successHtml?: string;
  errorHtml?: string;
}

export interface BrowserAuth extends OAuthClientProvider {
  /**
   * Connects `client` to `serverUrl` over Streamable HTTP, completing browser authorization
   * if required. Resolves once `client` is connected. Also completes a step-up authorization
   * pending on a transport it created (403 `insufficient_scope` → `UnauthorizedError`).
   */
  connect(
    client: Client,
    options?: ConnectOptions & {
      transportOptions?: Omit<
        StreamableHTTPClientTransportOptions,
        "authProvider"
      >;
    },
  ): Promise<void>;
  /**
   * Low level, for transports you create: waits for the pending callback and exchanges it on
   * `transport` (the one that received the 401/403). Give that transport a bounded `fetch`.
   */
  completeAuthorization(
    transport: { finishAuth(params: URLSearchParams): Promise<void> },
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

/** Who reserved a flow: a transport created by `connect()`, or `external` (the provider itself). */
interface Owner {
  transport?: StreamableHTTPClientTransport;
  /** While set, the transport's OAuth fetches abort with it: the `connect()` call, then the token exchange. */
  signal?: AbortSignal;
  /** Its `connect()` attempt failed: late SDK hooks must not start a flow or open a browser. */
  abandoned?: boolean;
  /** Session generation when its current SDK auth pass began (see Session.#generation). */
  generation?: number;
}

/** One interactive authorization, from `state()` until its token exchange settles. */
interface Flow {
  readonly state: string;
  readonly owner: Owner;
  /** Flow lifetime (`timeout`). */
  readonly signal: AbortSignal;
  readonly clearTimer: () => void;
  /** Settles once redirected or ended, so `connect()` can wait for a flow still being prepared. */
  readonly ready: Promise<void>;
  readonly markReady: () => void;
  listener?: CallbackListener;
  /** Callback params, or the launcher/deadline failure; set once redirected, kept until consumed. */
  result?: Promise<URLSearchParams>;
  /** PKCE verifier, written only by the reserving owner before redirect. */
  verifier?: string;
  /** Discovery pinned for this flow: an overlapping attempt's discovery can't replace it. */
  discovery?: OAuthDiscoveryState;
  failed: boolean;
  completing: boolean;
  /** Session generation when the exchange started; independent of re-stampable owners. */
  generation?: number;
}

interface Config {
  serverUrl: URL;
  redirect: RedirectUri;
  metadata: OAuthClientMetadata;
  staticClient?: StoredOAuthClientInformation;
  launch: (url: URL) => unknown;
  timeout: number;
  pages: CallbackPages;
}

/**
 * Shared state behind the provider and the per-transport views `connect()` creates.
 * Rule: one interactive authorization per provider at a time; overlapping attempts fail
 * fast instead of merging, and a flow is only ever completed or ended by its own owner.
 */
class Session {
  flow?: Flow;
  /** The owner behind the provider itself, shared by every transport the caller creates. */
  readonly external: Owner = {};
  /** Client registrations still being persisted; they pin out new flows (see #saveClient). */
  #savingClient = 0;
  #discovery?: OAuthDiscoveryState;
  /**
   * Bumped by credential invalidation. Every SDK auth pass starts by reading
   * clientInformation(), which stamps the owner; a registration, refresh or exchange that
   * began before an invalidation can't save afterwards, so logout can't be undone.
   * Transports you create share one owner, and a concurrent pass can re-stamp it, so a
   * running exchange also carries its own stamp (Flow.generation).
   */
  #generation = 0;

  constructor(
    readonly config: Config,
    readonly credentials: CredentialSlot,
  ) {}

  /** The provider hooks as seen through `owner`, so each flow knows its transport. */
  provider(owner: Owner): OAuthClientProvider {
    const { config, credentials } = this;
    const provider: OAuthClientProvider = {
      get redirectUrl() {
        return config.redirect.href;
      },
      get clientMetadata() {
        return config.metadata;
      },
      state: () => this.#reserve(owner),
      clientInformation: () => {
        owner.generation = this.#generation;
        return this.#clientInformation();
      },
      tokens: () => this.#tokens(),
      saveTokens: (tokens) => {
        this.#checkGeneration(owner);
        return credentials.update((c) => {
          const client = config.staticClient ?? c.client;
          if (!client) throw new Error("OAuth tokens without a client");
          return { ...c, tokens: { ...tokens, client_id: client.client_id } };
        });
      },
      redirectToAuthorization: (url) => this.#redirect(owner, url),
      saveCodeVerifier: (verifier) => {
        // Bound to the flow its owner reserved: a late write from an abandoned attempt
        // must not replace a newer flow's verifier.
        const flow = this.flow;
        if (!flow || flow.owner !== owner || flow.result || owner.abandoned)
          throw new Error("saveCodeVerifier() without a matching state()");
        flow.verifier = verifier;
      },
      codeVerifier: () => {
        const verifier = this.flow?.verifier;
        if (!verifier)
          throw new Error("No PKCE code verifier for this authorization");
        return verifier;
      },
      // The owner of a flow reads and writes that flow's copy; everyone else the shared one.
      saveDiscoveryState: (state) => {
        const flow = this.flow;
        if (flow?.owner === owner) flow.discovery = state;
        else this.#discovery = state;
      },
      discoveryState: () => {
        const flow = this.flow;
        return flow?.owner === owner ? flow.discovery : this.#discovery;
      },
      invalidateCredentials: (scope) => this.#invalidate(scope),
    };
    // Omitted for a static client, so the SDK itself refuses DCR and foreign issuers.
    if (!config.staticClient)
      provider.saveClientInformation = (client) =>
        this.#saveClient(owner, client);
    return provider;
  }

  /** A flow blocks others until it fails or expires, unless its token exchange is still running. */
  #active(): Flow | undefined {
    const flow = this.flow;
    return flow && (flow.completing || !(flow.failed || flow.signal.aborted))
      ? flow
      : undefined;
  }

  // The SDK calls state() only on the interactive path, right before saving the verifier.
  #reserve(owner: Owner): string {
    if (owner.abandoned)
      throw new Error(
        "The connect() call that started this authorization has ended",
      );
    const active = this.#active();
    if (active || this.#savingClient) {
      const message = "An MCP authorization is already in progress";
      // UnauthorizedError means "connect() completes it, then retry", which holds only when
      // both sides are connect() transports (e.g. concurrent 403 step-ups). Caller-created
      // transports share one owner, and connect() can't complete their flows.
      throw owner === this.external || active?.owner === this.external
        ? new Error(message)
        : new UnauthorizedError(message);
    }
    if (this.flow) this.end(this.flow);
    const timer = deadline(this.config.timeout);
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => (markReady = resolve));
    timer.signal.addEventListener("abort", markReady, { once: true });
    const flow: Flow = {
      state: generateState(),
      owner,
      signal: timer.signal,
      clearTimer: timer.clear,
      ready,
      markReady,
      discovery: this.#discovery,
      failed: false,
      completing: false,
    };
    this.flow = flow;
    return flow.state;
  }

  async #redirect(owner: Owner, input: URL): Promise<void> {
    const flow = this.flow;
    if (!flow || flow.owner !== owner || flow.result)
      throw new Error("redirectToAuthorization() without a matching state()");
    try {
      const url = checkAuthorizationUrl(input);
      const params = url.searchParams;
      if (!sameUrl(params.get("redirect_uri") ?? "", this.config.redirect.url))
        throw new TypeError(
          "Authorization URL redirect_uri differs from redirectUri",
        );
      if (params.get("state") !== flow.state)
        throw new TypeError(
          "Authorization URL state differs from the reserved state",
        );
      // A concurrent registration that replaced the client must not be exchanged under.
      const client = await this.#clientInformation();
      const clientIds = params.getAll("client_id");
      if (
        !client ||
        clientIds.length !== 1 ||
        clientIds[0] !== client.client_id
      )
        throw new Error(
          "The OAuth client changed while authorization was starting",
        );
      if (owner.abandoned)
        throw new Error(
          "The connect() call that started this authorization has ended",
        );
      flow.signal.throwIfAborted();

      const listener = await listenForCallback(
        this.config.redirect.url,
        flow.state,
        this.config.pages,
      );
      flow.listener = listener;
      // Cancellation may have landed while binding: never launch for a dead attempt.
      if (owner.abandoned || owner.signal?.aborted)
        throw new Error(
          "The connect() call that started this authorization has ended",
        );
      flow.signal.throwIfAborted();
      void listener.callback.then(() => listener.close());
      // Launcher and callback race into one retained result; the SDK must get control back
      // now (it throws UnauthorizedError after this returns), so the launcher isn't awaited.
      flow.result = raceSignal(
        Promise.race([listener.callback, launchUrl(this.config.launch, url)]),
        flow.signal,
      );
      flow.result.catch(() => {
        flow.failed = true;
        flow.clearTimer();
        void listener.close();
      });
      flow.markReady();
    } catch (error) {
      this.end(flow);
      throw error;
    }
  }

  /** Waiting phase, then the exchange on `transport`; ownership lasts until the exchange settles. */
  async complete(
    flow: Flow,
    transport: { finishAuth(params: URLSearchParams): Promise<void> },
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (flow.completing)
      throw new Error("This authorization is already being completed");
    flow.completing = true;
    flow.generation = this.#generation;
    const combined = signal
      ? AbortSignal.any([signal, flow.signal])
      : flow.signal;
    try {
      const params = await raceSignal(flow.result!, combined);
      flow.owner.signal = combined;
      try {
        // Code or error params: finishAuth verifies `iss` before trusting `error*`.
        await transport.finishAuth(params);
      } catch (error) {
        combined.throwIfAborted();
        throw error;
      } finally {
        flow.owner.signal = undefined;
      }
      // A caller's transport can't be cancelled; report cancellation that won during its exchange.
      combined.throwIfAborted();
    } finally {
      this.end(flow);
    }
  }

  end(flow: Flow): void {
    if (this.flow === flow) this.flow = undefined;
    flow.clearTimer();
    flow.markReady();
    void flow.listener?.close();
  }

  async #clientInformation(): Promise<
    StoredOAuthClientInformation | undefined
  > {
    if (this.config.staticClient) return this.config.staticClient;
    const { client } = await this.credentials.read();
    // A DCR client registered for another redirect URI would fail at the AS: register again.
    const uris = (client as { redirect_uris?: unknown } | undefined)
      ?.redirect_uris;
    if (
      Array.isArray(uris) &&
      !uris.some((uri) => sameUrl(String(uri), this.config.redirect.url))
    )
      return undefined;
    return client;
  }

  /** Stored tokens, only for the client they were issued to (e.g. not after a static client change). */
  async #tokens(): Promise<StoredOAuthTokens | undefined> {
    const { tokens } = await this.credentials.read();
    if (!tokens) return undefined;
    const { client_id, ...rest } = tokens;
    const client = await this.#clientInformation();
    return client?.client_id === client_id ? rest : undefined;
  }

  async #saveClient(
    owner: Owner,
    client: StoredOAuthClientInformation,
  ): Promise<void> {
    if (owner.abandoned)
      throw new Error(
        "The connect() call that started this registration has ended",
      );
    this.#checkGeneration(owner);
    // Client identity is pinned while a flow is active (see #redirect), and a save
    // pins out new flows until it is persisted, so no flow starts on the old client.
    if (this.#active())
      throw new Error(
        "Can't register an OAuth client while an authorization is in progress",
      );
    this.#savingClient++;
    try {
      // Tokens belong to the client (and issuer) that obtained them. redirect_uris records
      // what was registered even if the AS didn't echo it, so a changed redirectUri re-registers.
      await this.credentials.update(({ tokens }) => ({
        client: { redirect_uris: [this.config.redirect.href], ...client },
        tokens:
          tokens?.client_id === client.client_id &&
          tokens.issuer === client.issuer
            ? tokens
            : undefined,
      }));
    } finally {
      this.#savingClient--;
    }
  }

  #checkGeneration(owner: Owner): void {
    const flow = this.flow;
    if (
      (owner.generation ?? 0) !== this.#generation ||
      (flow?.completing && flow.generation !== this.#generation)
    )
      throw new Error("Credentials were invalidated during authorization");
  }

  async #invalidate(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if ((scope === "verifier" || scope === "all") && this.flow)
      this.flow.verifier = undefined;
    if (scope === "discovery" || scope === "all") {
      this.#discovery = undefined;
      if (this.flow) this.flow.discovery = undefined;
    }
    if (scope === "all" || scope === "client" || scope === "tokens")
      this.#generation++;
    if (scope === "all" && this.flow && !this.flow.completing)
      this.end(this.flow);
    // A static client is configuration, not state: it survives every scope.
    if (scope === "all") await this.credentials.update(() => ({}));
    if (scope === "client")
      await this.credentials.update((c) => ({ tokens: c.tokens }));
    if (scope === "tokens")
      await this.credentials.update((c) => ({ client: c.client }));
  }
}

function resolveConfig(options: BrowserAuthOptions): Config {
  if (!options || typeof options !== "object")
    throw new TypeError("browserAuth() needs options");
  const { clientName, clientInformation, launch = openBrowser } = options;
  // Bearer tokens travel to serverUrl: plaintext only to this machine.
  const serverHref = String(options.serverUrl);
  const serverUrl = URL.canParse(serverHref) ? new URL(serverHref) : undefined;
  if (
    !serverUrl ||
    !(
      serverUrl.protocol === "https:" ||
      (serverUrl.protocol === "http:" && isLoopbackHost(serverUrl))
    ) ||
    serverUrl.username ||
    serverUrl.password ||
    serverHref.includes("#")
  )
    throw new TypeError(
      "serverUrl must be an https: URL (http: only on a loopback host) without credentials or fragment",
    );
  if (options.redirectUri === undefined)
    throw new TypeError(
      "redirectUri is required, e.g. http://127.0.0.1:8765/callback",
    );
  const redirect = parseRedirectUri(options.redirectUri);
  if (
    clientName !== undefined &&
    (typeof clientName !== "string" || !clientName)
  )
    throw new TypeError("clientName must be a non-empty string");
  if (clientInformation !== undefined) {
    if (
      typeof clientInformation?.client_id !== "string" ||
      !clientInformation.client_id
    )
      throw new TypeError("clientInformation.client_id is required");
    if (
      typeof clientInformation.issuer !== "string" ||
      !clientInformation.issuer
    )
      throw new TypeError(
        "clientInformation.issuer is required: use the authorization_servers entry of the MCP server's protected-resource metadata",
      );
  } else if (clientName === undefined) {
    throw new TypeError(
      "clientName is required for dynamic client registration (or pass clientInformation)",
    );
  }
  if (typeof launch !== "function")
    throw new TypeError("launch must be a function");

  // Adapter-owned fields go last so untyped callers can't override them. grant_types and
  // application_type are left to the SDK's DCR defaults (no forced offline_access).
  const {
    client_name,
    redirect_uris,
    response_types,
    application_type,
    ...extra
  } = (options.clientMetadata ?? {}) as Partial<OAuthClientMetadata>;
  const metadata: OAuthClientMetadata = {
    ...extra,
    ...(clientName ? { client_name: clientName } : {}),
    redirect_uris: [redirect.href],
    response_types: ["code"],
  };

  return {
    serverUrl,
    redirect,
    metadata,
    staticClient: clientInformation,
    launch,
    timeout: checkTimeout(options.timeout),
    pages: checkPages(options),
  };
}

/**
 * Creates an MCP SDK `OAuthClientProvider` that authorizes in the system browser and
 * persists credentials in `store`.
 *
 * @example
 * ```ts
 * const auth = browserAuth({
 *   serverUrl: "https://mcp.notion.com/mcp",
 *   redirectUri: "http://127.0.0.1:8765/callback",
 *   clientName: "Acme CLI",
 *   store: fileStore(path.join(os.homedir(), ".config/acme/notion-mcp.json")),
 * });
 * await auth.connect(client);
 * ```
 */
export function browserAuth(options: BrowserAuthOptions): BrowserAuth {
  const config = resolveConfig(options);
  const store = options.store ?? memoryStore();
  if (typeof store?.load !== "function" || typeof store.save !== "function")
    throw new TypeError("store must implement load() and save()");
  const session = new Session(
    config,
    new CredentialSlot(store, config.serverUrl.href),
  );
  const owned = new WeakSet<object>();
  let queue: Promise<unknown> = Promise.resolve();

  /** connect() calls run one at a time; `signal` also covers waiting for a turn. */
  async function serialize(
    signal: AbortSignal | undefined,
    task: () => Promise<void>,
  ) {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => (release = resolve));
    const previous = queue;
    queue = previous.then(() => turn);
    try {
      await raceSignal(previous, signal);
      await task();
    } finally {
      release();
    }
  }

  /**
   * The caller's fetch, with OAuth traffic (discovery, DCR, token exchange) cancellable
   * through `owner.signal`. MCP traffic always targets `serverUrl` exactly and is left alone:
   * a long-lived SSE stream or a concurrent request must not inherit a connect() or flow signal.
   */
  function cancellable(
    owner: Owner,
    base: FetchLike = (url, init) => fetch(url, init),
  ): FetchLike {
    return (url, init) => {
      const signal = owner.signal;
      if (!signal || String(url) === config.serverUrl.href)
        return base(url, init);
      return base(url, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
      });
    };
  }

  const connect: BrowserAuth["connect"] = async (client, options = {}) => {
    const { transportOptions, ...connectOptions } = options;
    const { signal } = connectOptions;
    signal?.throwIfAborted();

    await serialize(signal, async () => {
      for (let attempt = 0; ; attempt++) {
        let pending = session.flow;
        // Reserved by one of our transports but still being prepared by the SDK: wait for it.
        if (pending?.owner.transport && !pending.result) {
          await raceSignal(pending.ready, signal);
          pending = session.flow;
        }
        // A flow redirected by one of our transports (initial 401, mid-session step-up, or a
        // concurrent request's flow) completes there: finishAuth needs that transport's state.
        if (pending?.result && pending.owner.transport)
          await session.complete(pending, pending.owner.transport, signal);

        // Already connected through this provider: tokens are shared, keep the session.
        // Never touch a connection we don't own.
        const current = client.transport;
        if (current && owned.has(current)) return;
        if (current)
          throw new Error(
            "client is connected over a transport browserAuth didn't create; use completeAuthorization(transport)",
          );

        const owner: Owner = { signal };
        const transport = new StreamableHTTPClientTransport(config.serverUrl, {
          ...transportOptions,
          fetch: cancellable(owner, transportOptions?.fetch),
          authProvider: session.provider(owner),
        });
        owner.transport = transport;
        owned.add(transport);

        try {
          // The SDK doesn't forward the signal to every handshake request (e.g. the
          // initialized notification), and cancellable() leaves MCP traffic alone.
          await raceSignal(client.connect(transport, connectOptions), signal);
          owner.signal = undefined; // the connection outlives this call's signal
          return;
        } catch (error) {
          // client.connect() may have dropped the transport already; close it either way.
          await (
            client.transport === transport ? client.close() : transport.close()
          ).catch(() => {});
          const flow = session.flow;
          const resumable =
            attempt === 0 &&
            error instanceof UnauthorizedError &&
            flow?.result &&
            flow.owner.transport;
          // A flow this attempt started but won't complete must not block the next one.
          if (!resumable) {
            owner.abandoned = true;
            if (flow?.owner === owner && !flow.completing) session.end(flow);
            // The SDK wraps an aborted handshake in SdkError; cancellation surfaces as its reason.
            signal?.throwIfAborted();
            throw error;
          }
        }
      }
    });
  };

  const completeAuthorization: BrowserAuth["completeAuthorization"] = async (
    transport,
    options = {},
  ) => {
    options.signal?.throwIfAborted();
    const flow = session.flow;
    if (!flow?.result)
      throw new Error("No MCP authorization is waiting to be completed");
    if (flow.owner !== session.external)
      throw new Error(
        "This authorization was started by connect(); call connect(client) to complete it",
      );
    await session.complete(flow, transport, options.signal);
  };

  return Object.assign(session.provider(session.external), {
    connect,
    completeAuthorization,
  });
}
