/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { expect, test } from "bun:test";
import { createCallbackServer } from "../src/server";

let nextPort = 3100;

// Renders the error page for the given callback query string.
async function renderErrorPage(query: string, errorHtml?: string) {
  const port = nextPort++;
  const server = createCallbackServer();
  await server.start({ port, errorHtml });
  const callback = server.waitForCallback("/callback", 2000);
  try {
    const res = await fetch(`http://localhost:${port}/callback?${query}`);
    return await res.text();
  } finally {
    await callback;
    await server.stop();
  }
}

const xss = new URLSearchParams({
  error: "<script>alert(1)</script>",
  error_description: `"><img src=x onerror=alert(1)>`,
  error_uri: "javascript:alert(1)",
}).toString();

test("escapes callback params in the default error page", async () => {
  const html = await renderErrorPage(xss);

  expect(html).not.toContain("<script>alert(1)");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62;");
  expect(html).not.toContain("javascript:");
});

test("escapes callback params in a custom error page", async () => {
  const html = await renderErrorPage(
    xss,
    `<p>{{error}}</p><p>{{error_description}}</p><a href="{{error_uri}}">`,
  );

  expect(html).toBe(
    `<p>&#60;script&#62;alert(1)&#60;/script&#62;</p>` +
      `<p>&#34;&#62;&#60;img src=x onerror=alert(1)&#62;</p><a href="">`,
  );
});

test("keeps http(s) error links", async () => {
  const html = await renderErrorPage(
    "error=server_error&error_uri=https://example.com/e?a=1%26b=2",
  );

  expect(html).toContain(`href="https://example.com/e?a=1&#38;b=2"`);
});

test("does not expand replacement patterns in values", async () => {
  const query = "error=%24%60%24%27&error_description=%24%26";
  const custom = await renderErrorPage(
    query,
    "[{{error}}|{{error_description}}]",
  );
  const page = await renderErrorPage(query);

  // "$&" survives escaping as "$&#38;", so the pattern check still bites.
  expect(custom).toBe("[$`$&#39;|$&#38;]");
  expect(page).toContain("<code>$`$&#39;</code>");
  expect(page).toContain("<p>$&#38;</p>");
});

test("does not expand placeholders inside values", async () => {
  // {{HELP_TEXT}} contains quotes; expanded inside href it would break out.
  const query = new URLSearchParams({
    error: "access_denied",
    error_description: "{{error_uri}}",
    error_uri: "https://example.com/{{HELP_TEXT}} onmouseover=alert(1) x=",
  }).toString();
  const custom = await renderErrorPage(query, "{{error_description}}");
  const page = await renderErrorPage(query);

  expect(custom).toBe("{{error_uri}}");
  expect(page).toContain(
    `href="https://example.com/{{HELP_TEXT}} onmouseover=alert(1) x="`,
  );
});
