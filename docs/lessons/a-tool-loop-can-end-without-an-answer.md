---
title: A tool-calling loop can end on its step limit without a word of answer, and a model may ignore the setting meant to stop it
modules: [web]
areas: [rag, testing]
topics: [llm, ai-sdk, tool-calling, gemini, vertex, tool-choice, step-limit, brain, empty-answer, mocks, false-green]
---

## Context

The Brain operator's assistant (spec 2026-09-25-brain-operator-assistant)
answers through `streamText` with read tools and `stopWhen: stepCountIs(n)`.
Every unit and e2e test passed: the mock model reads once or twice and then
writes. The first run against the organization's real model
(`gemini-3-flash-preview` on Vertex) was a different picture.

## Problem

Two of ten questions came back as an empty bubble under "Read 10 items from
Brain". The model kept reading — `searchPages` three times, `listFindings`
twice — until the loop stopped on its step limit, and the last step was a tool
call, so there was no text to show and none to store.

The obvious fix did not hold. `prepareStep` returning `toolChoice: 'none'` on
the last step was ignored: Gemini emitted another function call, once for a
tool that did not exist (`listPages`). A closing call with **no tools
declared at all**, given the loop's call-and-result history, was answered with
yet another function call — the model imitates the shape of the conversation
it is handed, whatever the request declares.

A mock that always answers after one read cannot find any of this.

## Rule

- A tool loop must be guaranteed to end in text by construction, not by a
  request setting: after the loop, if nothing was written, make one more call
  with no tools and the results **rendered as plain text** in a user turn —
  never the tool-call history.
- Tell the model how many reads a question usually needs and not to repeat a
  call; it cuts the loops but does not replace the guarantee.
- Test the loop against a mock that never stops calling tools, and check the
  real model before believing a tool-calling feature works.

## Applies to

`apps/web/src/features/brain-assistant/services/commands/run-brain-assistant-turn-command.ts`
(`stepPolicy`, `describeReads`, the closing pass), and any new `streamText`
call with tools and a step limit.
