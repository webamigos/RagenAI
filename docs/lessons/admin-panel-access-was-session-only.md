---
title: 'A dashboard layout does not protect Server Actions, and a non-existent Better Auth option fails silently'
modules: ['admin']
areas: ['security']
topics: ['access-control', 'better-auth', 'server-actions']
---

# A dashboard layout does not protect Server Actions, and a non-existent Better Auth option fails silently

**Context**: `apps/admin` is the platform admin panel — every organization, user, limit, model, incident and subscription. Access was meant to be restricted to `@webamigos.pl` accounts signing in with Google. `apps/admin/src/lib/auth.ts` expressed that as `callbacks: { onBeforeCreateUser }`, `proxy.ts` checked only that a session cookie existed, and `(dashboard)/layout.tsx` checked only `if (!session)`.

**Problem**: three failures stacked.

1. **`callbacks` is not a Better Auth option.** The library (1.4.18) has `databaseHooks.user.create.before`; the string `onBeforeCreateUser` appears nowhere in it. The whole object was ignored, so the domain restriction never ran. TypeScript did not catch it — `betterAuth<O extends BetterAuthOptions>` is generic, and excess-property checking does not apply through the inferred type parameter.
2. **No role check anywhere.** `users` is a single table shared with `apps/web`, so every ordinary customer account holds a session that satisfies "a session exists". Any customer who could complete the configured Google OAuth flow reached the full panel.
3. **Server Actions were not covered at all.** A Server Action is a POST endpoint; it does not run the route's layout. Seven of the twelve action files had no session check whatsoever — `banUserAction` and `renameUserAction` among them — so the layout's guard was irrelevant to them either way.

**Rule**: authorization for a Next.js app lives in the data path, not in the layout. A layout guard protects _rendering_ and nothing else — every Server Action needs its own guard as its first statement, and a test should assert that mechanically rather than by review (see `apps/admin/src/lib/__tests__/server-actions-are-guarded.test.ts`, which checks the first statement, not merely that the guard appears somewhere in the body). Separately: when configuring a library through a plain options object, confirm the key exists in its published types — `grep` the option name in `node_modules/<pkg>/dist` before trusting that a hook runs. A silently-ignored security option looks exactly like a working one.

**Applies to**: `apps/admin` (all of `(dashboard)/*/actions.ts` and `lib/auth-guard.ts`); the same layout-does-not-cover-actions reasoning applies to `apps/web`'s Server Actions, which derive org and user from the session via `getOrgIdFromAuthOrThrow()` per action for this reason.
