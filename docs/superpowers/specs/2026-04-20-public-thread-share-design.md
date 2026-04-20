# Public Thread Share — Design Spec

**Date:** 2026-04-20  
**Status:** Approved  
**Scope:** Publiczne udostępnianie wątku przez link (read-only), analogicznie do ChatGPT share link.

---

## Kontekst

Istniejący model `ThreadShare` obsługuje udostępnianie wątków między użytkownikami tej samej organizacji (wątek pojawia się w sidebarze odbiorcy). To odrębna funkcjonalność od publicznych linków — dlatego wprowadzamy nowy model `ThreadPublicLink` w tej samej domenie `features/threads`.

---

## Model danych

### Nowy model `ThreadPublicLink` (`prisma/schema.prisma`)

```prisma
model ThreadPublicLink {
  id              Int       @id @default(autoincrement())
  publicId        String    @unique @default(uuid()) @map("public_id") @db.Uuid
  threadId        String    @map("thread_id") @db.Uuid
  createdByUserId String    @map("created_by_user_id")
  expiresAt       DateTime? @map("expires_at") @db.Timestamptz
  passwordHash    String?   @map("password_hash")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  thread          Thread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  createdBy       User      @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)

  @@unique([threadId])
  @@index([publicId])
  @@map("thread_public_links")
}
```

**Reguły:**
- Jeden wątek = maksymalnie jeden aktywny publiczny link (`@@unique([threadId])`)
- Revoke = usunięcie rekordu
- Regeneracja = usunięcie + nowy rekord (nowy `publicId`, nowy UUID)
- `expiresAt: null` = nigdy nie wygasa
- Wygasły link zwraca 404 (nie ujawnia że istniał)
- `passwordHash` = bcrypt hash; plaintext nigdy nie trafia do bazy
- Relacje do `Thread` i `User` z `onDelete: Cascade`

### Migracja

Nowa migracja Prisma: `add_thread_public_links`.

---

## Architektura backendu

### Feature module `src/features/threads/`

Nowe pliki (CQRS pattern):

```
services/
  commands/
    create-public-link-command.ts      # generuj publicId, hash hasła bcrypt, zapisz
    revoke-public-link-command.ts      # usuń rekord, sprawdź że caller = właściciel
  queries/
    get-public-link-query.ts           # pobierz link dla wątku (owner view — settings)
    get-public-thread-query.ts         # pobierz wątek po publicId (public view)
    get-user-public-links-query.ts     # wszystkie linki usera (settings page)
```

**`create-public-link-command.ts`:**
- Weryfikuje że `thread.visitorId === currentUserId` (tylko właściciel)
- Weryfikuje że `thread.organizationId === currentUserOrgId`
- Jeśli link już istnieje → zwraca błąd (użytkownik musi najpierw revoke)
- Hash hasła przez `bcrypt` (rounds: 10) przed zapisem
- Zwraca `{ publicId, url }`

**`get-public-thread-query.ts`:**
- Pobiera link po `publicId`
- Jeśli nie istnieje lub wygasł → zwraca `{ status: 'not_found' }`
- Jeśli `passwordHash` ustawiony i brak/błędne hasło w cookie → zwraca `{ status: 'password_required' }`
- Pobiera wątek + wiadomości
- Jeśli `thread.encryptedDek` → deszyfruje przez KMS (`decryptThreadKey` + `decryptContent`)
- Zwraca `{ status: 'ok', title, messages, createdBy: { name } }`

### Server Actions `src/app/actions/thread-public-links.ts`

```typescript
createPublicLinkAction(threadId, expiresAt, password?)  // tylko właściciel
revokePublicLinkAction(threadId)                         // tylko właściciel
verifyPublicLinkPasswordAction(publicId, password)       // publiczne, ustawia cookie
getUserPublicLinksAction()                               // lista linków do settings
```

- `orgId` i `userId` zawsze z sesji (nie z klienta)
- `verifyPublicLinkPasswordAction` po weryfikacji ustawia httpOnly session cookie `thread-pwd-{publicId}` z wartością submitted password (Server Component odczyta i porówna)

### Rate limiting (Middleware)

`src/middleware.ts` — dodać check dla ścieżek `/*/public/thread/*`:
- 30 req/min per IP (Redis `incrWithExpire`, analogicznie do chatbot rate-limit)
- Fails open gdy Redis niedostępny (nie blokuje dostępu)
- Przekracza limit → HTTP 429

---

## Publiczna strona

