/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { describe, expect, test } from "bun:test";
import { getAuthCode, OAuthCallbackError } from "../src/index";
import { freePort, respond, sleep } from "./helpers";

const AUTHORIZE = "https://auth.example.com/authorize";

/** Builder that returns the plain authorize URL; the library appends redirect_uri and state. */
const build = () => new URL(`${AUTHORIZE}?client_id=app`);

describe("builder form", () => {
  test("binds 127.0.0.1 on an OS port and appends redirect_uri and state", async () => {
    let ctx:
      { redirectUri: URL; state: string; signal: AbortSignal } | undefined;
    let launched: URL | undefined;
    const result = await getAuthCode(
      (c) => {
        ctx = c;
        return build();
      },
      {
        launch: (url) => {
          launched = url;
          void respond(url);
        },
      },
    );

    expect(ctx!.redirectUri.hostname).toBe("127.0.0.1");
    expect(ctx!.redirectUri.port).not.toBe("0");
    expect(ctx!.redirectUri.pathname).toBe("/callback");
    expect(ctx!.state).toMatch(/^[\w-]{43}$/);
    expect(ctx!.signal).toBeInstanceOf(AbortSignal);
    expect(launched!.searchParams.get("redirect_uri")).toBe(
      ctx!.redirectUri.href,
    );
    expect(launched!.searchParams.get("state")).toBe(ctx!.state);
    expect(launched!.searchParams.get("client_id")).toBe("app");
    expect(result.code).toBe("test-code");
    expect(result.redirectUri).toBe(ctx!.redirectUri.href);
    expect(result.params.get("state")).toBe(ctx!.state);
  });

  test("keeps matching redirect_uri/state set by the builder", async () => {
    const result = await getAuthCode(
      ({ redirectUri, state }) => {
        const url = build();
        url.searchParams.set("redirect_uri", redirectUri.href);
        url.searchParams.set("state", state);
        return url.href;
      },
      {
        launch: (url) => {
          expect(url.searchParams.getAll("state")).toHaveLength(1);
          expect(url.searchParams.getAll("redirect_uri")).toHaveLength(1);
          void respond(url);
        },
      },
    );
    expect(result.code).toBe("test-code");
  });

  test("does not append redirect_uri/state to a PAR request_uri", async () => {
    let launched: URL | undefined;
    let redirect: URL | undefined;
    const result = getAuthCode(
      ({ redirectUri }) => {
        redirect = redirectUri;
        return `${AUTHORIZE}?client_id=app&request_uri=urn:example:par`;
      },
      {
        launch: (url) => {
          launched = url;
          throw new Error("stop");
        },
      },
    );
    await expect(result).rejects.toThrow("stop");
    expect(launched!.searchParams.has("state")).toBe(false);
    expect(launched!.searchParams.has("redirect_uri")).toBe(false);
    expect(redirect).toBeDefined();
  });

  test("rejects a built URL with a different state or redirect_uri", async () => {
    let launched = false;
    const launch = () => void (launched = true);
    await expect(
      getAuthCode(() => `${AUTHORIZE}?state=other`, { launch }),
    ).rejects.toThrow(TypeError);
    await expect(
      getAuthCode(() => `${AUTHORIZE}?redirect_uri=http://127.0.0.1:1/other`, {
        launch,
      }),
    ).rejects.toThrow(TypeError);
    expect(launched).toBe(false);
  });

  test("uses a custom redirect URI with an ephemeral port", async () => {
    const result = await getAuthCode(build, {
      redirectUri: "http://[::1]:0/oauth/cb?tenant=a",
      launch: (url) => void respond(url),
    });
    const redirect = new URL(result.redirectUri);
    expect(redirect.hostname).toBe("[::1]");
    expect(redirect.pathname).toBe("/oauth/cb");
    expect(redirect.searchParams.get("tenant")).toBe("a");
  });

  test("a slow builder hits the timeout and never launches", async () => {
    let launched = false;
    const error = await getAuthCode(
      async () => {
        await sleep(200);
        return build();
      },
      { timeout: 50, launch: () => void (launched = true) },
    ).catch((e) => e);
    expect(error.name).toBe("TimeoutError");
    await sleep(200);
    expect(launched).toBe(false);
  });

  test("a throwing builder closes the listener", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    await expect(
      getAuthCode(
        () => {
          throw new Error("builder failed");
        },
        { redirectUri },
      ),
    ).rejects.toThrow("builder failed");
    // The same port binds again, so the listener was closed.
    const result = await getAuthCode(build, {
      redirectUri,
      launch: (url) => void respond(url),
    });
    expect(result.code).toBe("test-code");
  });
});

