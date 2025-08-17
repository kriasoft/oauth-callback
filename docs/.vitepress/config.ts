/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

import { withMermaid } from "vitepress-plugin-mermaid";

// https://vitepress.dev/reference/site-config
export default withMermaid({
  base: "/oauth-callback/",
  title: "🔐 \u00A0OAuth Callback",
  description:
    "OAuth 2.0 callback handler for CLI tools & desktop apps. Cross-runtime (Node.js/Deno/Bun), MCP SDK integration, minimal deps, TypeScript-first.",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "API", link: "/api/get-auth-code" },
      { text: "Examples", link: "/examples/notion" },
      {
        text: "v1.2.0",
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
          { text: "What is OAuth Callback?", link: "/what-is-oauth-callback" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Core Concepts", link: "/core-concepts" },
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
      text: "Edit this page on GitHub",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/kriasoft/oauth-callback" },
      { icon: "npm", link: "https://www.npmjs.com/package/oauth-callback" },
      { icon: "discord", link: "https://discord.gg/bSsv7XM" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2025-present Konstantin Tarkus",
    },
  },
});
