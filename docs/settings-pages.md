# Settings Pages

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Two sections, each with its own menu **in the sidebar**: inside `/settings` or `/organization` the sidebar's body lists that section's pages in place of the main menu and the thread history, with "Main menu" at the top. Neither section has a menu column of its own. The component is `src/app/components/Sidebar/SectionMenu/SectionSidebarBody.tsx`; the entries come from `src/features/settings/registry.ts`.

| Section | Registry | Who sees it | Pages |
|---|---|---|---|
| `/settings` | `settingsRegistry` | every member | General, Account, Connectors, Shared threads, Memory (while `personalMemory` is on, or the user still has memories) |
| `/organization` | `organizationRegistry` | org admins and app admins (`/organization/layout.tsx` redirects anyone else) | Settings, RAG pipeline, Users, Teams, Chatbots, API keys, Security, AI usage, Disk usage, Connectors, Audit log, Knowledge analytics, PII policy |

A page goes in the registry of the section whose guard it needs. `settingsRegistry` holds only `requireRole: 'user'` entries (`registry.test.ts` fails otherwise); an administrator screen belongs under `/organization`. Knowledge analytics and PII policy used to be listed in the settings menu under "Privacy" and live in the organization menu now; their old `/settings/...` URLs redirect.

The menus are filtered **server-side**, in the panel layout (`src/app/[locale]/(panel)/layout.tsx`), with `filterSettingsPages()` and the capabilities from `@/lib/auth-access-control` — not from client hooks. The sidebar draws what it is handed.

"Main menu" goes back to the last page the reader visited outside both sections (`SectionMenu/return-path.ts`, per tab in `sessionStorage`), or to a new chat when there is none.

`/settings` → `/settings/general`. Theme via `next-themes` (ThemeProvider in `Providers.tsx`, `attribute="class"`, `defaultTheme="system"`). i18n namespaces: `settings-page`, `organization-page`.
