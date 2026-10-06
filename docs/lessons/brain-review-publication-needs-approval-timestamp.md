---
title: 'Brain publication after approval needs the timestamp of that approval'
modules: ['web', 'brain']
areas: ['frontend', 'architecture', 'testing']
topics: ['brain', 'review', 'publication', 'concurrency', 'optimistic-locking']
---

## Context

Review mode offers approval and publication as one user action, while the existing commands commit two separately audited acts.

## Problem

Publishing with the screen's original updatedAt conflicts with the approval that just committed. Fetching a fresh timestamp afterwards can instead accept an intervening edit by another reviewer. A publication failure also must not look as if nothing was approved.

## Rule

Have the approval return the timestamp it wrote while holding the page lock, and pass that exact timestamp to publication's optimistic check. An intervening change then conflicts. Keep the two ledger decisions; if publication fails, preserve approval, refresh the screen and explicitly say which step committed. Test both refusal before approval and failure after approval. Bulk owner assignment separately locks all candidate rows in stable id order and records one SET_OWNER per changed page, not per source quote.

Synthetic E2E cleanup must remove only its own decision rows before removing its pages: the ledger foreign key intentionally uses NoAction. Otherwise a cleanup failure can hide whether the review assertions succeeded. Product deletion rules remain unchanged.

Stage new production files before the final gate: architecture guards discover git-tracked writers. A green run while a new command is untracked does not cover its access writes. The bulk command mirrors only retained published Brain files, whose generation-tagged chunks use the unchanged page ACL, so it belongs beside the existing single-page owner command in the documented access-sync exemptions.

## Applies to

Brain review mode and any future UI that sequences existing optimistic commands.
