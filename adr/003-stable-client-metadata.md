---
url: /oauth-callback/adr/003-stable-client-metadata.md
---
# ADR-003: Stable Client Metadata Across DCR

**Status:** Accepted
**Date:** 2025-01-25
**Tags:** oauth, dcr, security

## Problem

* During Dynamic Client Registration (DCR), the authorization server may return different capabilities than requested (e.g., `token_endpoint_auth_method`).
* If `clientMetadata` adapts to DCR responses, subsequent token requests may fail when the AS caches the original registration metadata.

## Decision

* `clientMetadata` is immutable after construction.
* `token_endpoint_auth_method` is determined at construction: `client_secret_post` if `clientSecret` is provided, `none` otherwise. DCR responses never change this value.
* DCR credentials (`client_id`, `client_secret`) are stored separately and never mutate the auth method.

## Alternatives (brief)

* **Dynamic metadata evolution** — Adapting to DCR responses seems flexible but causes cache mismatches with AS that remember original registration.
* **Per-request method detection** — Adds complexity and non-deterministic behavior across retries.

## Impact

* Positive: Predictable behavior with all AS implementations; eliminates cache-related auth failures.
* Negative/Risks: None identified; the fixed method (`client_secret_post`) has universal support.

## Links

* Code: `src/auth/browser-auth.ts`
* Related ADRs: ADR-001 (No Refresh Tokens), ADR-002 (Immediate Token Exchange)
