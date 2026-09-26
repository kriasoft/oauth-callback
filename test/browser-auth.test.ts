/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import {
  AuthorizationServerMismatchError,
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  browserAuth,
  fileStore,
  type BrowserAuthOptions,
  type CredentialStore,
} from "../src/mcp/index";
import { freePort, sleep } from "./helpers";
import { startMockServer, type MockServer } from "./mock-mcp-server";

let mock: MockServer;
let redirectUri: string;
const clients: Client[] = [];

beforeEach(async () => {
  mock = await startMockServer();
  redirectUri = `http://127.0.0.1:${await freePort()}/callback`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
  await mock.close();
});

const newClient = () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  clients.push(client);
  return client;
};

/** Provider whose "browser" approves immediately. */
const setup = (options: Partial<BrowserAuthOptions> = {}) =>
  browserAuth({
    serverUrl: mock.mcpUrl,
    redirectUri,
    clientName: "Test CLI",
    launch: (url) => void mock.authorize(url),
    timeout: 5000,
    ...options,
  });

const memory = (): CredentialStore & { value?: string } => {
  const store: CredentialStore & { value?: string } = {
    load: async () => store.value,
    save: async (v) => void (store.value = v),
  };
  return store;
};

describe("connect()", () => {
  test("authorizes in the browser and connects", async () => {
    const auth = setup();
    const client = newClient();
    await auth.connect(client);
    expect(await client.listTools()).toEqual({ tools: [] });
    expect(mock.authorizeRequests).toHaveLength(1);
  });

  test("DCR carries the SDK's defaults; the adapter adds neither", async () => {
    const auth = setup();
    expect(auth.clientMetadata).toEqual({
      client_name: "Test CLI",
      redirect_uris: [redirectUri],
      response_types: ["code"],
    });
    await auth.connect(newClient());
    expect(mock.registrations[0]).toMatchObject({
      grant_types: ["authorization_code", "refresh_token"],
      application_type: "native",
      redirect_uris: [redirectUri],
    });
  });

  test("adapter-owned metadata can't be overridden by untyped callers", () => {
    const auth = setup({
      clientMetadata: {
        scope: "read",
        redirect_uris: ["https://evil"],
        client_name: "x",
      } as never,
    });
    expect(auth.clientMetadata).toEqual({
      scope: "read",
      client_name: "Test CLI",
      redirect_uris: [redirectUri],
      response_types: ["code"],
    });
  });

  test("offline_access only when the caller declares refresh_token", async () => {
    await mock.close();
    mock = await startMockServer({
      resourceScopes: ["read"],
      serverScopes: ["read", "offline_access"],
    });
    await setup().connect(newClient());
    expect(mock.authorizeRequests[0]!.searchParams.get("scope")).toBe("read");

    const other = setup({
      redirectUri: `http://127.0.0.1:${await freePort()}/callback`,
      clientMetadata: { grant_types: ["authorization_code", "refresh_token"] },
    });
    await other.connect(newClient());
    expect(
      mock.authorizeRequests[1]!.searchParams.get("scope")?.split(" "),
    ).toContain("offline_access");
  });

  test("a second process reuses stored credentials without a browser", async () => {
    const store = memory();
    await setup({ store }).connect(newClient());
    const second = setup({
      store,
      launch: () => Promise.reject(new Error("browser opened")),
    });
    await second.connect(newClient());
    expect(mock.authorizeRequests).toHaveLength(1);
  });

  test("an expired access token is refreshed with the stored refresh token", async () => {
    const store = memory();
    await setup({ store }).connect(newClient());
    const doc = JSON.parse(store.value!);
    doc.tokens.access_token = "expired";
    store.value = JSON.stringify(doc);

    const second = setup({
      store,
      launch: () => Promise.reject(new Error("browser opened")),
    });
    const client = newClient();
    await second.connect(client);
    expect(await client.listTools()).toEqual({ tools: [] });
    expect(mock.tokenRequests.at(-1)!.get("grant_type")).toBe("refresh_token");
    expect(JSON.parse(store.value!).tokens.access_token).not.toBe("expired");
  });

  test("discovery written by another attempt doesn't leak into a pending flow", async () => {
    let auth!: ReturnType<typeof setup>;
    auth = setup({
      launch: (url) => {
        auth.saveDiscoveryState!({
          authorizationServerUrl: "https://other-as.example.com/",
        });
        void mock.authorize(url);
      },
    });
    await auth.connect(newClient());
  });

  test("a hung launcher doesn't block the flow", async () => {
    const auth = setup({
      launch: (url) => {
        void mock.authorize(url);
        return new Promise(() => {});
      },
    });
    await auth.connect(newClient());
  });

  test("a rejecting launcher fails connect() with its error, then the next flow works", async () => {
    const err = new Error("no browser");
    let fail = true;
    const auth = setup({
      launch: (url) => (fail ? Promise.reject(err) : void mock.authorize(url)),
    });
    await expect(auth.connect(newClient())).rejects.toBe(err);
    fail = false;
    await auth.connect(newClient());
  });

  test("an error callback with a foreign iss never surfaces its description", async () => {
    const auth = setup({
      launch: (url) =>
        void mock.authorize(url, {
          code: "",
          error: "access_denied",
          error_description: "EVIL TEXT",
          iss: "https://evil.example.com",
        }),
    });
    const error = await auth.connect(newClient()).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error.message)).not.toContain("EVIL TEXT");
  });

  test("an error callback from the real issuer surfaces the SDK OAuthError", async () => {
    const auth = setup({
      launch: (url) =>
        void mock.authorize(url, { code: "", error: "access_denied" }),
    });
    const error = await auth.connect(newClient()).catch((e) => e);
    expect(error.code ?? error.error).toBe("access_denied");
  });

  test("a failed exchange releases the flow", async () => {
    const auth = setup();
    mock.knobs.tokenError = "server_error";
    await expect(auth.connect(newClient())).rejects.toThrow();
    await auth.connect(newClient());
  });

  test("timeout rejects with TimeoutError and releases the flow", async () => {
    let respond = false;
    const auth = setup({
      timeout: 100,
      launch: (url) => void (respond && mock.authorize(url)),
    });
    const error = await auth.connect(newClient()).catch((e) => e);
    expect(error.name).toBe("TimeoutError");
    respond = true;
    await auth.connect(newClient());
  });

  test("abort during the browser wait rejects promptly and releases the flow", async () => {
    let respond = false;
    const auth = setup({
      launch: (url) => void (respond && mock.authorize(url)),
    });
    const controller = new AbortController();
    const reason = new Error("cancelled");
    setTimeout(() => controller.abort(reason), 50);
    const started = Date.now();
    await expect(
      auth.connect(newClient(), { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(1000);
    respond = true;
    await auth.connect(newClient());
  });

  test("abort during a slow registration never opens the browser later", async () => {
    mock.knobs.registerDelay = 200;
    let launched = false;
    const auth = setup({ launch: () => void (launched = true) });
    const controller = new AbortController();
    const reason = new Error("cancelled");
    setTimeout(() => controller.abort(reason), 50);
    await expect(
      auth.connect(newClient(), { signal: controller.signal }),
    ).rejects.toBe(reason);
    await sleep(300);
    expect(launched).toBe(false);
    expect(await auth.state!()).toBeString(); // no flow left behind
  });

  test("an already aborted signal rejects before any side effect", async () => {
    const auth = setup();
    const reason = new Error("cancelled");
    await expect(
      auth.connect(newClient(), { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(mock.registrations).toHaveLength(0);
  });

  test("a hung token endpoint is aborted when the flow times out; the next flow works", async () => {
    mock.knobs.tokenDelay = 10_000;
    const auth = setup({ timeout: 300 });
    const started = Date.now();
    await expect(auth.connect(newClient())).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
    mock.knobs.tokenDelay = 0;
    await auth.connect(newClient());
  });

  test("concurrent connect() calls are serialized: one browser trip, one registration", async () => {
    const auth = setup();
    await Promise.all([auth.connect(newClient()), auth.connect(newClient())]);
    expect(mock.authorizeRequests).toHaveLength(1);
    expect(mock.registrations).toHaveLength(1);
  });

  test("the connect() signal bounds OAuth requests, not the SSE stream it outlives", async () => {
    const controller = new AbortController();
    const requests: { url: string; method?: string; signal?: AbortSignal }[] =
      [];
    const auth = setup();
    await auth.connect(newClient(), {
      signal: controller.signal,
      transportOptions: {
        fetch: (url, init) => {
          requests.push({
            url: String(url),
            method: init?.method,
            signal: init?.signal ?? undefined,
          });
          return fetch(url, init);
        },
      },
    });
    controller.abort();
    const sse = requests.find(
      (r) => r.url === mock.mcpUrl && r.method === "GET",
    );
    expect(sse).toBeDefined();
    expect(sse!.signal?.aborted).not.toBe(true);
    const oauth = requests.filter((r) => r.url !== mock.mcpUrl);
    expect(oauth.every((r) => r.signal?.aborted)).toBe(true);
  });

  test("abort while the handshake stalls rejects promptly and frees the queue", async () => {
    const auth = setup();
    await auth.connect(newClient());
    const controller = new AbortController();
    const stalled = auth.connect(newClient(), {
      signal: controller.signal,
      transportOptions: {
        fetch: (url, init) =>
          String(init?.body).includes("notifications/initialized")
            ? new Promise((_, reject) =>
                init!.signal!.addEventListener("abort", () =>
                  reject(init!.signal!.reason),
                ),
              )
            : fetch(url, init),
      },
    });
    await sleep(100);
    controller.abort(new Error("cancelled"));
    await expect(stalled).rejects.toThrow("cancelled");
    await auth.connect(newClient());
  });

  test("refuses to close a caller-owned transport", async () => {
    const auth = setup();
    const client = newClient();
    const store = memory();
    await setup({ store }).connect(newClient());
    const authed = setup({ store });
    const transport = new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
      authProvider: authed,
    });
    await client.connect(transport);
    await expect(auth.connect(client)).rejects.toThrow(/completeAuthorization/);
    expect(client.transport).toBe(transport);
    expect(await client.listTools()).toEqual({ tools: [] });
  });

  test("is a no-op for a client it already connected", async () => {
    const auth = setup();
    const client = newClient();
    await auth.connect(client);
    const first = client.transport;
    await auth.connect(client);
    expect(client.transport).toBe(first);
    expect(await client.listTools()).toEqual({ tools: [] });
  });

  test("concurrent step-ups: every request can retry after connect()", async () => {
    const auth = setup();
    const client = newClient();
    await auth.connect(client);
    mock.knobs.requiredScope = "admin";
    const retried = await Promise.all(
      [0, 1, 2].map(async () => {
        try {
          return await client.listTools();
        } catch (e) {
          if (!(e instanceof UnauthorizedError)) throw e;
          await auth.connect(client);
          return client.listTools();
        }
      }),
    );
    expect(retried).toEqual([{ tools: [] }, { tools: [] }, { tools: [] }]);
    expect(mock.authorizeRequests).toHaveLength(2);
  });

  test("403 insufficient_scope step-up completes through connect()", async () => {
    const auth = setup();
    const client = newClient();
    await auth.connect(client);
    mock.knobs.requiredScope = "admin";
    await expect(client.listTools()).rejects.toBeInstanceOf(UnauthorizedError);
    await auth.connect(client);
    expect(await client.listTools()).toEqual({ tools: [] });
    expect(mock.authorizeRequests.at(-1)!.searchParams.get("scope")).toContain(
      "admin",
    );
  });
});

describe("flow ownership", () => {
  test("a second state() while a flow is active is rejected", async () => {
    const auth = setup();
    await auth.state!();
    expect(() => auth.state!()).toThrow(/already in progress/);
  });

  test("a new flow can't start while an exchange is running", async () => {
    mock.knobs.tokenDelay = 300;
    const auth = setup();
    const connecting = auth.connect(newClient());
    while (mock.tokenRequests.length === 0) await sleep(10);
    expect(() => auth.state!()).toThrow(/already in progress/);
    await connecting;
  });

  test("a custom transport gets an external flow completed by completeAuthorization()", async () => {
    const auth = setup();
    const client = newClient();
    const transport = new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
      authProvider: auth,
    });
    await expect(client.connect(transport)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    // connect() can't complete a flow a caller's transport started: no "retry" signal.
    const error = await auth.connect(newClient()).catch((e) => e);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect(error.message).toMatch(/already in progress/);
    await auth.completeAuthorization(transport);
    await transport.close();
    const next = new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
      authProvider: auth,
    });
    await client.connect(next);
    expect(await client.listTools()).toEqual({ tools: [] });
  });

  test("completeAuthorization() refuses a connect()-owned flow; both stay usable", async () => {
    const auth = setup();
    const client = newClient();
    await auth.connect(client);
    mock.knobs.requiredScope = "admin";
    await expect(client.listTools()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      auth.completeAuthorization(client.transport as never),
    ).rejects.toThrow(/connect\(\)/);
    await auth.connect(client);
    expect(await client.listTools()).toEqual({ tools: [] });
  });

  test("completeAuthorization() reports a timeout that elapsed during the exchange", async () => {
    const auth = setup({ timeout: 100 });
    const transport = new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
      authProvider: auth,
    });
    await expect(newClient().connect(transport)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    const error = await auth
      .completeAuthorization({
        finishAuth: (params) =>
          sleep(200).then(() => transport.finishAuth(params)),
      })
      .catch((e) => e);
    expect(error.name).toBe("TimeoutError");
    expect(await auth.tokens()).toBeDefined(); // the exchange itself completed
  });

  test("an authorization URL with a duplicate client_id is refused", async () => {
    const auth = setup();
    await auth.saveClientInformation!({ client_id: "a", issuer: mock.base });
    const url = new URL("https://as.example.com/authorize?response_type=code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", await auth.state!());
    url.searchParams.append("client_id", "a");
    url.searchParams.append("client_id", "b");
    await expect(auth.redirectToAuthorization(url)).rejects.toThrow(
      /client changed/,
    );
  });

  test("completeAuthorization() without a pending flow throws", async () => {
    const auth = setup();
    await expect(
      auth.completeAuthorization({ finishAuth: async () => {} }),
    ).rejects.toThrow(/No MCP authorization/);
  });

  test("a second custom transport can't join a flow it didn't start", async () => {
    let launched!: (url: URL) => void;
    const launch = new Promise<URL>((resolve) => (launched = resolve));
    const auth = setup({ launch: (url) => launched(url) });
    const [a, b] = [0, 1].map(
      () =>
        new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
          authProvider: auth,
        }),
    );
    const first = newClient()
      .connect(a!)
      .catch((e) => e);
    const url = await launch;
    const error = await newClient()
      .connect(b!)
      .catch((e) => e);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect(error.message).toMatch(/already in progress/);
    expect(await first).toBeInstanceOf(UnauthorizedError);
    await mock.authorize(url);
    await auth.completeAuthorization(a!);
    const clientId = (await auth.clientInformation())!.client_id;
    expect(mock.tokenRequests.at(-1)!.get("client_id")).toBe(clientId);
  });
});

