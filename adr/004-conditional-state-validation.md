---
url: /oauth-callback/adr/004-conditional-state-validation.md
---
# ADR-004: Conditional OAuth State Validation

**Status:** Accepted
**Date:** 2025-01-25
**Tags:** oauth, security, csrf

## Problem

* RFC 6749 recommends `state` for CSRF protection, but RFC 8252 (native apps) relies on loopback redirect for security.
* Some authorization servers don't echo `state` back; others require it.
* Strict validation breaks compatibility; no validation weakens security.

## Decision

* Validate `state` only if it was present in the authorization URL.
* If the auth URL includes `state` and the callback doesn't match, reject as CSRF.
* If the auth URL omits `state`, accept callbacks without state validation.

Rationale:

* **Defense-in-depth**: Loopback binding (127.0.0.1) prevents network CSRF, but state adds protection against local attacks (malicious apps, browser extensions intercepting localhost).
* **CLI threat model**: Unlike web apps, CLI tools face local machine threats—other processes can probe localhost ports. State validation detects if a callback arrives from an unrelated auth flow.
* **Compatibility**: Authorization servers have inconsistent state handling. Conditional validation works with all servers while providing protection when available.

## Alternatives (brief)

* **Always require state** — Breaks servers that don't echo state or don't support it.
* **Never validate state** — Loopback provides baseline security, but ignores state when the AS cooperates.
* **Generate state internally always** — Conflicts with auth URLs that already include state from the MCP SDK.

## Impact

* Positive: Maximum security when AS supports state; universal compatibility otherwise.
* Negative/Risks: If an AS echoes arbitrary state values without validation, the protection is weaker (rare edge case).

## Links

* Code: `src/auth/browser-auth.ts:297-300`
* RFC 6749 Section 10.12 (CSRF Protection)
* RFC 8252 Section 8.1 (Loopback Redirect)
