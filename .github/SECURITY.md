# Security Policy

## Supported Versions

Only the latest `2.x` release receives security fixes. Please upgrade before reporting.

## Reporting a Vulnerability

Please do not open public issues for security problems.

Report privately via [GitHub private vulnerability reporting](https://github.com/kriasoft/oauth-callback/security/advisories/new), or email [security@kriasoft.com](mailto:security@kriasoft.com).

Include the affected version, runtime (Node.js, Bun, or Deno), steps to reproduce, and the impact you observed. We aim to acknowledge reports within a few days and will keep you updated until a fix is released. With your permission, we'll credit you in the advisory.

## Scope

Examples of issues we want to hear about:

- Leaking authorization codes, tokens, or client secrets (logs, error pages, files, network)
- Bypassing `state` validation or PKCE, or accepting a callback that should be rejected
- Token files readable or replaceable by other local users
- HTML or script injection in the callback success or error pages
- The callback server accepting connections it shouldn't, or staying reachable after shutdown

Vulnerabilities in the OAuth provider or in `@modelcontextprotocol/sdk` should be reported to those projects.
