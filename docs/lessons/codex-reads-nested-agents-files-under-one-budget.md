---
title: "Codex reads every AGENTS.md on the path under one 32 KiB budget, so a nested brief behind a full root is mostly never read"
modules: [api, worker, docs]
areas: [architecture]
topics: [agents-md, codex, claude-code, instruction-budget, fail-open, architecture-tests]
---

# Codex reads every AGENTS.md on the path under one 32 KiB budget, so a nested brief behind a full root is mostly never read

**In short**: the budget guard checked each `AGENTS.md` against 32,768 bytes on
its own. Codex concatenates root-to-cwd and stops at that total, so with a
31.6 KB root, Codex working in apps/api saw about 1 KB of the 26 KB
`apps/api/AGENTS.md`, and apps/worker was the same. Every check was green. The
root now gets 28 KiB, a nested brief 3 KiB, and the long-form guides moved to
`apps/*/docs/agent-guide.md`, which `CLAUDE.md` imports for Claude Code.

## Context

`AGENTS.md` at the root carried a byte budget enforced by
`tests/architecture/agent-instructions-fit-the-budget.test.ts`, written after
the file came within 36 bytes of Codex's `project_doc_max_bytes`. apps/api and
apps/worker each had their own `AGENTS.md`, around 26 KB, and the test covered
them in the same loop.

## Problem

`project_doc_max_bytes` limits what Codex *reads in total*: it walks from the
repository root down to the working directory, appends each `AGENTS.md` it
finds, and stops adding once the combined size reaches the limit. A
per-file check was the wrong shape of test. It passed for a file whose content
almost never arrived, and nothing anywhere warns that it was cut. The root had
also drifted to 139 bytes under its own early-warning line, so the next Task
Router row would have turned `verify` red.

Claude Code behaves differently: it loads a nested `CLAUDE.md` on its own,
with no shared budget, so the problem was invisible from the tool most
contributors use.

## Rule

Budget agent instructions by **what one tool reads in one session**, not
file by file. Keep a nested `AGENTS.md` to the rules and a pointer, and put the
long form in `docs/`. Where Claude Code should still get the long form
automatically, import it from that directory's `CLAUDE.md`
(`@AGENTS.md` + `@docs/agent-guide.md`).

## Applies to

Every `AGENTS.md` below the root, and any tool that concatenates instruction
files (Codex today). The guard enforces root ≤ 28,672 bytes, nested ≤ 3,072,
and that each pair stays under 32,768.
