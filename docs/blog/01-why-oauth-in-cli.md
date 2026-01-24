---
title: Why Your CLI Tool Needs OAuth (Not API Keys)
date: 2025-01-18
author: Konstantin Tarkus
tags: [oauth, cli, security, authentication]
---

# Why Your CLI Tool Needs OAuth (Not API Keys)

Remember the last time you installed a CLI tool and it asked for your API key? You probably hunted through documentation, navigated to some settings page, generated a key, then carefully copied it into a config file. Now multiply that friction by every user of your tool.

There's a better way, and it's been hiding in plain sight.

## The API Key Problem Nobody Talks About

API keys seem simple on the surface. Generate once, use forever. But that simplicity masks serious problems that compound as your tool gains adoption.

First, there's the security nightmare. Users paste API keys into dotfiles, commit them to repositories, share them in documentation. Once leaked, an API key becomes a permanent liability — there's no way to know who has it or where it's been copied. Unlike passwords that users might change periodically, API keys tend to live forever in forgotten config files.

Then there's the user experience disaster. Finding where to generate an API key requires navigating documentation that varies wildly between services. GitHub hides them under Developer Settings. Notion requires creating an integration. Slack needs an entire app configuration. Each service has its own maze, and your users have to navigate them all.

But the real killer? API keys can't adapt. They're static credentials with fixed permissions. Need to request additional scopes? Your users must generate a new key. Want to implement granular permissions? Too bad — it's all or nothing. And forget about temporary access or delegation; API keys weren't designed for modern authorization patterns.

## OAuth: The Solution That's Already Everywhere

OAuth isn't new technology — it's the authentication standard that already powers most of the web. When you click "Sign in with Google" or authorize a GitHub integration, you're using OAuth. The difference is that most CLI developers haven't realized how perfectly it fits their needs.

Here's what happens when your CLI uses OAuth: A user runs your command, their browser opens, they click "Authorize," and they're done. No hunting for settings pages. No copying cryptic strings. No permanent credentials stored on disk.

The security benefits are immediate. OAuth tokens expire automatically, reducing the blast radius of any leak. Refresh tokens allow seamless re-authentication without user intervention. And when a user revokes access through the service's UI, it takes effect immediately — no orphaned API keys floating around.

But the real magic is in the flexibility. Need read-only access initially but write access for certain operations? OAuth handles incremental authorization naturally. Want to access multiple services? OAuth makes it seamless. Building a tool for teams? OAuth tokens can carry user identity, enabling proper audit trails and access control.

## Making It Work in Practice

The technical implementation is surprisingly straightforward. Your CLI spins up a temporary local server, opens the user's browser to the OAuth authorization URL, and waits for the callback. When the user authorizes, the service redirects back to localhost with an authorization code. Your CLI exchanges that code for tokens and shuts down the server.

```typescript
import { getAuthCode } from "oauth-callback";

const result = await getAuthCode(
  "https://github.com/login/oauth/authorize?" +
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      redirect_uri: "http://localhost:3000/callback",
      scope: "repo user",
    }),
);

// Exchange code for tokens
const tokens = await exchangeCodeForTokens(result.code);
```

Modern libraries handle the complexity. Automatic browser launching, secure token storage, refresh token rotation — it's all solved problems. Tools like `oauth-callback` provide production-ready implementations that work across Node.js, Deno, and Bun.

For services supporting Dynamic Client Registration, you don't even need pre-registered credentials. Your CLI can register itself on the fly, eliminating the chicken-and-egg problem of distributing client secrets.

## The Future Is Already Here

Major CLI tools are already making this shift. The GitHub CLI uses OAuth for authentication. Vercel's CLI leverages browser-based auth flows. Model Context Protocol servers are standardizing on OAuth for secure access to AI tools.

The ecosystem is ready. Every major platform supports OAuth. Libraries exist for every language. Browser automation is a solved problem. The only thing holding us back is inertia — the assumption that CLI tools must use API keys because that's how it's always been done.

Your users deserve better than managing a keychain of API credentials. They deserve authentication that's secure by default, that respects principle of least privilege, and that just works. OAuth delivers all of that, today.

Stop asking your users for API keys. Start using OAuth. Your users — and your security team — will thank you.

---

_Ready to implement OAuth in your CLI tool? Check out [oauth-callback](https://github.com/kriasoft/oauth-callback), a lightweight library that handles the entire flow with just a few lines of code._
