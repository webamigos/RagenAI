---
sidebar_position: 8
---

# OAuth sign-in

How to configure an OAuth identity provider for signing in to Ragen. Today
that means **Google, on the admin panel**. This page is written so that adding
a second provider later is a matter of following the same four steps with
different console screens.

## What exists today, and what does not

| Surface | Sign-in methods | OAuth provider |
|---|---|---|
| The main app (`:3000`) | e-mail + password, magic link | none |
| The admin panel (`:3200`) | e-mail + password, Google | Google |

Two things follow from that table:

- **The main app has no social sign-in.** Not "unconfigured" — not built.
  Configuring `GOOGLE_CLIENT_ID` does not add a Google button to
  `:3000`. SSO proper (SAML, Entra ID, SCIM directory sync) and MFA are
  [not built yet](/docs/security) either.
- **The admin panel offers Google only when it is configured.** The login page
  shows the button when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
  set, and shows only the password form otherwise — so "no Google button on
  the login page" is the symptom to look for when the credentials have not
  reached the process. The check runs per request, so a container built
  without the variables and started with them offers the button without a
  rebuild.

Google sign-in is never the _only_ way into the panel. Password sign-in shares
the `users` table with the main app, so the platform administrator created by
the first-run screen can always get in. Treat Google as a convenience for a
team that already lives in Google Workspace, not as a dependency.

## Do not confuse this with connector OAuth

Ragen contains a second, unrelated Google OAuth client: the one
ragen-token-vault uses to connect a _user's_ Google Calendar, Drive, Analytics
and Ads as retrieval and tool sources.

|  | Admin-panel sign-in | Connector OAuth |
|---|---|---|
| Who authenticates | an operator, to reach `:3200` | an end user, to link their own Google account |
| Which service holds the secret | `apps/admin` | ragen-token-vault |
| Redirect URI | `{admin URL}/api/auth/callback/google` | `{vault URL}/v1/oauth/google/callback` |
| Scopes | `openid`, `email`, `profile` | Calendar / Drive / Analytics / Ads scopes |
| Where tokens end up | the `accounts` table | the vault, AES-256-GCM encrypted |

**They read environment variables with the same two names** —
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — and one root `.env.local`
serves every app in the monorepo. So pasting one pair of credentials in
silently repoints the other feature at the wrong Google Cloud client.

Pick one of two ways out, deliberately:

- **One OAuth client, both redirect URIs.** Register both callback URLs on the
  same client in Google Cloud, and request every scope both need. Simplest,
  and fine for a single-tenant install.
- **Two OAuth clients, separate environments.** Keep the pair meant for the
  vault in ragen-token-vault's own environment and the pair meant for the
  panel in `apps/admin`'s, rather than in the shared root file. Better
  separation; it is the option to choose if the vault is deployed separately.

## Configuring Google for the admin panel

### 1. Create the OAuth client

In the [Google Cloud Console](https://console.cloud.google.com/), pick or
create a project, then:

1. **APIs & Services → OAuth consent screen.** Choose **Internal** if everyone
   who will sign in is in your Google Workspace — it skips verification
   entirely. Choose **External** otherwise, and add each administrator as a
   test user while the app is unpublished.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   application type **Web application**.
3. Under **Authorized redirect URIs**, add the panel's callback — the path is
   fixed by Better Auth:

   ```
   http://localhost:3200/api/auth/callback/google      # local
   https://admin.example.com/api/auth/callback/google  # deployed
   ```

   Add every origin the panel is reachable on. Google matches the URI exactly:
   a trailing slash, `http` where you deployed `https`, or the bare hostname
   without `admin.` all produce `redirect_uri_mismatch`.

No scopes need configuring on the client. Better Auth requests `openid`,
`email` and `profile` by default for Google, and those three need no
consent-screen review.

### 2. Set the credentials

```bash
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
```

Read by `apps/admin`. Put them in `apps/admin/.env.local` rather than the root
`.env.local` if this install also runs connector OAuth — see
[above](#do-not-confuse-this-with-connector-oauth).

`BETTER_AUTH_URL` must match the origin you registered, because Better Auth
builds the redirect URI from it. A panel served at `https://admin.example.com`
with `BETTER_AUTH_URL=http://localhost:3200` sends Google a localhost callback
and fails at the mismatch.

### 3. Decide who may create an account through it

```bash
ADMIN_ALLOWED_EMAIL_DOMAIN="example.com"
```

Restricts which e-mail domain may create a **new** account through Google
sign-in. It defaults to `webamigos.pl`, which is wrong for every install but
ours — **set it, or set it to an empty string to allow any domain.** Leaving
the default in place on your own install means every Google sign-in by a new
user is refused.

This is a second gate, not the primary one. Access to the panel is decided by
`User.role = 'admin'`, re-read from the database on every request. An account
that clears the domain check still sees nothing until somebody grants it the
platform role from **Users** in the panel. That is why setting the domain
empty is reasonable: the role is what actually protects the panel.

The check runs only on account _creation_. Existing accounts are unaffected by
changing it.

### 4. Verify

1. Restart the panel so it picks up the new environment.
2. Open `http://localhost:3200`. The **Sign in with Google** button appears
   only when both credentials reached the process — if it is missing, the
   environment is the thing to check, not Google.
3. Click it and complete the consent screen. Expect one of these outcomes:

| What you see | What it means |
|---|---|
| The dashboard | Working. |
| No Google button at all | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is unset or blank in the panel's own environment. |
| `That account is not a platform administrator.` | OAuth worked; the account has no `User.role = 'admin'` yet. Grant it from **Users** while signed in as an existing administrator. |
| A Google error page | The client is misconfigured — see below. |

### When it fails

| Error | Cause |
|---|---|
| `redirect_uri_mismatch` | The callback URI is not registered on the client, or `BETTER_AUTH_URL` does not match the origin the browser is on. Compare both strings character by character. |
| `invalid_client` | A credential is mistyped, revoked, or belongs to a different Google Cloud project — including the case where the connector-OAuth pair has been pasted in by mistake. An *unset* variable does not produce this: the button is not rendered at all. |
| `access_blocked` / "has not completed verification" | An **External** consent screen that is unpublished and does not list this account as a test user. |
| Sign-in completes, then bounces back to the login page | The new account was refused by `ADMIN_ALLOWED_EMAIL_DOMAIN`, or it exists but has no platform role. |

Failed sign-ins are visible in the panel under **Incidents**.

## Adding another provider

Better Auth supplies the provider implementations, so a second OAuth provider
is configuration in `apps/admin/src/lib/auth.ts` plus a button — not a new
authentication stack. What a provider needs is the same four things Google
needed: an OAuth client in that vendor's console, a registered redirect URI of
the form `{admin URL}/api/auth/callback/{provider}`, a client ID and secret
pair, and a decision about who may create an account through it.

Microsoft Entra ID is the next one planned, and it is the interesting case:
the intent is sign-in for the **main app**, not just the panel, which is the
part that does not exist today. That is a feature, not a configuration — this
page will grow an Entra section when it ships, and the table at the top is
where to check what is actually wired up rather than planned.
