---
title: "Three shapes of a test that guards nothing, from one day: a negative match over free text, an assertion that freezes a capability, and a check for a mention instead of a call"
modules: ['web', 'api', 'admin', 'ci']
areas: ['testing', 'architecture']
topics: ['false-green', 'architecture-tests', 'vacuous-tests', 'guardrails', 'test-design', 'verification']
---

# Three shapes of a test that guards nothing

**Context**: Phase B of the guardrails programme — five pull requests that move
content moderation from an environment variable to a row an administrator
manages, and add pattern rules beside it. The feature's entire reason for
existing is that a protection which silently stops working is indistinguishable
from one that works. Over one day, three of the tests written *for that feature*
had exactly that property, and none was caught by review or by a green gate.

They are worth recording together because they look nothing alike.

**Problem**, in the order they were found.

## 1. A negative match over free text cannot tell a field name from a payload

A guardrail hit is written as a security event. The event must carry a count of
matches and never the matched text, because the match is the customer's message
and the admin panel renders that table in plain text for every operator. The
test:

```ts
const serialized = JSON.stringify(input.metadata);
expect(serialized).not.toMatch(/text|content|message|snippet|matched"/i);
```

It failed immediately — on `content-moderation`, the rule's own key. The regex
could not distinguish a field name from a value, and the obvious repair
(dropping `content` from the alternation) would have made it weaker in exactly
the direction that matters.

What it should have been, and now is:

```ts
expect(Object.keys(input.metadata).sort()).toEqual([
  'action', 'guardrail', 'kind', 'matchCount', 'rule', 'stage',
]);
```

An allow-list fails the moment a field is added, which is precisely when a human
should look at what is being written.

## 2. An assertion that freezes a capability keeps passing after the capability changes

`SUPPORTED_COMBINATIONS` is the set of kind × stage pairs the build can
evaluate; the resolver drops anything outside it. Phase A shipped one entry,
`PATTERN`/`INPUT`, and a test that said so:

```ts
expect(kinds.has('BUILT_IN')).toBe(false);
```

Correct when written — no evaluator for `BUILT_IN` existed. It went stale the
moment Phase B added one, and it *locked in a real bug*: both seeded detectors
are `BUILT_IN`/`INPUT`, so the runtime resolver discarded `content-moderation`
as unsupported. The consequence, end to end: an installation running
`MODERATION_ENABLED=1` upgrades, `guardrails:preflight` tells the operator to
enable the rule in the panel, they do, the preflight goes green — and moderation
does not run. The panel lists the rule, no events appear because nothing
matches, and nothing anywhere says why.

Found by asking a question the test did not: *given the default supported set,
does the seeded built-in survive the resolver?* Twelve lines in a scratch file
answered it.

The repair was not only the constant. It turned out to be serving two questions
that had stopped being the same one — what the build can **evaluate** and what an
operator may **author** — so it became `SUPPORTED_COMBINATIONS` and
`AUTHORABLE_COMBINATIONS`. A built-in is seeded and identified by a key the code
knows; one an operator typed would have no detector behind it.

## 3. Checking for a mention is not checking for a call

`a-chain-reads-its-guardrails` exists because this repository has already paid
for the lesson at the monthly usage ceilings — computed for five months,
enforced by nothing, every static check green. It asserts that each chain file
still reaches the guardrail loader:

```ts
const missing = mustMention.filter((symbol) => !code.includes(symbol));
```

Removing a chain's guardrail call leaves its `import` at the top of the file, so
the symbol is still there. Neutralising the call in two chains left the test
green — a guard that was vacuous for precisely the case it was written for.

Fixed by matching a call (`symbol(`) and stripping `import … from '…';` before
looking.

**Rule**: one habit catches all three, and nothing else did.

> **After writing a guard, break the thing it guards and watch it fail.**
> Name the file you broke and the assertion that fired.

Every one of these three passed review, passed `npm run verify`, and passed CI.
The only thing that found them was deliberately reintroducing the defect. It
costs about a minute per guard: copy the file, make the change the guard
forbids, run the one test, restore.

Three corollaries, each earned above:

1. **Assert an allow-list, not an absence.** A test that searches for bad
   content cannot tell a key from a value; a test that enumerates permitted
   keys fails when the shape changes, which is when to look.
2. **Assert the rule, not a snapshot of it.** `expect(X).toEqual([...current
   value...])` is a change detector, and for a *capability* it is a change
   detector pointing the wrong way — it goes red when the capability grows
   correctly and stays green when the code that reads it goes stale. Say why
   each member is there, in the test, so the next person knows whether to add
   one.
3. **A text-based guard must match the construct, not the identifier.** Imports,
   comments, type-only references and unrelated locals all mention a symbol.
   Strip what cannot execute before deciding a call exists.

**Applies to**: every test in `tests/architecture/`; any test asserting that
something is *absent* from a payload, a log or a bundle; any assertion over a
constant that describes what the build can do.