`src/app/[locale]/public/thread/[publicId]/page.tsx` — Server Component:

```
1. Odczytaj cookie `thread-pwd-{publicId}` z headers
2. Wywołaj get-public-thread-query(publicId, passwordFromCookie)
3. Jeśli null + requiresPassword → renderuj <PasswordGateForm />
4. Jeśli null (wygasły/nieistniejący) → notFound()
5. Renderuj wiadomości read-only
```

**`PasswordGateForm`** (Client Component):
- Formularz z polem hasła
- Wywołuje `verifyPublicLinkPasswordAction` → ustawia cookie → `router.refresh()`
- Błędne hasło → komunikat błędu

**Meta tag:** `<meta name="robots" content="noindex,nofollow">` na stronie.

**Brak:** input czatu, przyciski akcji, sidebar, nawigacja aplikacji.

---

## UI (Panel aplikacji)

### Menu wątku (`ThreadDropdownMenu`)

Nowy item "Udostępnij publicznie" (z ikoną `GlobeAltIcon`) obok istniejącego "Udostępnij", widoczny tylko dla `isOwner`. Otwiera `PublicShareDialog`.

### `PublicShareDialog` (nowy komponent)

**Stan: brak aktywnego linku:**
- Select: czas wygasania (`24h` / `7 dni` / `30 dni` / `nigdy`)
- Input: opcjonalne hasło (type="password")
- Przycisk "Generuj link"

**Stan: aktywny link:**
- Wyświetlony pełny URL (read-only input) + przycisk "Kopiuj"
- Info o wygasaniu ("Wygasa: 27 kwi 2026" lub "Nie wygasa")
- Info czy link jest chroniony hasłem
- Przycisk "Unieważnij link" (destructive)

### Settings page `src/app/[locale]/(panel)/settings/shared-threads/`

Nowa strona ustawień z listą aktywnych publicznych linków zalogowanego użytkownika:
- Kolumny: tytuł wątku, data wygaśnięcia, akcje (Kopiuj link, Unieważnij)
- Pusta lista → komunikat "Brak udostępnionych wątków"
- Pozycja w `SettingsNav` z permission `user` (widoczna dla wszystkich zalogowanych)

---

## SEO / robots.txt

`public/robots.txt` — dodać:
```
Disallow: /*/public/thread/*
```

---

## Testy

### Jednostkowe (Vitest)

| Plik | Co testuje |
|------|-----------|
| `create-public-link-command.test.ts` | tworzenie linku, hash hasła, wygasanie, tylko właściciel |
| `revoke-public-link-command.test.ts` | revoke przez właściciela, próba revoke przez obcego |
| `get-public-thread-query.test.ts` | wygasły link → null, poprawne hasło → wątek, złe hasło → null |
| `get-user-public-links-query.test.ts` | lista linków scopowana do userId |

### E2E (Playwright) — `p1-34-public-thread-share.spec.ts`

1. Zalogowany user tworzy link (bez hasła, 7 dni) → kopiuje URL
2. Odwiedza URL bez sesji → widzi wiadomości read-only
3. Wraca do `settings/shared-threads` → widzi aktywny link
4. Revoke → URL zwraca 404
5. Flow z hasłem: tworzy link z hasłem → odwiedza → password gate → poprawne hasło → wiadomości
6. Flow z hasłem: złe hasło → komunikat błędu

---

## Decyzje architektoniczne

| Kwestia | Decyzja | Uzasadnienie |
|---------|---------|-------------|
| Model danych | Nowy `ThreadPublicLink` | `ThreadShare` ma inną semantykę (user-to-user w org), łączenie przez nullable userId tworzy god table |
| Snapshot wiadomości | Na żywo (live) | Prostsze, bardziej użyteczne; DEK cache minimalizuje koszty KMS |
| KMS przy publicznym dostępie | Deszyfruj przy każdym żądaniu | DEK cache per-request = jedno wywołanie KMS niezależnie od liczby wiadomości |
| Rate limiting | Middleware dla `/*/public/thread/*` | Jedyne miejsce z dostępem do `request.headers` bez route handlera |
| Brak API route | Server Components + Server Actions | Zgodnie z konwencją projektu |
| Password gate | httpOnly session cookie `thread-pwd-{publicId}` | Server Component nie ma stanu; cookie bezpieczne i transparentne |
| Jeden link per wątek | `@@unique([threadId])` | Upraszcza UI (brak listy linków per wątek), revoke = regeneracja |
