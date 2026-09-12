---
title: 'A `<button>` resets text-transform and text-align, so `uppercase` on the parent and `text-left` you never wrote both lose'
modules: ['web', 'admin']
areas: ['frontend']
topics: ['tailwind', 'preflight', 'user-agent-stylesheet', 'buttons', 'design-tokens', 'inheritance']
---

# A `<button>` resets text-transform and text-align, so `uppercase` on the parent and `text-left` you never wrote both lose

**Context**: design system v2 phase 7 gives the knowledge base's table an
11px uppercase header and a 216px folder rail. Both were built, both looked
right in review, and both were wrong in the same way — twice in one afternoon,
in two different components, before the shape of it was recognised.

**Problem**: a `<button>` does not inherit the text styles around it.

**`text-transform` on a `<th>` does not reach a button inside it.** The header
cell carries `uppercase`; three of the seven columns wrap their label in a
button so it can sort. Tailwind's preflight sets `text-transform: none` on
`button`, which is a declaration on the element itself and beats an inherited
value outright. The header rendered `File name · Size · Added` beside
`STATUS · PII POLICY` — half the row styled, half not, in a screenshot that
had already been through review.

**`text-align: center` arrives from the UA stylesheet whether or not you want
it.** The rail's folder rows are buttons. The name sits in a
`min-w-0 flex-1 truncate` span, so it takes whatever width is left — and the
centring was invisible while a policy tag beside it took most of the row.
The moment folders without an override stopped carrying a tag, the span became
wide and "Contracts" drifted into the middle of the rail while a tagged folder
beside it stayed against its icon. The bug was months old; the change that
revealed it did not cause it.

**Rule**: styling text inside a `<button>`, set the property on the button.
A button arrives with `text-transform` and `text-align` already declared on
it, so it never takes the inherited value, and neither failure looks like a
CSS problem — the first reads as an inconsistent design, the second as a
layout bug in whatever you changed last. When a
utility on a parent appears to do nothing, check `getComputedStyle` on the
child rather than the source: both of these were one `getComputedStyle` away
and several review passes deep.

Inheritance does not stop at a button — its own children inherit from it
normally. What happens is one level up: a declaration on the button itself,
from preflight or the UA stylesheet, gives that element a value of its own, so
it never takes the inherited one, and everything inside it inherits _that_
instead. The same shape has bitten this repository from the other direction —
see [a custom-property override on `:root` losing to the element that owns the
property](a-custom-property-override-on-root-loses-to-the-element-that-owns-it.md).

**Applies to**: any `<button>` carrying text in `apps/web` or `apps/admin` —
sortable table headers, nav rows, chips, menu items. Not to `<a>`, which
inherits both properties normally, which is part of why this is easy to miss.
