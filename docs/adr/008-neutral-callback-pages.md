# ADR-008: Neutral Callback Pages

**Status:** Accepted
**Date:** 2026-09-26
**Tags:** security, ui

## Problem

- v2 rendered `error`, `error_description` and `error_uri` into HTML via templates. Those values are attacker-controllable (any page can link to the callback, and `error*` is only trustworthy after an `iss` check), so escaping bugs become XSS on a local origin, and provider text can phish (#59).

## Decision

- Callback pages never contain callback data. Defaults: "Authorization response received. You can close this tab." and "Authorization failed. Return to the application for details." Details go to the application, which can show them in its own UI.
- `successHtml`/`errorHtml` are static strings served verbatim; there is no templating.
- Every response (200, 400, 404, 405) sends `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Default pages are CSS-only.

## Alternatives (brief)

- **Escaped templates (v2)** — safe only as long as every escape is right, and still displays unverified provider text.
- **Scripted pages (auto-close, countdown)** — need a script-enabled CSP on a page served at a local origin.

## Impact

- Positive: no XSS or phishing surface on the loopback origin; the code-bearing URL isn't leaked via `Referer` or caches.
- Negative/Risks: users see less detail in the browser; apps show errors themselves.

## Links

- Code: `src/loopback.ts`
- Related: [ADR-007](./007-redirect-uri-and-builder.md)
