/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { randomBytes } from "node:crypto";
import { openBrowser } from "./launch.js";
import {
  checkPages,
  isLoopbackHost,
  listenForCallback,
  parseRedirectUri,
  sameUrl,
  type RedirectUri,
} from "./loopback.js";

/**
 * Builds the authorization URL once the loopback listener is bound (ADR-007).
 * `redirect_uri` and `state` are appended when absent; if present they must match.
 * Required for PAR/JAR, where both must go into the pushed request.
 */
export type AuthorizationUrlBuilder = (ctx: {
  /** Bound redirect URI, e.g. `http://127.0.0.1:53124/callback`. */
  redirectUri: URL;
  /** 32 random bytes, base64url. */
  state: string;
  /** Aborted on timeout or cancellation; pass it to any `fetch` (e.g. PAR). */
  signal: AbortSignal;
}) => string | URL | Promise<string | URL>;

export interface GetAuthCodeOptions {
  /**
   * Loopback redirect URI to listen on. Builder form: defaults to `http://127.0.0.1:0/callback`
   * (port 0 = OS-assigned). URL form: taken from the URL's `redirect_uri`; required when absent.
   */
  redirectUri?: string | URL;
  /**
   * Opens the final authorization URL. Defaults to the system browser. Fulfillment is ignored;
   * a rejection (or throw) fails the flow. Use it for headless/SSH, QR codes, webviews or tests.
   */
  launch?: (url: URL) => unknown;
  /** Milliseconds for the whole attempt; integer in [1, 2_147_483_647]. Default 300_000 (5 min). */
  timeout?: number;
  signal?: AbortSignal;
  /** Static HTML served after a successful callback. */
  successHtml?: string;
  /** Static HTML served after an error callback. */
  errorHtml?: string;
}

export interface AuthorizationCodeResult {
  code: string;
  /**
   * Exact redirect URI of this flow, never re-serialized. When the authorization request
   * carried `redirect_uri` (always in builder form), send this value verbatim in the token
   * request (RFC 6749 §4.1.3). For a URL without `redirect_uri` it is the `redirectUri`
   * option the library listened on.
   */
  redirectUri: string;
  /** Full callback query (`iss`, `scope`, extensions, …). */
  params: URLSearchParams;
}

/** The authorization server returned an OAuth error through the loopback callback. */
export class OAuthCallbackError extends Error {
  override readonly name = "OAuthCallbackError";
  readonly error: string;
  /** Untrusted provider text. */
  readonly description?: string;
  /** Untrusted provider text. */
  readonly uri?: string;
  readonly params: URLSearchParams;

  constructor(params: URLSearchParams) {
    const error = params.get("error") ?? "";
    const description = params.get("error_description") ?? undefined;
    super(description ? `${error}: ${description}` : error);
    this.error = error;
    this.description = description;
    this.uri = params.get("error_uri") ?? undefined;
    this.params = params;
  }
}

const DEFAULT_REDIRECT_URI = "http://127.0.0.1:0/callback";

/** Validates `timeout`. Values ≥ 2³¹ ms make Node and Deno fire `AbortSignal.timeout()` almost at once. */
export function checkTimeout(timeout: unknown = 300_000): number {
  if (typeof timeout !== "number")
    throw new TypeError("timeout must be a number of milliseconds");
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2 ** 31 - 1)
    throw new RangeError("timeout must be an integer in [1, 2147483647] ms");
  return timeout;
}

export const generateState = () => randomBytes(32).toString("base64url");

/**
 * `AbortSignal.timeout()` that can be cleared: on Deno a pending one with listeners keeps
 * the process alive until it fires. The timer is unref'd, so it never holds a process open.
 */
export function deadline(ms: number): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const timer: unknown = setTimeout(
    () =>
      controller.abort(
        new DOMException("The operation timed out.", "TimeoutError"),
      ),
    ms,
  );
  if (typeof timer === "number")
    (
      globalThis as { Deno?: { unrefTimer(id: number): void } }
    ).Deno?.unrefTimer(timer);
  else (timer as { unref?(): void }).unref?.();
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer as number),
  };
}

// Parameters whose value the library interprets; a duplicate would leave it ambiguous.
const INTERPRETED = [
  "state",
  "redirect_uri",
  "response_type",
  "response_mode",
  "request",
  "request_uri",
];

/**
 * Checks every authorization URL before any launcher sees it: it must be safe to open
 * and able to deliver a code to a GET query callback.
 */
export function checkAuthorizationUrl(input: string | URL): URL {
  const href = String(input);
  const fail = (reason: string): never => {
    throw new TypeError(`Invalid authorization URL: ${reason}`);
  };
  if (!URL.canParse(href)) fail("not a URL");
  const url = new URL(href);
  const params = url.searchParams;
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHost(url))
  )
    fail("must use https: (http: only on a loopback host)");
  if (href.includes("#")) fail("must not contain a fragment");
  if (url.username || url.password) fail("must not contain credentials");
  for (const key of INTERPRETED)
    if (params.getAll(key).length > 1) fail(`duplicate ${key}`);
  const responseType = params.get("response_type");
  if (responseType !== null && responseType !== "code")
    fail(`response_type must be "code", got "${responseType}"`);
  const responseMode = params.get("response_mode");
  if (responseMode !== null && responseMode !== "query")
    fail(`response_mode must be "query", got "${responseMode}"`);
  return url;
}

/** Appends one parameter without re-serializing the existing query (keeps e.g. `%20` as is). */
export function appendParam(url: URL, key: string, value: string): URL {
  const next = new URL(url);
  next.search = `${next.search || "?"}${next.search ? "&" : ""}${key}=${encodeURIComponent(value)}`;
  return next;
}

