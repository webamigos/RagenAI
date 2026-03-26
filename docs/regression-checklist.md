# Manual Regression Test Checklist — Ragen App

## P0 — Critical (Must Pass)

### Authentication

- [ ] Sign up with email/password — account created, email verification sent
- [ ] Sign in with valid credentials — redirects to dashboard
- [ ] Sign in with invalid credentials — shows error, no access
- [ ] Forgot password — reset email sent, link works, password changed
- [ ] Session persists on page refresh
- [ ] Logout — clears session, redirects to login
- [ ] Protected routes redirect unauthenticated users to sign-in

### Chat / Threads (Core Flow)

- [ ] Create new thread — thread appears in sidebar
- [ ] Send a message — AI response streams back
- [ ] Message history loads correctly when reopening a thread
- [ ] Multiple messages in sequence — context is maintained
- [ ] RAG mode — response includes citations/sources from knowledge base
- [ ] Switch between threads — correct messages displayed
- [ ] Thread auto-titles after first message

### Knowledge Base / Documents

- [ ] Upload PDF — file appears in project files, processing starts
- [ ] Upload multiple files — all process correctly
- [ ] Document reaches "embedded" status — available for RAG retrieval
- [ ] Delete a document — removed from list and search
- [ ] Add content from URL — parsed and embedded

### Projects

- [ ] Create new project — appears in project list
- [ ] Set project system prompt — AI uses it in responses
- [ ] Attach knowledge base to project — documents available in chat
- [ ] Delete project — removed, threads still accessible or handled

### Message Encryption (Staging/Prod)

- [ ] New messages are encrypted at rest (verify `Message.content` is not plaintext in DB)
- [ ] Messages decrypt correctly on read
- [ ] Threads without DEK work in plaintext mode (local dev)

---

## P1 — High Priority

### Thread Management

- [ ] Rename thread — title updates in sidebar
- [ ] Star/favorite thread — appears in favorites section
- [ ] Delete thread — removed from sidebar and DB
- [ ] Search threads — results match by title
- [ ] Thread list pagination/scroll — loads more threads

### Assistant Configuration

- [ ] Switch AI model (if feature flag enabled) — response uses selected model
- [ ] Model selection persists per thread/project
- [ ] Chat with different models produces valid responses

### Organization & Members

- [ ] View org members list
- [ ] Invite new member — invitation email sent
- [ ] Accept invitation — new member sees org content
- [ ] Remove member — loses access to org
- [ ] Change member role (admin/member) — permissions update
- [ ] Switch between organizations — correct data loads

### API Keys (Admin)

- [ ] Create API key — key displayed once, hashed in DB
- [ ] API call with valid key — returns data
- [ ] API call with invalid key — returns 401
- [ ] Delete API key — subsequent calls fail

### Public / Shared Access

- [ ] Enable public chatbot on project — generates access token
- [ ] Access public chat via token URL — can chat without login
- [ ] Share thread link — recipient can view thread
- [ ] Revoke share — link no longer works
- [ ] Embed widget on external page — chat loads and works

### Connectors (MCP Integrations)

- [ ] Connect Google Calendar — OAuth flow completes
- [ ] AI uses Google Calendar tools in chat when asked
- [ ] Connect Google Drive — OAuth flow completes
- [ ] Import files from Google Drive folder — files appear in project
- [ ] Connect/disconnect HubSpot — connector status updates
- [ ] Connect/disconnect ClickUp — connector status updates
- [ ] Connect Gmail — OAuth flow, AI can search emails
- [ ] Register Fireflies API key — transcripts accessible
- [ ] Disconnect connector — tools no longer available in chat

---

## P2 — Medium Priority

### Settings

- [ ] Change theme (light/dark/system) — UI updates immediately
- [ ] Change language (EN/PL) — all UI text switches
- [ ] Edit profile name — updates displayed everywhere
- [ ] Change password from account settings — new password works

### Voice Features

- [ ] Send voice message — transcribed to text, AI responds
- [ ] TTS on AI response — audio plays correctly
- [ ] Select different TTS voice — voice changes

### Subscription & Billing

- [ ] View current plan details
- [ ] Upgrade plan — checkout flow completes
- [ ] Cancel subscription — status updates
- [ ] Plan limits enforced (file count, storage, members)

### Google Drive Sync

- [ ] Search Drive folders from picker dialog
- [ ] Select specific files from folder for import
- [ ] Attach Drive folder content to chat prompt
- [ ] Imported files show correct metadata (source, modified time)

### Document Operations

- [ ] Create markdown document manually — saves and embeds
- [ ] Edit existing markdown document — changes persist
- [ ] View document preview/details page
- [ ] File thumbnail renders for supported formats

### Teams

- [ ] Create team — appears in teams list
- [ ] Add members to team
- [ ] Share thread with team — team members can access
- [ ] Remove member from team — loses access to shared threads
- [ ] Delete team

---

## P3 — Low Priority / Admin

### App Admin Functions

- [ ] View all users across organizations
- [ ] Ban user — user cannot sign in
- [ ] Unban user — access restored
- [ ] AI usage dashboard loads with data
- [ ] Disk usage dashboard loads with per-org breakdown
- [ ] Audit logs display recent actions
- [ ] Create new organization (admin)
- [ ] Encrypt all threads action (admin) — batch completes

### Onboarding

- [ ] First-time user sees onboarding flow
- [ ] Onboarding creates default org + project
- [ ] Mark onboarding complete — dashboard loads

### Edge Cases & Error Handling

- [ ] Upload unsupported file type — error message shown
- [ ] Upload file exceeding size limit — rejected with message
- [ ] Send message with no AI model configured — graceful error
- [ ] API rate limiting works (if Redis enabled)
- [ ] Concurrent message sends in same thread — no data corruption
- [ ] Network disconnect during streaming — UI handles gracefully

### i18n

- [ ] All pages render correctly in English
- [ ] All pages render correctly in Polish
- [ ] Date/time formatting respects locale
- [ ] Error messages are translated

### Notifications

- [ ] Push notification delivery (if configured)
- [ ] SSE notification stream connects

### API (v1) Regression

- [ ] `GET /api/v1/healthcheck` — returns 200
- [ ] `GET /api/v1/threads` — lists threads for API key's org
- [ ] `POST /api/v1/threads` — creates thread
- [ ] `POST /api/v1/threads/:id/messages` — sends message, streams response
- [ ] `GET /api/v1/assistants` — lists assistants
- [ ] `GET /api/v1/documents` — lists documents
- [ ] API-only mode (`IS_API_MODE=1`) — `/v1` rewrites work
