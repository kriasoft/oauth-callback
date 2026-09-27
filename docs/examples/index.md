---
title: Examples
description: Runnable oauth-callback examples, from a mock authorization server to GitHub sign-in and hosted MCP servers.
---

# Examples

| Example                        | Shows                                                            | Needs              |
| ------------------------------ | ---------------------------------------------------------------- | ------------------ |
| [Demo](#demo)                  | `getAuthCode()` with PKCE against a local mock server            | Nothing            |
| [GitHub](/examples/github)     | `getAuthCode()` sign-in and your own token exchange              | A GitHub OAuth App |
| [Notion MCP](/examples/notion) | `browserAuth()` with Dynamic Client Registration and `fileStore` | A Notion account   |
| [Linear MCP](/examples/linear) | `browserAuth()` with tool calls, step-up and a keychain store    | A Linear workspace |

## Demo

The quickest way to see the flow: a mock authorization server with PKCE, no account or credentials. Approve or deny in the browser; denying shows the neutral error page and reports `OAuthCallbackError`.

```bash
git clone https://github.com/kriasoft/oauth-callback.git
cd oauth-callback && bun install

bun run example:demo                # approve or deny in your browser
bun run example:demo --no-browser   # auto-approve
```

The GitHub and Notion examples run from the same clone with `bun run example:github` and `bun run example:notion`. Source: [`examples/`](https://github.com/kriasoft/oauth-callback/tree/main/examples).