describe("credentials", () => {
  test("a store for another serverUrl is rejected", async () => {
    const store = memory();
    store.value = JSON.stringify({
      version: 1,
      serverUrl: "https://other.example.com/mcp",
    });
    await expect(setup({ store }).connect(newClient())).rejects.toThrow(
      /belong to/,
    );
  });

  test("corrupt store text is an error, not a silent reset", async () => {
    const store = memory();
    store.value = "{not json";
    await expect(setup({ store }).connect(newClient())).rejects.toThrow(
      /not valid JSON/,
    );
    store.value = JSON.stringify({ version: 2, serverUrl: mock.mcpUrl });
    await expect(setup({ store }).connect(newClient())).rejects.toThrow(
      /unsupported format/,
    );
  });

  test("a redirect URI change re-registers a DCR client", async () => {
    const store = memory();
    await setup({ store }).connect(newClient());
    const doc = JSON.parse(store.value!);
    delete doc.tokens; // re-registration happens when authorization is needed
    store.value = JSON.stringify(doc);
    const moved = setup({
      store,
      redirectUri: `http://127.0.0.1:${await freePort()}/callback`,
    });
    const client = newClient();
    await moved.connect(client);
    expect(mock.registrations).toHaveLength(2);
    expect(JSON.parse(store.value!).client.client_id).toBe("client-2");
  });

  test("a registration without echoed redirect_uris still re-registers after a redirectUri change", async () => {
    const store = memory();
    await setup({ store }).saveClientInformation!({
      client_id: "a",
      issuer: mock.base,
    });
    const moved = setup({
      store,
      redirectUri: `http://127.0.0.1:${await freePort()}/callback`,
    });
    expect(await moved.clientInformation()).toBeUndefined();
  });

  for (const kind of ["dynamic", "static"])
    test(`invalidateCredentials('all') during a token exchange wins (${kind} client)`, async () => {
      mock.knobs.tokenDelay = 300;
      const store = memory();
      const auth = setup({
        store,
        ...(kind === "static" && {
          clientName: undefined,
          clientInformation: {
            client_id: "static-client",
            issuer: mock.base,
          },
        }),
      });
      const connecting = auth.connect(newClient()).catch((e) => e);
      while (mock.tokenRequests.length === 0) await sleep(10);
      await auth.invalidateCredentials!("all");
      expect((await connecting).message).toMatch(/invalidated/);
      expect(store.value).toBeUndefined();
      expect(await auth.tokens()).toBeUndefined();
    });

  const staticOptions = () => ({
    clientName: undefined,
    clientInformation: { client_id: "static-client", issuer: mock.base },
  });

  for (const [kind, scope] of [
    ["dynamic", "tokens"],
    ["static", "all"],
  ] as const)
    test(`invalidateCredentials('${scope}') during a refresh wins (${kind} client)`, async () => {
      const store = memory();
      const options = kind === "static" ? staticOptions() : {};
      await setup({ store, ...options }).connect(newClient());
      const doc = JSON.parse(store.value!);
      doc.tokens.access_token = "expired";
      store.value = JSON.stringify(doc);
      mock.knobs.tokenDelay = 300;
      const auth = setup({ store, ...options });
      const connecting = auth.connect(newClient()).catch((e) => e);
      const before = mock.tokenRequests.length;
      while (mock.tokenRequests.length === before) await sleep(10);
      await auth.invalidateCredentials!(scope);
      expect((await connecting).message).toMatch(/invalidated/);
      expect(await auth.tokens()).toBeUndefined();
      if (scope === "all") expect(store.value).toBeUndefined();
    });

  test("invalidation during an external exchange survives a re-stamping attempt", async () => {
    const auth = setup();
    const newTransport = () =>
      new StreamableHTTPClientTransport(new URL(mock.mcpUrl), {
        authProvider: auth,
      });
    const transport = newTransport();
    await expect(newClient().connect(transport)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    mock.knobs.tokenDelay = 300;
    const completing = auth.completeAuthorization(transport).catch((e) => e);
    while (mock.tokenRequests.length === 0) await sleep(10);
    await auth.invalidateCredentials!("tokens");
    await newClient()
      .connect(newTransport())
      .catch(() => {}); // re-stamps the shared owner
    expect((await completing).message).toMatch(/invalidated/);
    expect(await auth.tokens()).toBeUndefined();
  });

  for (const scope of ["client", "all"] as const)
    test(`invalidateCredentials('${scope}') during a registration wins`, async () => {
      mock.knobs.registerDelay = 300;
      const store = memory();
      const auth = setup({ store });
      const connecting = auth.connect(newClient()).catch((e) => e);
      await sleep(100);
      await auth.invalidateCredentials!(scope);
      expect((await connecting).message).toMatch(/invalidated/);
      expect(await auth.clientInformation()).toBeUndefined();
      expect(store.value).toBeUndefined();
    });

  test("invalidateCredentials('all') clears the store", async () => {
    const store = memory();
    const auth = setup({ store });
    await auth.connect(newClient());
    await auth.invalidateCredentials!("all");
    expect(store.value).toBeUndefined();
  });

  test("a client registration still being persisted blocks new flows", async () => {
    let release!: () => void;
    const store: CredentialStore = {
      load: async () => undefined,
      save: () => new Promise<void>((resolve) => (release = resolve)),
    };
    const auth = setup({ store });
    await auth.tokens(); // load the slot
    const saving = auth.saveClientInformation!({
      client_id: "a",
      issuer: "https://as",
    });
    await sleep(0);
    expect(() => auth.state!()).toThrow(/already in progress/);
    release();
    await saving;
    expect(await auth.state!()).toBeString();
  });

  test("concurrent client and token saves both persist", async () => {
    const store = memory();
    const auth = setup({ store });
    await Promise.all([
      auth.saveClientInformation!({ client_id: "a", issuer: "https://as" }),
      auth.saveTokens({
        access_token: "t",
        token_type: "Bearer",
        issuer: "https://as",
      }),
    ]);
    expect(JSON.parse(store.value!)).toMatchObject({
      client: { client_id: "a" },
      tokens: { access_token: "t" },
    });
  });

  test("a new registration replaces the slot and drops the old client's tokens", async () => {
    const store = memory();
    const auth = setup({ store });
    await auth.saveClientInformation!({
      client_id: "a",
      issuer: "https://as1",
    });
    await auth.saveTokens({
      access_token: "t",
      token_type: "Bearer",
      issuer: "https://as1",
    });
    await auth.saveClientInformation!({
      client_id: "b",
      issuer: "https://as2",
    });
    expect(await auth.clientInformation()).toEqual({
      redirect_uris: [redirectUri],
      client_id: "b",
      issuer: "https://as2",
    });
    expect(await auth.tokens()).toBeUndefined();
  });
});

describe("static client", () => {
  const staticClient = (issuer: string) => ({
    client_id: "static-client",
    redirect_uris: ["http://127.0.0.1:1/other"],
    issuer,
  });

  test("is used verbatim, never re-registered, even with other redirect_uris", async () => {
    const auth = setup({
      clientName: undefined,
      clientInformation: staticClient(mock.base),
    });
    expect(auth.saveClientInformation).toBeUndefined();
    await auth.connect(newClient());
    expect(mock.registrations).toHaveLength(0);
    expect(mock.authorizeRequests[0]!.searchParams.get("client_id")).toBe(
      "static-client",
    );
  });

  test("a foreign issuer fails with AuthorizationServerMismatchError, no DCR", async () => {
    const auth = setup({
      clientInformation: staticClient("https://other-as.example.com"),
    });
    const error = await auth.connect(newClient()).catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationServerMismatchError);
    expect(mock.registrations).toHaveLength(0);
  });

  test("stored tokens are never handed to a different static client", async () => {
    const store = memory();
    await setup({ store, clientInformation: staticClient(mock.base) }).connect(
      newClient(),
    );
    const other = setup({
      store,
      clientInformation: { ...staticClient(mock.base), client_id: "other" },
    });
    expect(await other.tokens()).toBeUndefined();
  });

  test("survives invalidateCredentials('all')", async () => {
    const auth = setup({ clientInformation: staticClient(mock.base) });
    await auth.invalidateCredentials!("all");
    expect(await auth.clientInformation()).toMatchObject({
      client_id: "static-client",
    });
  });
});