describe("URL form", () => {
  test("appends one state, keeps other parameters, adds no redirect_uri", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const input = `${AUTHORIZE}?client_id=app&scope=a%20b&x=1&x=2`;
    let launched: URL | undefined;
    const result = await getAuthCode(input, {
      redirectUri,
      launch: (url) => {
        launched = url;
        const target = new URL(redirectUri);
        target.searchParams.set("code", "c");
        target.searchParams.set("state", url.searchParams.get("state")!);
        void fetch(target);
      },
    });
    expect(result.redirectUri).toBe(redirectUri);
    expect(launched!.searchParams.has("redirect_uri")).toBe(false);
    expect(launched!.searchParams.getAll("state")).toHaveLength(1);
    // Existing bytes are kept: no `%20` → `+` re-encoding.
    expect(launched!.href.startsWith(input + "&state=")).toBe(true);
  });

  test("uses the URL's state and redirect_uri", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const url = `${AUTHORIZE}?redirect_uri=${encodeURIComponent(redirectUri)}&state=mine`;
    const result = await getAuthCode(url, { launch: (u) => void respond(u) });
    expect(result.params.get("state")).toBe("mine");
  });

  test("returns redirect_uri exactly as sent, never re-serialized", async () => {
    const port = await freePort();
    const sent = `http://LOCALHOST:${port}/callback`;
    const url = `${AUTHORIZE}?redirect_uri=${encodeURIComponent(sent)}`;
    const result = await getAuthCode(url, {
      redirectUri: `http://localhost:${port}/callback`,
      launch: (u) => void respond(u),
    });
    expect(result.redirectUri).toBe(sent);
  });

  test("rejects invalid input before binding", async () => {
    const port = await freePort();
    const redirect = encodeURIComponent(`http://127.0.0.1:${port}/callback`);
    const invalid = [
      `${AUTHORIZE}?client_id=app`, // no redirect_uri, no option
      `${AUTHORIZE}?redirect_uri=${redirect}&redirect_uri=${redirect}`,
      `${AUTHORIZE}?redirect_uri=${redirect}&request_uri=urn:par`,
      `${AUTHORIZE}?redirect_uri=${redirect}&request=eyJ&state=s`,
      `${AUTHORIZE}?redirect_uri=${redirect}&state=`,
      `${AUTHORIZE}?redirect_uri=${redirect}&state=a&state=b`,
      `${AUTHORIZE}?redirect_uri=${encodeURIComponent(`http://127.0.0.1:0/callback`)}`,
      `${AUTHORIZE}?redirect_uri=${encodeURIComponent(`http://example.com:${port}/cb`)}`,
    ];
    for (const url of invalid) {
      let launched = false;
      await expect(
        getAuthCode(url, { launch: () => void (launched = true) }),
      ).rejects.toThrow(TypeError);
      expect(launched).toBe(false);
    }
    await expect(
      getAuthCode(`${AUTHORIZE}?redirect_uri=${redirect}`, {
        redirectUri: `http://127.0.0.1:${port}/other`,
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("authorization URL validation", () => {
  const invalid = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://auth.example.com/authorize",
    `${AUTHORIZE}#frag`,
    "https://user:pass@auth.example.com/authorize",
    `${AUTHORIZE}?response_type=token`,
    `${AUTHORIZE}?response_type=code%20id_token`,
    `${AUTHORIZE}?response_type=code&response_type=code`,
    `${AUTHORIZE}?response_mode=form_post`,
    `${AUTHORIZE}?response_mode=fragment`,
    `${AUTHORIZE}?response_mode=query&response_mode=query`,
    `${AUTHORIZE}?request_uri=a&request_uri=b`,
    `${AUTHORIZE}?request=a&request=b`,
  ];

  for (const url of invalid)
    test(`rejects ${url} for default and custom launchers`, async () => {
      await expect(getAuthCode(() => url)).rejects.toThrow(TypeError);
      await expect(
        getAuthCode(() => url, { launch: () => {} }),
      ).rejects.toThrow(TypeError);
    });

  test("accepts http: on a loopback authorization server", async () => {
    const result = await getAuthCode(
      () => "http://127.0.0.1:9/authorize?response_type=code",
      {
        launch: (url) => void respond(url),
      },
    );
    expect(result.code).toBe("test-code");
  });

  test("rejects invalid redirect URIs", async () => {
    for (const redirectUri of [
      "https://127.0.0.1:0/cb",
      "http://example.com:0/cb",
      "http://127.0.0.1:0/cb#x",
      "http://u:p@127.0.0.1:0/cb",
      "http://127.0.0.1:0/cb?a=1&a=2",
      "not a url",
    ])
      await expect(getAuthCode(build, { redirectUri })).rejects.toThrow(
        TypeError,
      );
  });
});

describe("options", () => {
  test("timeout must be an integer in [1, 2^31 - 1]", async () => {
    await expect(
      getAuthCode(build, { timeout: "300" as never }),
    ).rejects.toThrow(TypeError);
    for (const timeout of [0, -1, 1.5, NaN, Infinity, 2 ** 31])
      await expect(getAuthCode(build, { timeout })).rejects.toThrow(RangeError);
  });

  test("launch must be a function", async () => {
    await expect(
      getAuthCode(build, { launch: false as never }),
    ).rejects.toThrow(TypeError);
  });

  test("launch accepts functions returning anything", () => {
    // Type-level: both must compile.
    const open = (_: string) => Promise.resolve({ pid: 1 });
    const options: Parameters<typeof getAuthCode>[1][] = [
      { launch: (url) => open(url.href) },
      { launch: (url) => console.log(url) },
    ];
    expect(options).toHaveLength(2);
  });
});

describe("callbacks", () => {
  test("invalid callbacks get 400 and the flow keeps waiting", async () => {
    const statuses: number[] = [];
    const result = await getAuthCode(build, {
      launch: async (url) => {
        const redirect = url.searchParams.get("redirect_uri")!;
        const state = url.searchParams.get("state")!;
        const invalid = [
          `code=abc&error=access_denied&state=${state}`,
          `code=abc&error=&state=${state}`,
          `code=&error=access_denied&state=${state}`,
          `code=&state=${state}`,
          `code=a&code=b&state=${state}`,
          `error=a&error=b&state=${state}`,
          `error=a&error_description=x&error_description=y&state=${state}`,
          `error=a&error_uri=x&error_uri=y&state=${state}`,
          `code=a&iss=x&iss=y&state=${state}`,
          `code=abc&state=${state}&state=${state}`,
          `code=abc&state=stale`,
          `code=abc`,
          ``,
        ];
        for (const query of invalid)
          statuses.push((await fetch(`${redirect}?${query}`)).status);
        statuses.push(
          (
            await fetch(
              `${new URL(redirect).origin}/other?code=a&state=${state}`,
            )
          ).status,
        );
        statuses.push(
          (await fetch(`${redirect}?code=a&state=${state}`, { method: "POST" }))
            .status,
        );
        await respond(url, { code: "valid", scope: "read", ext: "1" });
      },
    });
    expect(statuses).toEqual([...Array(13).fill(400), 404, 405]);
    expect(result.code).toBe("valid");
    expect(result.params.get("scope")).toBe("read");
    expect(result.params.get("ext")).toBe("1");
  });

  test("a malformed request target gets 400 and the flow keeps waiting", async () => {
    const { connect } = await import("node:net");
    let reply = "";
    const result = await getAuthCode(build, {
      launch: async (url) => {
        const { port } = new URL(url.searchParams.get("redirect_uri")!);
        reply = await new Promise<string>((resolve) => {
          const socket = connect(Number(port), "127.0.0.1", () =>
            socket.write(
              "GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
            ),
          );
          let data = "";
          socket.on("data", (chunk) => (data += chunk));
          socket.on("close", () => resolve(data));
        });
        await respond(url);
      },
    });
    expect(reply).toStartWith("HTTP/1.1 400");
    expect(result.code).toBe("test-code");
  });

  test("callback must carry the redirect URI's own query parameters", async () => {
    let status = 0;
    const result = await getAuthCode(build, {
      redirectUri: "http://127.0.0.1:0/cb?tenant=a",
      launch: async (url) => {
        const target = new URL(url.searchParams.get("redirect_uri")!);
        target.searchParams.set("tenant", "b");
        target.searchParams.set("code", "x");
        target.searchParams.set("state", url.searchParams.get("state")!);
        status = (await fetch(target)).status;
        await respond(url);
      },
    });
    expect(status).toBe(400);
    expect(result.code).toBe("test-code");
  });

  test("error callback rejects with OAuthCallbackError", async () => {
    const error = await getAuthCode(build, {
      launch: (url) =>
        void respond(url, {
          error: "access_denied",
          error_description: "User said no",
          error_uri: "https://example.com/e",
        }),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(OAuthCallbackError);
    expect(error.name).toBe("OAuthCallbackError");
    expect(error.error).toBe("access_denied");
    expect(error.description).toBe("User said no");
    expect(error.uri).toBe("https://example.com/e");
    expect(error.message).toBe("access_denied: User said no");
    expect(error.params.get("error")).toBe("access_denied");
  });
});

describe("pages", () => {
  const HEADERS = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };

  test("no response echoes callback data; security headers on every response", async () => {
    const responses: Response[] = [];
    const marker = "<script>x</script>";
    let work: Promise<void> | undefined;
    await getAuthCode(build, {
      launch: (url) =>
        void (work = (async () => {
          const redirect = url.searchParams.get("redirect_uri")!;
          responses.push(
            await fetch(`${redirect}?code=${encodeURIComponent(marker)}`),
          );
          responses.push(await fetch(`${new URL(redirect).origin}/missing`));
          responses.push(await respond(url, { code: marker }));
        })()),
    });
    await work;
    await getAuthCode(build, {
      launch: (url) =>
        void (work = respond(url, {
          error: marker,
          error_description: marker,
        }).then((r) => void responses.push(r))),
    }).catch(() => {});
    await work;

    expect(responses.map((r) => r.status)).toEqual([400, 404, 200, 200]);
    for (const response of responses) {
      expect(await response.text()).not.toContain("script");
      for (const [key, value] of Object.entries(HEADERS))
        expect(response.headers.get(key)).toBe(value);
      expect(response.headers.get("content-security-policy")).toContain(
        "default-src 'none'",
      );
    }
  });

  test("serves successHtml and errorHtml verbatim", async () => {
    let body: Promise<string> | undefined;
    await getAuthCode(build, {
      successHtml: "<p>ok</p>",
      launch: (url) => void (body = respond(url).then((r) => r.text())),
    });
    expect(await body!).toBe("<p>ok</p>");
    await getAuthCode(build, {
      errorHtml: "<p>bad</p>",
      launch: (url) =>
        void (body = respond(url, { error: "x" }).then((r) => r.text())),
    }).catch(() => {});
    expect(await body!).toBe("<p>bad</p>");
  });
});

describe("lifecycle", () => {
  test("launchers that fulfill keep waiting for the callback", async () => {
    for (const make of [
      (url: URL) => () => void setTimeout(() => respond(url), 20),
      (url: URL) => async () => void setTimeout(() => respond(url), 20),
    ]) {
      const result = await getAuthCode(build, { launch: (url) => make(url)() });
      expect(result.code).toBe("test-code");
    }
  });

  test("a rejecting or throwing launcher fails the flow with its error", async () => {
    const err = new Error("no browser");
    await expect(
      getAuthCode(build, { launch: () => Promise.reject(err) }),
    ).rejects.toBe(err);
    await expect(
      getAuthCode(build, {
        launch: () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });

  test("valid callback, then launcher rejects: success stands", async () => {
    const result = await getAuthCode(build, {
      launch: async (url) => {
        await respond(url);
        throw new Error("late launcher failure");
      },
    });
    expect(result.code).toBe("test-code");
  });

  test("valid callback, then the deadline passes during cleanup: success stands", async () => {
    const result = await getAuthCode(build, {
      timeout: 100,
      launch: async (url) => {
        const response = await respond(url);
        await sleep(150); // keep the page response open past the deadline
        await response.text();
      },
    });
    expect(result.code).toBe("test-code");
  });

  test("launcher rejects, then callback arrives: launcher error stands", async () => {
    const err = new Error("launch failed");
    const result = getAuthCode(build, {
      launch: (url) => {
        setTimeout(() => respond(url).catch(() => {}), 20);
        return Promise.reject(err);
      },
    });
    await expect(result).rejects.toBe(err);
  });

  test("abort before start rejects with the reason", async () => {
    const reason = new Error("cancelled");
    await expect(
      getAuthCode(build, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
  });

  test("abort right after the call: the builder never runs", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    let built = false;
    const result = getAuthCode(
      ({ signal }) => {
        built = true;
        signal.throwIfAborted();
        return build();
      },
      { signal: controller.signal, launch: () => {} },
    );
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(built).toBe(false);
  });

  test("abort while the builder runs: late result never launches", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    let launched = false;
    const result = getAuthCode(
      async () => {
        controller.abort(reason);
        await sleep(20);
        return build();
      },
      { signal: controller.signal, launch: () => void (launched = true) },
    );
    await expect(result).rejects.toBe(reason);
    await sleep(40);
    expect(launched).toBe(false);
  });

  test("abort while waiting: rejects, closes the listener, ignores the late callback", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    let launched: URL | undefined;
    const result = getAuthCode(build, {
      signal: controller.signal,
      launch: (url) => {
        launched = url;
        setTimeout(() => controller.abort(reason), 10);
      },
    });
    await expect(result).rejects.toBe(reason);
    await expect(respond(launched!)).rejects.toThrow(); // connection refused
  });

  test("timeout rejects with a TimeoutError DOMException", async () => {
    const error = await getAuthCode(build, {
      timeout: 30,
      launch: () => {},
    }).catch((e) => e);
    expect(error.name).toBe("TimeoutError");
    expect(error).toBeInstanceOf(DOMException);
  });

  test("port in use rejects immediately", async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    let launched: URL | undefined;
    const first = getAuthCode(build, {
      redirectUri,
      launch: (url) => void (launched = url),
    });
    await sleep(20);
    const error = await getAuthCode(build, {
      redirectUri,
      launch: () => {},
    }).catch((e) => e);
    expect(error.code).toBe("EADDRINUSE");
    await respond(launched!);
    await first;
  });
});
