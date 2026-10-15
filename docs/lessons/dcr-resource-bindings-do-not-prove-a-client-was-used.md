---
title: DCR resource bindings do not prove a client was used
modules: [web]
areas: [auth, testing]
topics: [better-auth, oauth, dcr, retention, prisma]
---

**In short**: Real anonymous registration creates resource bindings before consent. Test the provider endpoint with an empty cookie context and delete unused bindings with their client in one serializable transaction.

## Context

OAuth maintenance removes anonymous clients older than 30 days when they have no consent or token records.

## Problem

Synthetic client fixtures omitted resource bindings. Better Auth creates those bindings during dynamic client registration, before consent. Treating a binding as usage retained every real registered client. The default authenticated Playwright request also failed anonymous registration with 403.

## Rule

Exercise the real registration endpoint with a cookie-free request context. Preserve owned clients and clients with consents or tokens; remove unused registration resource bindings and the client in the same serializable transaction, with bounded serialization retries.

## Applies

Provider-backed OAuth client retention and integration tests that construct provider records directly.
