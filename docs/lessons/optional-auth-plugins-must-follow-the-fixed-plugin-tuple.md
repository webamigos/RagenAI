---
title: "Optional auth plugins must follow the fixed plugin tuple"
modules: ['web']
areas: ['dependencies', 'testing']
topics: ['better-auth', 'typescript', 'oauth', 'session', 'inference']
---

# Optional auth plugins must follow the fixed plugin tuple

**Context**: the MCP OAuth preset and JWT plugin are registered conditionally
by `mcpOAuthPlugins()`, next to the existing organization plugin.

**Problem**: spreading the helper's ordinary array at the start of `plugins`
changed Better Auth's inferred session to the base session. Typecheck reported
that `activeOrganizationId` did not exist in `auth-helpers.ts`, although the
organization plugin still ran at runtime. Unit tests of the new plugin passed.

**Rule**: keep the fixed plugins at the start of the tuple, and spread optional
plugins afterwards. Return readonly tuples from a conditional plugin helper,
including `[] as const` when disabled. Keep the inferred auth type; casting
session fields would hide the lost organization fields from other callers.
Run apps/web's typecheck after wiring a new plugin, as well as its unit tests.

**Applies to**: Better Auth configuration and conditional plugin helpers.
