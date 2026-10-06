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

The provider clears signed-query timing before `postLogin.shouldRedirect`.
A saved selection alone therefore cannot distinguish a fresh authorization
from its continuation: skipping it bypasses the workspace screen, and always
redirecting causes a loop. Use the original request path from the framework's
public auth context to distinguish `/oauth2/continue`, and revalidate the
selection's user, session, client, lifetime and live permissions there.

## Rule

Register the provider client plugin alongside the server plugin. Preserve the
signed query including repeated parameters, verify it before continuing, and
prove resume with a browser test that starts without a session and exchanges
the resulting authorization code for a verifiable token. Authorize the same client
twice in the browser to prove that both flows require workspace selection and
that replacing a grant invalidates the old refresh token.

## Applies to

Better Auth OAuth/MCP flows that resume through an existing sign-in screen.
