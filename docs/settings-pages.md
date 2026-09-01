# Settings Pages

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Under `src/app/[locale]/(panel)/settings/` with dedicated `layout.tsx` (internal left nav — main sidebar doesn't change). Nav in `settings/components/SettingsNav.tsx`.

| Permission | Nav items |
|---|---|
| `user` | General, Account, Connectors |
| `orgAdmin` (via `useOrganization().isOrgAdmin`) | Organization, Assistant settings, Subscription, Teams |
| `appAdmin` (via `useUser().isAppAdmin`) | API Keys, Users, AI Usage, Disk Usage |

App admins see everything. `/settings` → `/settings/general`. Theme via `next-themes` (ThemeProvider in `Providers.tsx`, `attribute="class"`, `defaultTheme="system"`). i18n namespace: `settings-page`.