describe("options", () => {
  test("are validated up front", () => {
    const valid = {
      serverUrl: "https://mcp.example.com/mcp",
      redirectUri: "http://127.0.0.1:8765/cb",
      clientName: "x",
    };
    expect(() => browserAuth(valid)).not.toThrow();
    for (const invalid of [
      { ...valid, serverUrl: "ftp://x" },
      { ...valid, serverUrl: "http://mcp.example.com/mcp" },
      { ...valid, serverUrl: "https://u:p@mcp.example.com/mcp" },
      { ...valid, serverUrl: "https://mcp.example.com/mcp#x" },
      { ...valid, redirectUri: undefined },
      { ...valid, redirectUri: "http://127.0.0.1:0/cb" },
      { ...valid, redirectUri: "https://127.0.0.1:1/cb" },
      { ...valid, clientName: undefined },
      { ...valid, clientInformation: { client_id: "x" } },
      { ...valid, clientInformation: { client_id: "", issuer: "https://as" } },
      { ...valid, successHtml: 1 },
      {
        ...valid,
        clientName: 1,
        clientInformation: { client_id: "x", issuer: "https://as" },
      },
      { ...valid, errorHtml: {} },
      { ...valid, timeout: 0 },
      { ...valid, launch: true },
      { ...valid, store: {} },
    ])
      expect(() => browserAuth(invalid as never)).toThrow();
    expect(() =>
      browserAuth({
        ...valid,
        clientName: undefined,
        clientInformation: { client_id: "x" } as never,
      }),
    ).toThrow(/authorization_servers/);
  });
});

