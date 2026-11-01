/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/** followableRedirect() accepts exactly the redirects the MCP SDK follows (fetchWithinOrigin). */

import { expect, test } from "bun:test";
import { followableRedirect } from "../src/mcp/browser-auth";

const from = "http://127.0.0.1:8080/mcp";
const redirect = (status: number, location?: string) =>
  new Response(null, {
    status,
    headers: location === undefined ? {} : { location },
  });
const post = { method: "POST" };

test.each([
  [
    "relative, 307 POST",
    post,
    redirect(307, "/mcp/"),
    "http://127.0.0.1:8080/mcp/",
  ],
  ["308 POST", post, redirect(308, "/v2"), "http://127.0.0.1:8080/v2"],
  ["302 GET", undefined, redirect(302, "/mcp/"), "http://127.0.0.1:8080/mcp/"],
  ["302 POST (method change)", post, redirect(302, "/mcp/"), undefined],
  ["303 POST (method change)", post, redirect(303, "/mcp/"), undefined],
  [
    "cross-origin",
    post,
    redirect(307, "http://127.0.0.1:9090/token"),
    undefined,
  ],
  [
    "userinfo",
    post,
    redirect(307, "http://u:p@127.0.0.1:8080/mcp/"),
    undefined,
  ],
  ["malformed Location", post, redirect(307, "http://[::1"), undefined],
  ["no Location", post, redirect(307), undefined],
  ["not a redirect status", post, redirect(300, "/mcp/"), undefined],
])("%s", (_, init, response, expected) => {
  expect(followableRedirect(from, init, response)).toBe(expected);
});

test("http → https on the same host with default ports", () => {
  const response = redirect(308, "https://mcp.example.com/mcp");
  expect(followableRedirect("http://mcp.example.com/mcp", post, response)).toBe(
    "https://mcp.example.com/mcp",
  );
  expect(
    followableRedirect("http://mcp.example.com:8080/mcp", post, response),
  ).toBeUndefined();
});
