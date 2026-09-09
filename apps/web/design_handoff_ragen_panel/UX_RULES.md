# Ragen panel — UX & copy rules

Short list, meant to be pasted into `AGENTS.md` / `CLAUDE.md` so agents building
in `apps/web` make the same calls a designer would.

## Layout

1. **One left sidebar, three zones.** Actions (New chat, Search, Notifications) →
   Library (Threads, Assistants, Knowledge) → Recent, grouped by day. The org and
   user switchers stay pinned at the bottom. Never mix a nav destination and an
   action in the same zone.
2. **Content is capped at 1120px and left-aligned inside the pane**, except
   table-heavy pages, which run full width (`data-panel-fullwidth`).
3. **Page header is one row**: title (display font) + primary action, right
   aligned. No breadcrumb unless the page is nested two levels deep.
4. **Panels are line drawings.** White surface, 1px `--border`, 6px radius, no
   shadow. Shadow means "this floats above the page" — popovers, dialogs, toasts.
5. **Nothing centres vertically in a full-height empty pane.** Content starts at
   the top of the safe area; an empty state is a compact block, not a hero.

## The assistant

6. **The composer is the page on a new chat.** Model picker, attachments and
   knowledge scope are visible controls inside the composer, never behind a menu.
7. **Every answer that used retrieval shows its sources.** Inline markers
   `[1]` in crimson, and a Sources block under the answer listing file, page and
   a one-line snippet. An answer with no sources says so explicitly.
8. **Show the work, collapsed.** Retrieval and tool calls appear as one
   summarising row ("Searched 3 documents · 240 ms") that expands. Never a
   silent spinner and never a wall of trace.
9. **Streaming states**: caret while streaming, Stop button replaces Send,
   Regenerate / Copy / Cite appear only after the answer completes.

## Tables (knowledge base, members, audit)

10. **Scanning beats density.** 32px rows, 11px uppercase display column headers,
    tabular numerals for size and date, name column left, everything numeric right.
11. **One status column, one badge vocabulary**: Ready (green), Processing
    (amber, with a determinate bar if progress is known), Failed (crimson).
12. **Row actions live in a hover-revealed group at the row end**, plus a `⋯` menu
    for the rest. Selection checkboxes only on tables that have bulk actions.
13. **Filters are chips above the table**, showing their current value in the
    label ("Status: Ready"), and a Clear all appears once any filter is set.

## Colour discipline

14. **Navy (`--primary`) is the only action colour** — primary buttons, active
    nav fill tint, focus ring, links.
15. **Crimson is rationed to two jobs**: the `--marker` hairline (active nav rail,
    active tab underline, citation markers) and destructive actions. It is never
    a body-text colour, never a link, never a second accent.
16. **Green and amber only encode document or job state.** Not success messages,
    not decoration.

## Copy

17. **Sentence case everywhere** — buttons, headers, menu items. No Title Case,
    no ALL CAPS except the eyebrow style.
18. **Buttons are verbs on the object**: "Add document", "Invite user",
    "Revoke session". Never "Submit", "OK", "Click here".
19. **Empty states are two lines and one action.** What this is for, then the
    action. No illustration, no exclamation marks.
20. **Errors say what happened, then what to do.** "Upload failed — file is over
    the 50 MB limit. Split it or compress it and try again."
21. **Never promise privacy in a label the backend does not enforce.** PII copy
    matches the policy names exactly: None, Sensitive data, All personal data.
22. **Numbers carry a unit and a scale**: "1.54 kB", "2 of 240 documents",
    "Last active 8 Sep, 15:27".

## Accessibility floor

23. Focus ring is `2px --ring` at `2px` offset on every interactive element.
24. Body text ≥ 13px and ≥ 4.5:1; 11px is allowed only for metadata at ≥ 4.5:1.
25. Hit targets ≥ 28px tall in toolbars, ≥ 32px everywhere else.
26. State is never colour alone — a badge carries a word, a chart carries a label.
