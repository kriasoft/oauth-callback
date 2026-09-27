# Examples

Run from the repository root after `bun install`. The examples import from `../src`, so they run on Bun.

## Demo (`demo.ts`)

A mock authorization server with PKCE; no account or credentials needed. The builder form picks a free loopback port, then the code is exchanged at the mock token endpoint.

```bash
bun run example:demo                # approve or deny in your browser
bun run example:demo --no-browser   # auto-approve (CI)
```

Denying shows the neutral error page and reports `OAuthCallbackError` (`access_denied`).

## GitHub (`github.ts`)

Signs in with a GitHub OAuth App and prints your login.

1. Create an OAuth App at https://github.com/settings/developers with the callback URL `http://127.0.0.1/callback`. GitHub accepts any loopback port, so the library's free port works.
2. Run:

   ```bash
   GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… bun run example:github
   ```

## Notion MCP (`notion.ts`)

Connects to Notion's hosted MCP server with `browserAuth()`: dynamic client registration, browser consent, and credentials saved in `~/.config/oauth-callback-example/notion.json`. Needs a Notion account; no app setup.

```bash
bun run example:notion   # first run opens the browser; the second reuses stored tokens
```

It listens on the fixed redirect URI `http://127.0.0.1:8765/callback`. Delete the credentials file to start over.
