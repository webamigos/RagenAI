---
title: 'A feature gate on the internal thread route was described as covering the public one — apps/api has two controllers per resource, and they do not share a service'
modules: ['api']
areas: ['security']
topics: ['feature-flags', 'public-api', 'call-sites', 'pr-descriptions']
---

# A gate on the internal route is not a gate on the public one

**Context**: #1364 added the `deleteThreads` feature key so that a showcase
organization's example threads cannot be deleted. The gate went into
`ThreadsCoreService.deleteThread`, and the PR description said that method was
what "both the public DELETE /v1/threads/:id and the internal route apps/web
calls go through".

**Problem**: it was not. apps/api has two thread controllers in the same
directory. `thread-core.controller.ts` is `@Controller('internal/threads')`,
the route apps/web calls, and it uses `ThreadsCoreService`.
`threads.controller.ts` is `@Controller('threads')`, the public OpenAI-shaped
API, and it uses `ThreadsService`, whose `remove` deleted the messages and the
thread with no check at all. On the tenant the key was built for, any API key
could still delete the threads the panel no longer offered to delete. The same
held for `DELETE /v1/threads/:id/messages/:message_id`, in a third service.

Nothing was going to catch this. The unit test covered the service that had the
gate, the panel test covered the menu, and the one sentence that was wrong was
in prose. It was found only while documenting the key, by reading which method
the public controller calls.

**Rule**: a gate is a call site, and "it covers the public path" is a claim to
check by following the controller, not the service name. In apps/api the
internal and public surfaces of one resource are separate controllers with
separate services. Before saying a
gate covers both, open each controller's handler for the verb and follow it to
the line that writes. `grep -n "@Delete(" apps/api/src -r` lists every delete
route in a few lines. Ask as well whether a smaller operation reaches the same
outcome: deleting every message empties a thread.

**Applies to**: any feature key, limit or permission added to apps/api that is
meant to hold on the public API, not just in the panel. The `manage…` keys got
this right: `delete-file.service.ts` states that it covers `DELETE /v1/files/:id`
as well as the internal callers.
