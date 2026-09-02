# Specs

A spec is written before a non-trivial change and lives here as
`YYYY-MM-DD-kebab-title.md`. Small, obvious changes do not need one — the test
is whether a reviewer could disagree about _what_ is being built, not just how.

Specs sit alongside the two records this repo already keeps, and the difference
matters:

|                   | answers                                                         |
| ----------------- | --------------------------------------------------------------- |
| `docs/adrs/`      | why the architecture is the way it is — durable, rarely changes |
| `docs/specs/`     | what we are about to build, and in what order — has a lifecycle |
| `docs/lessons.md` | what bit us once already — read before starting                 |

## Why write one

The failure this is aimed at is not "we built the wrong thing". It is an agent
(or a person) making an architectural decision silently, in the middle of an
implementation, because the brief did not settle it. By then the decision is
buried in a diff and gets reviewed as code rather than as a decision.

## The workflow

### 1. Skeleton first, and stop

Write the TLDR and two or three key section headings. **Do not write the whole
spec in one pass.** Before writing, scan the brief for decisions where a wrong
assumption means rewriting large parts of the spec — data model, tenancy,
whether this is one capability or several.

Put those in a numbered `Open Questions` block right after the TLDR, one per
line, answerable (yes/no or a short choice) wherever possible.

**Then stop and get answers.** This is a hard gate, not a formality. A spec
written past an unanswered structural question is a spec that will be rewritten.

One question is always worth asking: does this brief bundle more than one
independently deployable capability? The test is whether each would be useful
without the other. If so, propose splitting it.

### 2. Fill in, research, design

Apply the answers, delete the resolved questions, then design. Check the
[Task Router](../../AGENTS.md) for the areas the change touches and read those
docs and ADRs — a spec that contradicts an ADR needs to say so and argue for
it, not ignore it.

If new structural unknowns surface, run the gate again for just those.

### 3. Break it into phases and steps

- A **phase** is a story: a coherent slice a reviewer can reason about.
- A **step** is a testable task inside it.

The rule that makes this useful: **every step leaves the application working.**
Not "compiles" — working. A step that only makes sense together with the next
one is one step, not two.

### 4. Review before implementing

- Does each phase leave a working app?
- Does it respect the invariants in [Core surfaces](../../AGENTS.md)?
- Is the scope one capability, or several wearing one name?
- Are the failure modes written down, not just the happy path?

The scope question is the one an author cannot answer about their own spec.
Hand it to a fresh reader — a subagent given only the file path, or a
colleague — because by then you have read your own framing too many times to
see what it assumes.

### 5. Track progress in the spec

Mark steps done as they land, in the spec file. The spec is the state, so an
interrupted implementation can be picked up without reconstructing where it
got to from the git log.

## Reviewing an existing spec

Report findings by severity, and say what breaks rather than that a rule was
broken:

- **Critical** — tenant isolation, auth bypass, a cross-app schema change with
  no migration story
- **High** — no phasing, no rollback, wrong workspace, contradicts an ADR
  without saying so
- **Medium** — missing failure scenarios, inconsistent terminology, scope bloat
- **Low** — naming, formatting

Start from [TEMPLATE.md](TEMPLATE.md).