/** Settles with `promise`, or rejects with `signal.reason` once the signal aborts. */
export function raceSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    // Always observed, so a promise that loses the race can't become an unhandled rejection.
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Starts the launcher. Only a rejection (or sync throw) settles the returned promise. */
export function launchUrl(
  launch: (url: URL) => unknown,
  url: URL,
): Promise<never> {
  return new Promise((_, reject) => {
    Promise.resolve()
      .then(() => launch(new URL(url)))
      .catch(reject);
  });
}

interface Flow {
  url: URL;
  /** The `redirect_uri` sent, or the listened URI when none was sent. */
  redirectUri: string;
}

/** URL form: listen on its `redirect_uri` (or `options.redirectUri`); add `state` if missing. */
function prepareUrl(
  authorization: string | URL,
  redirectOption: string | URL | undefined,
): Flow & { redirect: RedirectUri; state: string } {
  let url = checkAuthorizationUrl(authorization);
  const params = url.searchParams;
  if (params.has("request") || params.has("request_uri"))
    throw new TypeError(
      "PAR/JAR authorization URLs carry state and redirect_uri inside the request object; " +
        "use the builder form: getAuthCode(({ redirectUri, state }) => …)",
    );

  const option =
    redirectOption === undefined ? undefined : parseRedirectUri(redirectOption);
  const sent = params.get("redirect_uri");
  const redirect = sent === null ? option : parseRedirectUri(sent);
  if (!redirect)
    throw new TypeError(
      "The authorization URL has no redirect_uri; pass the redirectUri option",
    );
  if (option && !sameUrl(option.href, redirect.url))
    throw new TypeError(
      `redirectUri option "${option.href}" differs from redirect_uri "${sent}"`,
    );

  let state = params.get("state");
  if (state === "")
    throw new TypeError("Invalid authorization URL: empty state");
  if (state === null)
    url = appendParam(url, "state", (state = generateState()));
  return { url, redirect, state, redirectUri: sent ?? redirect.href };
}

/** Builder form: validate the returned URL against the bound listener and generated state. */
function finishBuiltUrl(
  built: string | URL,
  bound: URL,
  boundHref: string,
  state: string,
): Flow {
  let url = checkAuthorizationUrl(built);
  const params = url.searchParams;
  // PAR/JAR: state and redirect_uri live in the request object; outer copies are optional.
  const pushed = params.has("request") || params.has("request_uri");

  const sentState = params.get("state");
  if (sentState !== null && sentState !== state)
    throw new TypeError(
      "The built authorization URL must use the provided state",
    );
  const sent = params.get("redirect_uri");
  if (sent !== null && !sameUrl(sent, bound))
    throw new TypeError(
      `The built authorization URL must use redirect_uri "${boundHref}"`,
    );

  if (!pushed && sent === null)
    url = appendParam(url, "redirect_uri", boundHref);
  if (!pushed && sentState === null) url = appendParam(url, "state", state);
  return { url, redirectUri: sent ?? boundHref };
}

/**
 * Captures an OAuth authorization code on a loopback redirect URI.
 *
 * @example
 * ```ts
 * const { code, redirectUri } = await getAuthCode(({ redirectUri, state }) => {
 *   const url = new URL("https://github.com/login/oauth/authorize");
 *   url.searchParams.set("client_id", CLIENT_ID);
 *   return url; // redirect_uri and state are appended
 * });
 * ```
 * @throws {OAuthCallbackError} The authorization server returned an error.
 * @throws {TypeError} Invalid URL, redirect URI or option (before launch; for options and a prebuilt URL, before binding).
 * @throws The composed signal's `reason` on abort or timeout (`name === "TimeoutError"`).
 */
export async function getAuthCode(
  authorization: string | URL | AuthorizationUrlBuilder,
  options: GetAuthCodeOptions = {},
): Promise<AuthorizationCodeResult> {
  const { launch = openBrowser, successHtml, errorHtml } = options;
  options.signal?.throwIfAborted();
  const timeout = checkTimeout(options.timeout);
  if (typeof launch !== "function")
    throw new TypeError("launch must be a function");
  checkPages(options);

  const builder =
    typeof authorization === "function" ? authorization : undefined;
  const prebuilt = builder
    ? undefined
    : prepareUrl(authorization as string | URL, options.redirectUri);
  const redirect =
    prebuilt?.redirect ??
    parseRedirectUri(options.redirectUri ?? DEFAULT_REDIRECT_URI, {
      allowEphemeralPort: true,
    });
  const state = prebuilt?.state ?? generateState();

  // One signal drives every stage; timeout/abort always surface as its reason.
  const timer = deadline(timeout);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timer.signal])
    : timer.signal;

  const listener = await listenForCallback(redirect.url, state, {
    successHtml,
    errorHtml,
  }).catch((error) => {
    timer.clear();
    throw error;
  });
  try {
    let flow: Flow | undefined = prebuilt;
    if (builder) {
      signal.throwIfAborted();
      // Port 0 resolves to the bound port; otherwise the caller's exact string is kept.
      const boundHref =
        redirect.url.port === "0" ? listener.url.href : redirect.href;
      const ctx = { redirectUri: new URL(listener.url), state, signal };
      const built = await raceSignal(
        Promise.resolve().then(() => builder(ctx)),
        signal,
      );
      flow = finishBuiltUrl(built, listener.url, boundHref, state);
    }
    signal.throwIfAborted();

    const params = await raceSignal(
      Promise.race([listener.callback, launchUrl(launch, flow!.url)]),
      signal,
    );
    const code = params.get("code");
    if (code === null) throw new OAuthCallbackError(params);
    return { code, redirectUri: flow!.redirectUri, params };
  } finally {
    timer.clear();
    await listener.close();
  }
}
