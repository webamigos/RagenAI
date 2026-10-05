---
title: Better Auth OAuth sign-in needs the provider client plugin
modules: [web]
areas: [auth, testing]
topics: [better-auth, oauth, sign-in, client-plugin, e2e]
---

## Context

Adding the MCP preset and a post-login workspace choice to Better Auth 1.7.7.

## Problem

The normal email sign-in succeeded but navigated to onboarding instead of
resuming authorization. Manually constructing `oauth_query` in one form did
not provide the provider's SDK behavior across sign-in methods. The official
`oauthProviderClient()` supplies the filtered signed query and redirect data.
The server-rendered sign-in page must also preserve repeated query parameters
when forwarding an already-authenticated authorization request.

## Rule

Register the provider client plugin alongside the server plugin. Preserve the
signed query including repeated parameters, verify it before continuing, and
prove resume with a browser test that starts without a session and exchanges
the resulting authorization code for a verifiable token.

## Applies to

Better Auth OAuth/MCP flows that resume through an existing sign-in screen.
