/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Loopback redirect URI parsing and the one-shot callback listener (ADR-007, ADR-008).
 * A single `node:http` implementation serves Node, Deno and Bun.
 */

import { createServer, type ServerResponse } from "node:http";

/** A redirect URI kept twice: the original string (the OAuth value) and a parsed URL. */
export interface RedirectUri {
  /** Exactly as supplied; `new URL()` would canonicalize e.g. `:80` away. */
  readonly href: string;
  readonly url: URL;
}

export interface CallbackPages {
  successHtml?: string;
  errorHtml?: string;
}

/** Validates page overrides up front; a non-string would only fail inside the request handler. */
export function checkPages({
  successHtml,
  errorHtml,
}: CallbackPages): CallbackPages {
  for (const [name, html] of Object.entries({ successHtml, errorHtml }))
    if (html !== undefined && typeof html !== "string")
      throw new TypeError(`${name} must be a string`);
  return { successHtml, errorHtml };
}

export interface CallbackListener {
  /** The redirect URI with the bound port (differs from the input only for port 0). */
  readonly url: URL;
  /** First valid callback (code or error). Never rejects; callers race it against their signal. */
  readonly callback: Promise<URLSearchParams>;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export const isLoopbackHost = (url: URL) => LOOPBACK_HOSTS.has(url.hostname);

/** Validates a loopback redirect URI (RFC 8252 §7.3); throws `TypeError` before anything binds. */
export function parseRedirectUri(
  input: string | URL,
  { allowEphemeralPort = false } = {},
): RedirectUri {
  const href = typeof input === "string" ? input : input.href;
  const url = URL.canParse(href) ? new URL(href) : undefined;
  const fail = (reason: string) => {
    throw new TypeError(`Invalid redirect URI "${href}": ${reason}`);
  };
  if (!url) return fail("not a URL");
  if (url.protocol !== "http:") fail("must use http:");
  if (!isLoopbackHost(url)) fail("host must be 127.0.0.1, [::1] or localhost");
  if (href.includes("#")) fail("must not contain a fragment");
  if (url.username || url.password) fail("must not contain credentials");
  if (url.port === "0" && !allowEphemeralPort)
    fail(
      "port 0 is only allowed when the library builds the authorization URL",
    );
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) fail("duplicate query parameters");
  // The authorization server appends these; a preset one makes every callback ambiguous.
  const reserved = keys.find((key) => CALLBACK_PARAMS.includes(key));
  if (reserved) fail(`"${reserved}" is set by the authorization server`);
  return { href, url };
}

/** Parsed comparison: `http://127.0.0.1:80/cb` and `http://127.0.0.1/cb` are the same URI. */
export const sameUrl = (a: string, b: URL) =>
  URL.canParse(a) && new URL(a).href === b.href;

// Neutral pages: nothing from the callback is ever rendered (ADR-008). CSS only, the CSP forbids scripts.
const page = (title: string, message: string, icon: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:light-dark(#f5f5f5,#111);color:light-dark(#1a1a1a,#f5f5f5)}main{max-width:380px;margin:24px;padding:40px 32px;text-align:center;border-radius:16px;background:light-dark(#fff,#1e1e1e);box-shadow:0 6px 24px #0000001a}svg{width:48px;height:48px}h1{font-size:20px;margin:16px 0 8px}p{margin:0;opacity:.7}</style></head><body><main>${icon}<h1>${title}</h1><p>${message}</p></main></body></html>`;

const SUCCESS_PAGE = page(
  "Authorization complete",
  "Authorization response received. You can close this tab.",
  `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>`,
);

const ERROR_PAGE = page(
  "Authorization failed",
  "Authorization failed. Return to the application for details.",
  `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m9 9 6 6m0-6-6 6"/></svg>`,
);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const REJECTED =
  "This callback does not match a pending authorization request. You can close this tab.";

// Callback parameters: they decide the outcome or populate OAuthCallbackError, so each must
// be unambiguous, and a redirect URI can't preset them.
const CALLBACK_PARAMS = [
  "state",
  "code",
  "error",
  "error_description",
  "error_uri",
  "iss",
];

/**
 * Accepts a callback only when it is unambiguously this flow's: exact path, the redirect
 * URI's own query parameters, exactly one matching `state`, and either `code` or `error`
 * (key presence counts, so `?code=abc&error=` is invalid). Anything else gets a 400 and
 * the flow keeps waiting, so stray or stale requests can't end it (ADR-004).
 */
function isValidCallback(url: URL, expected: URL, state: string): boolean {
  if (url.pathname !== expected.pathname) return false;
  const params = url.searchParams;
  for (const [key, value] of expected.searchParams) {
    const values = params.getAll(key);
    if (values.length !== 1 || values[0] !== value) return false;
  }
  if (CALLBACK_PARAMS.some((key) => params.getAll(key).length > 1))
    return false;
  if (params.get("state") !== state) return false;
  return (
    params.has("code") !== params.has("error") &&
    !!(params.get("code") || params.get("error"))
  );
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": `${type}; charset=utf-8`,
  });
  res.end(body);
}

/**
 * Binds the redirect URI and resolves `callback` with the first valid callback for `state`.
 * Rejects on bind failure (e.g. `EADDRINUSE`). The caller owns every deadline.
 */
export async function listenForCallback(
  redirect: URL,
  state: string,
  pages: CallbackPages = {},
): Promise<CallbackListener> {
  let settle!: (params: URLSearchParams) => void;
  const callback = new Promise<URLSearchParams>(
    (resolve) => (settle = resolve),
  );
  let done = false;
  // Lets close() finish the page that completed the flow before dropping connections.
  let finalResponse: Promise<void> | undefined;

  const server = createServer((req, res) => {
    const url = URL.canParse(req.url ?? "", redirect.href)
      ? new URL(req.url!, redirect)
      : undefined;
    if (!url) return send(res, 400, "text/plain", REJECTED);
    if (url.pathname !== redirect.pathname)
      return send(res, 404, "text/plain", "Not Found");
    if (req.method !== "GET")
      return send(res, 405, "text/plain", "Method Not Allowed");
    if (done || !isValidCallback(url, redirect, state))
      return send(res, 400, "text/plain", REJECTED);

    done = true;
    finalResponse = new Promise((resolve) => res.once("close", resolve));
    const html = url.searchParams.has("error")
      ? (pages.errorHtml ?? ERROR_PAGE)
      : (pages.successHtml ?? SUCCESS_PAGE);
    send(res, 200, "text/html", html);
    settle(url.searchParams);
  });

  // `localhost` binds IPv4: browsers fall back to 127.0.0.1 when ::1 refuses (RFC 8252 §8.3).
  const host = redirect.hostname === "[::1]" ? "::1" : "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(redirect.port || 80), host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const url = new URL(redirect);
  const address = server.address();
  if (address && typeof address === "object") url.port = String(address.port);

  let closing: Promise<void> | undefined;
  const close = async () => {
    const closed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    // Bounded: a client that never reads the page must not hold the flow open.
    if (finalResponse) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        finalResponse,
        new Promise((r) => (timer = setTimeout(r, 1000))),
      ]);
      clearTimeout(timer);
    }
    server.closeAllConnections();
    await closed;
  };
  return { url, callback, close: () => (closing ??= close()) };
}
