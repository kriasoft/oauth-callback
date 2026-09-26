/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { createServer } from "node:http";

/** A port that was free a moment ago (for URL-form tests, which can't use port 0). */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Plays the authorization server: redirects to the URL's `redirect_uri` with `query` + its state. */
export function respond(
  url: URL,
  query: Record<string, string> = { code: "test-code" },
) {
  const target = new URL(url.searchParams.get("redirect_uri")!);
  for (const [key, value] of Object.entries(query))
    target.searchParams.append(key, value);
  const state = url.searchParams.get("state");
  if (state !== null && !("state" in query))
    target.searchParams.set("state", state);
  return fetch(target);
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
