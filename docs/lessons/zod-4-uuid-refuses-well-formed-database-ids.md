---
title: "Zod 4's `z.uuid()` refuses a well-formed id for its version nibble, so a real row comes back as invalid input"
modules: ['web', 'brain-contracts']
areas: ['frontend', 'architecture']
topics: ['zod', 'validation', 'uuid', 'server-actions', 'e2e', 'seeds', 'false-green']
---

## Context

Ragen Brain's panel actions and bundle contracts validated ids with `z.string().uuid()` / `z.uuid()`. Every unit test used v4 ids and passed.

## Problem

Since Zod 4, `.uuid()` checks for an RFC 9562 version and variant as well as the shape. The e2e seed uses ids like `e2e00000-0000-0000-0000-00e2e0000060`, which have a zero version nibble. Postgres' `uuid` type accepts them, so they are real rows. The extraction dialog listed the seeded documents, the reviewer clicked Start, and the action answered `invalid-input`: nothing started and nothing was logged. The same check in the bundle contracts would have dropped any row not minted as v4 from an export while every screen still showed it. This was found only by running a real extraction in a browser. Unit tests could not find it, because their fixtures were all v4.

## Rule

For an id that is a database key, check the **shape** (`/^[0-9a-f]{8}-…-[0-9a-f]{12}$/i`, `dbUuid` in `features/brain/contracts`, `uuidSchema` in `brain-contracts`) and let the database decide whether the row exists. Keep `z.uuid()` for ids you mint and must be RFC-valid. Include one non-v4 id in a schema test, because an all-v4 fixture set cannot tell the two checks apart.

## Applies to

Any Zod schema that validates an id coming back from the browser or from a file, in every workspace, and especially one run against seeded data.
