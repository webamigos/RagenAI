---
title: 'A NestJS controller returning a bare string/number/boolean/null serializes wrong'
modules: ['api']
areas: ['integration']
topics: ['api-contracts', 'testing']
---

# A NestJS controller returning a bare string/number/boolean/null serializes wrong

**Context**: found repeatedly during `apps/api`'s Phase C UI-cutover (see `docs/adrs/21-monorepo-and-api-decoupling.md`) — `ProjectsController.getInstruction()`/`getDefault()`, `FoldersController.getPiiPolicy()`, and `ThreadCoreController.getPublicLink()` all had handlers that returned a bare value straight from a service call instead of wrapping it in an object.

**Problem**: Express serializes a **primitive** return value (`string`/`number`/`boolean`/`null`) via `res.send()` instead of `res.json()`. For a non-empty string this produces an **unquoted, invalid-JSON** body — `ragenApiRequest`'s `JSON.parse()` throws. For `null` it produces an **empty body**, indistinguishable from "no content" on the client. Objects and arrays are unaffected — this is specifically a bare-primitive/`null` risk. `nest build` and the unit test suite both stayed green throughout; this was only ever caught by live end-to-end testing against a real running instance.

**Rule**: any controller handler that does `return this.service.methodReturningABareStringOrBooleanOrNumberOrNull()` must wrap it in an object before returning (`{ instruction }`, `{ piiPolicy }`, `{ publicLink }`, etc.) — never return a service's primitive/nullable result directly from a controller.

**Applies to**: every new `apps/api` controller handler, especially anything under `internal/<feature>` ported from a ragen-app query/command that used to return a plain value. Check for this pattern before assuming a new handler is fine — `nest build` and unit tests will not catch it.