describe("fileStore()", () => {
  let dir: string;
  beforeEach(
    async () => (dir = await mkdtemp(join(tmpdir(), "oauth-callback-"))),
  );
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test("round-trips text byte for byte with private permissions", async () => {
    const path = join(dir, "nested/dir/credentials.json");
    const store = fileStore(path);
    expect(await store.load()).toBeUndefined();
    const text = '{"ünïcødé":"✓"}\n  ';
    await store.save(text);
    expect(await store.load()).toBe(text);
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(dir, "nested/dir"))).mode & 0o777).toBe(0o700);
    }
    await store.save(undefined);
    expect(await store.load()).toBeUndefined();
  });

  test("keeps the last of concurrent writes", async () => {
    const path = join(dir, "c.json");
    const store = fileStore(path);
    await Promise.all(["1", "2", "3"].map((v) => store.save(v)));
    expect(await readFile(path, "utf8")).toBe("3");
  });

  test("requires an absolute path", () => {
    for (const path of ["~/x.json", "x.json", "./x.json", ""])
      expect(() => fileStore(path)).toThrow(TypeError);
  });

  test("works as a browserAuth store across instances", async () => {
    const path = join(dir, "mcp.json");
    await setup({ store: fileStore(path) }).connect(newClient());
    await setup({
      store: fileStore(path),
      launch: () => Promise.reject(new Error("browser")),
    }).connect(newClient());
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      version: 1,
      serverUrl: mock.mcpUrl,
    });
    await writeFile(path, "garbage");
    await expect(
      setup({ store: fileStore(path) }).connect(newClient()),
    ).rejects.toThrow(/JSON/);
  });
});
