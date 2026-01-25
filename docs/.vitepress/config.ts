/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(
  defineConfig({
    base: "/oauth-callback/",
    title: "OAuth Callback",
    description:
      "OAuth 2.0 callback handler for CLI tools & desktop apps. Cross-runtime (Node.js/Deno/Bun), MCP SDK integration, minimal deps, TypeScript-first.",

    lastUpdated: true,
    cleanUrls: true,
    metaChunk: true,

    sitemap: {
      hostname: "https://kriasoft.com/oauth-callback",
      transformItems: (items) => {
        items.push({ url: "llms.txt" }, { url: "llms-full.txt" });
        return items;
      },
    },

    head: [
      ["meta", { name: "theme-color", content: "#3c8772" }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "OAuth Callback" }],
      [
        "meta",
        { property: "og:url", content: "https://kriasoft.com/oauth-callback/" },
      ],
      [
        "link",
        {
          rel: "alternate",
          type: "text/plain",
          href: "/oauth-callback/llms.txt",
          title: "LLM context",
        },
      ],
      [
        "link",
        {
          rel: "alternate",
          type: "text/plain",
          href: "/oauth-callback/llms-full.txt",
          title: "LLM context (full)",
        },
      ],
    ],

    themeConfig: {
      nav: [
        { text: "Guide", link: "/getting-started" },
        { text: "API", link: "/api/get-auth-code" },
        { text: "Examples", link: "/examples/notion" },
        {
          text: "v2.2.0",
          items: [
            {
              text: "Release Notes",
              link: "https://github.com/kriasoft/oauth-callback/releases",
            },
            {
              text: "npm",
              link: "https://www.npmjs.com/package/oauth-callback",
            },
          ],
        },
      ],

      sidebar: [
        {
          text: "Introduction",
          items: [
            {
              text: "What is OAuth Callback?",
              link: "/what-is-oauth-callback",
            },
            { text: "Getting Started", link: "/getting-started" },
            { text: "Core Concepts", link: "/core-concepts" },
            { text: "ADRs", link: "/adr/" },
          ],
        },
        {
          text: "API Reference",
          items: [
            { text: "getAuthCode", link: "/api/get-auth-code" },
            { text: "browserAuth", link: "/api/browser-auth" },
            { text: "Storage Providers", link: "/api/storage-providers" },
            { text: "OAuthError", link: "/api/oauth-error" },
            { text: "TypeScript Types", link: "/api/types" },
          ],
        },
        {
          text: "Examples",
          items: [
            { text: "Notion MCP", link: "/examples/notion" },
            { text: "Linear MCP", link: "/examples/linear" },
          ],
        },
      ],

      search: {
        provider: "local",
      },

      editLink: {
        pattern:
          "https://github.com/kriasoft/oauth-callback/edit/main/docs/:path",
      },

      socialLinks: [
        { icon: "github", link: "https://github.com/kriasoft/oauth-callback" },
        { icon: "npm", link: "https://www.npmjs.com/package/oauth-callback" },
        { icon: "discord", link: "https://discord.gg/bSsv7XM" },
      ],

      footer: {
        message:
          'LLM context: <a href="/oauth-callback/llms.txt">llms.txt</a> · <a href="/oauth-callback/llms-full.txt">llms-full.txt</a><br>Released under the MIT License.',
        copyright: "Copyright © 2025-present Kriasoft",
      },
    },

    vite: {
      plugins: [llmstxt()],
    },
  }),
);
