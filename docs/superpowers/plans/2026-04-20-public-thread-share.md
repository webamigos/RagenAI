# Public Thread Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umożliwić użytkownikom udostępnianie wątków jako publicznych linków read-only (z opcjonalnym hasłem i wygasaniem), dostępnych bez logowania.

**Architecture:** Nowy model `ThreadPublicLink` w schemacie Prisma (osobny od istniejącego `ThreadShare`). Backend: CQRS commands/queries w `features/threads/`, server actions w `app/actions/thread-public-links.ts`. Frontend: `PublicShareDialog` w menu wątku + strona publiczna Server Component + strona zarządzania w settings. Rate limiting przez middleware Next.js.

**Tech Stack:** Prisma 7, Next.js 16 App Router, React 19, bcrypt, next-intl, Tailwind CSS 4, Vitest, Playwright.

---

## Mapa plików

### Nowe pliki
- `prisma/migrations/<timestamp>_add_thread_public_links/migration.sql`
- `src/features/threads/services/commands/create-public-link-command.ts`
- `src/features/threads/services/commands/revoke-public-link-command.ts`
- `src/features/threads/services/commands/__tests__/create-public-link-command.test.ts`
- `src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts`
- `src/features/threads/services/queries/get-public-link-query.ts`
- `src/features/threads/services/queries/get-public-thread-query.ts`
- `src/features/threads/services/queries/get-user-public-links-query.ts`
- `src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts`
- `src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts`
- `src/app/actions/thread-public-links.ts`
- `src/app/[locale]/public/thread/[publicId]/page.tsx`
- `src/app/[locale]/public/thread/[publicId]/PasswordGateForm.tsx`
- `src/app/components/PublicShareDialog.tsx`
- `src/app/components/__tests__/PublicShareDialog.test.tsx`
- `src/app/[locale]/(panel)/settings/shared-threads/page.tsx`
- `e2e/p1-34-public-thread-share.spec.ts`

### Modyfikowane pliki
- `prisma/schema.prisma` — dodać model `ThreadPublicLink` + relacje w `Thread` i `User`
- `src/features/threads/contracts/thread.types.ts` — nowe typy dla public links
- `src/app/components/ThreadDropdownMenu.tsx` — nowy item "Udostępnij publicznie"
- `src/features/settings/registry.ts` — nowy wpis `shared-threads`
- `src/app/messages/en.json` — nowe klucze tłumaczeń
- `src/app/messages/pl.json` — nowe klucze tłumaczeń
- `public/robots.txt` — dodać `Disallow: /*/public/thread/*`
- `src/middleware.ts` (jeśli istnieje) lub nowy `src/middleware.ts` — rate limiting

---

## Task 1: Migracja bazy danych i schemat Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_thread_public_links/migration.sql`

- [ ] **Krok 1: Dodaj model do schema.prisma**

Otwórz `prisma/schema.prisma`. Na końcu pliku, po modelu `ThreadShare`, dodaj:

```prisma
model ThreadPublicLink {
  id              Int       @id @default(autoincrement())
  publicId        String    @unique @default(uuid()) @map("public_id") @db.Uuid
  threadId        String    @unique @map("thread_id") @db.Uuid
  createdByUserId String    @map("created_by_user_id")
  expiresAt       DateTime? @map("expires_at") @db.Timestamptz
  passwordHash    String?   @map("password_hash")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  thread          Thread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  createdBy       User      @relation("CreatedPublicLinks", fields: [createdByUserId], references: [id], onDelete: Cascade)

  @@index([publicId])
  @@map("thread_public_links")
}
```

W modelu `Thread` (sekcja z relacjami) dodaj:
```prisma
  publicLink        ThreadPublicLink?
```

W modelu `User` (sekcja z relacjami) dodaj:
```prisma
  createdPublicLinks ThreadPublicLink[] @relation("CreatedPublicLinks")
```

- [ ] **Krok 2: Uruchom migrację**

```bash
npx prisma migrate dev --name add_thread_public_links
```

Oczekiwany output: `The following migration(s) have been created and applied...`

- [ ] **Krok 3: Zregeneruj typy Prisma**

```bash
npm run generate:types
```

Oczekiwany output: brak błędów, zaktualizowane pliki w `src/generated/prisma/`.

- [ ] **Krok 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/
git commit -m "feat: add ThreadPublicLink prisma model and migration"
```

---

## Task 2: Typy kontraktowe

**Files:**
- Modify: `src/features/threads/contracts/thread.types.ts`

- [ ] **Krok 1: Dodaj nowe typy**

Na końcu pliku `src/features/threads/contracts/thread.types.ts` dodaj:

```typescript
export type PublicLinkDto = {
  publicId: string;
  threadId: string;
  threadTitle: string | null;
  expiresAt: string | null;
  hasPassword: boolean;
  createdAt: string;
};

export type CreatePublicLinkInput = {
  threadId: string;
  expiresAt: Date | null;
  password?: string;
};

export type PublicThreadResult =
  | { status: 'ok'; title: string | null; messages: { role: string; content: string }[]; createdByName: string | null }
  | { status: 'not_found' }
  | { status: 'password_required' }
  | { status: 'password_invalid' };
```

- [ ] **Krok 2: Commit**

```bash
git add src/features/threads/contracts/thread.types.ts
git commit -m "feat: add PublicLinkDto and PublicThreadResult types"
```

---

## Task 3: Command — tworzenie publicznego linku

**Files:**
- Create: `src/features/threads/services/commands/create-public-link-command.ts`
- Create: `src/features/threads/services/commands/__tests__/create-public-link-command.test.ts`

- [ ] **Krok 1: Napisz test (TDD)**

Utwórz `src/features/threads/services/commands/__tests__/create-public-link-command.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicLinkCommand } from '../create-public-link-command';

const mockDb = {
  thread: {
    findFirst: vi.fn(),
  },
  threadPublicLink: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));
vi.mock('bcrypt', () => ({ hash: vi.fn().mockResolvedValue('hashed_pw') }));

describe('createPublicLinkCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when thread not found', async () => {
    mockDb.thread.findFirst.mockResolvedValue(null);

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: false, error: 'Thread not found' });
  });

  it('returns error when user is not the thread owner', async () => {
    mockDb.thread.findFirst.mockResolvedValue({ id: 'thread-1', visitorId: 'other-user' });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: false, error: 'Only the thread owner can create a public link' });
  });

  it('returns error when link already exists', async () => {
    mockDb.thread.findFirst.mockResolvedValue({ id: 'thread-1', visitorId: 'user-1' });
    mockDb.threadPublicLink.findUnique.mockResolvedValue({ publicId: 'existing-id' });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: false, error: 'Public link already exists. Revoke it first.' });
  });

  it('creates link without password', async () => {
    mockDb.thread.findFirst.mockResolvedValue({ id: 'thread-1', visitorId: 'user-1' });
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);
    mockDb.threadPublicLink.create.mockResolvedValue({ publicId: 'new-public-id' });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: true, publicId: 'new-public-id' });
    expect(mockDb.threadPublicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: null }),
      })
    );
  });

  it('hashes password when provided', async () => {
    mockDb.thread.findFirst.mockResolvedValue({ id: 'thread-1', visitorId: 'user-1' });
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);
    mockDb.threadPublicLink.create.mockResolvedValue({ publicId: 'new-public-id' });

    await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
      password: 'secret',
    });

    expect(mockDb.threadPublicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: 'hashed_pw' }),
      })
    );
  });
});
```

- [ ] **Krok 2: Uruchom test — upewnij się że NIE przechodzi**

```bash
npx vitest run src/features/threads/services/commands/__tests__/create-public-link-command.test.ts
```

Oczekiwany output: błąd importu `create-public-link-command`.

- [ ] **Krok 3: Zaimplementuj command**

Utwórz `src/features/threads/services/commands/create-public-link-command.ts`:

```typescript
'use server';

import db from '@ragenai/prisma-client';
import bcrypt from 'bcrypt';

type Input = {
  threadId: string;
  organizationId: string;
  currentUserId: string;
  expiresAt: Date | null;
  password?: string;
};

type Result =
  | { success: true; publicId: string }
  | { success: false; error: string };

export async function createPublicLinkCommand(input: Input): Promise<Result> {
  const { threadId, organizationId, currentUserId, expiresAt, password } = input;

  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: { id: true, visitorId: true },
  });

  if (!thread) {
    return { success: false, error: 'Thread not found' };
  }

  if (thread.visitorId !== currentUserId) {
    return { success: false, error: 'Only the thread owner can create a public link' };
  }

  const existing = await db.threadPublicLink.findUnique({
    where: { threadId: thread.id },
  });

  if (existing) {
    return { success: false, error: 'Public link already exists. Revoke it first.' };
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const link = await db.threadPublicLink.create({
    data: {
      threadId: thread.id,
      createdByUserId: currentUserId,
      expiresAt,
      passwordHash,
    },
    select: { publicId: true },
  });

  return { success: true, publicId: link.publicId };
}
```

- [ ] **Krok 4: Uruchom test — upewnij się że przechodzi**

```bash
npx vitest run src/features/threads/services/commands/__tests__/create-public-link-command.test.ts
```

Oczekiwany output: `5 passed`.

- [ ] **Krok 5: Commit**

```bash
git add src/features/threads/services/commands/create-public-link-command.ts src/features/threads/services/commands/__tests__/create-public-link-command.test.ts
git commit -m "feat: add create-public-link-command with tests"
```

---

## Task 4: Command — revoke publicznego linku

**Files:**
- Create: `src/features/threads/services/commands/revoke-public-link-command.ts`
- Create: `src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts`

- [ ] **Krok 1: Napisz test**

Utwórz `src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revokePublicLinkCommand } from '../revoke-public-link-command';

const mockDb = {
  threadPublicLink: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

describe('revokePublicLinkCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when link not found', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({ success: false, error: 'Public link not found' });
  });

  it('returns error when user is not the owner', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'other-user',
    });

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({ success: false, error: 'Only the link creator can revoke it' });
  });

  it('deletes link when user is owner', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'user-1',
    });
    mockDb.threadPublicLink.delete.mockResolvedValue({});

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({ success: true });
    expect(mockDb.threadPublicLink.delete).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
    });
  });
});
```

- [ ] **Krok 2: Uruchom test — upewnij się że NIE przechodzi**

```bash
npx vitest run src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts
```

Oczekiwany output: błąd importu.

- [ ] **Krok 3: Zaimplementuj command**

Utwórz `src/features/threads/services/commands/revoke-public-link-command.ts`:

```typescript
'use server';

import db from '@ragenai/prisma-client';

type Input = {
  threadId: string;
  currentUserId: string;
};

type Result =
  | { success: true }
  | { success: false; error: string };

export async function revokePublicLinkCommand(input: Input): Promise<Result> {
  const { threadId, currentUserId } = input;

  const link = await db.threadPublicLink.findUnique({
    where: { threadId },
    select: { id: true, createdByUserId: true },
  });

  if (!link) {
    return { success: false, error: 'Public link not found' };
  }

  if (link.createdByUserId !== currentUserId) {
    return { success: false, error: 'Only the link creator can revoke it' };
  }

  await db.threadPublicLink.delete({ where: { threadId } });

  return { success: true };
}
```

- [ ] **Krok 4: Uruchom test — upewnij się że przechodzi**

```bash
npx vitest run src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts
```

Oczekiwany output: `3 passed`.

- [ ] **Krok 5: Commit**

```bash
git add src/features/threads/services/commands/revoke-public-link-command.ts src/features/threads/services/commands/__tests__/revoke-public-link-command.test.ts
git commit -m "feat: add revoke-public-link-command with tests"
```

---

## Task 5: Query — publiczny widok wątku (z deszyfrowaniem)

**Files:**
- Create: `src/features/threads/services/queries/get-public-thread-query.ts`
- Create: `src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts`

- [ ] **Krok 1: Napisz test**

Utwórz `src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicThreadQuery } from '../get-public-thread-query';

const mockDb = {
  threadPublicLink: {
    findUnique: vi.fn(),
  },
};

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));
vi.mock('bcrypt', () => ({ compare: vi.fn() }));
vi.mock('@/libs/crypto/decrypt-messages', () => ({
  decryptMessageContents: vi.fn().mockImplementation((msgs) => Promise.resolve(msgs)),
}));

import bcrypt from 'bcrypt';

const mockThread = {
  id: 'thread-1',
  title: 'My Thread',
  encryptedDek: null,
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ],
};

const mockLink = {
  publicId: 'pub-id',
  expiresAt: null,
  passwordHash: null,
  createdBy: { name: 'Alice' },
  thread: mockThread,
};

describe('getPublicThreadQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not_found when link does not exist', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: null });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns not_found when link is expired', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      expiresAt: new Date('2020-01-01'),
    });

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: null });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns password_required when link has password and no password submitted', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: null });

    expect(result).toEqual({ status: 'password_required' });
  });

  it('returns password_invalid when wrong password submitted', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: 'wrong' });

    expect(result).toEqual({ status: 'password_invalid' });
  });

  it('returns ok with messages for valid link without password', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(mockLink);

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: null });

    expect(result).toEqual({
      status: 'ok',
      title: 'My Thread',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
      createdByName: 'Alice',
    });
  });

  it('returns ok for valid link with correct password', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await getPublicThreadQuery({ publicId: 'pub-id', submittedPassword: 'correct' });

    expect(result.status).toBe('ok');
  });
});
```

- [ ] **Krok 2: Uruchom test — upewnij się że NIE przechodzi**

```bash
npx vitest run src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts
```

Oczekiwany output: błąd importu.

- [ ] **Krok 3: Zaimplementuj query**

Utwórz `src/features/threads/services/queries/get-public-thread-query.ts`:

```typescript
import db from '@ragenai/prisma-client';
import bcrypt from 'bcrypt';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import type { PublicThreadResult } from '@/features/threads/contracts/thread.types';

type Input = {
  publicId: string;
  submittedPassword: string | null;
};

export async function getPublicThreadQuery(input: Input): Promise<PublicThreadResult> {
  const { publicId, submittedPassword } = input;

  const link = await db.threadPublicLink.findUnique({
    where: { publicId },
    select: {
      expiresAt: true,
      passwordHash: true,
      createdBy: { select: { name: true } },
      thread: {
        select: {
          title: true,
          encryptedDek: true,
          messages: {
            select: { role: true, content: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!link) {
    return { status: 'not_found' };
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return { status: 'not_found' };
  }

  if (link.passwordHash) {
    if (!submittedPassword) {
      return { status: 'password_required' };
    }
    const valid = await bcrypt.compare(submittedPassword, link.passwordHash);
    if (!valid) {
      return { status: 'password_invalid' };
    }
  }

  const decryptedMessages = await decryptMessageContents(
    link.thread.messages,
    link.thread.encryptedDek,
  );

  return {
    status: 'ok',
    title: link.thread.title,
    messages: decryptedMessages.map((m) => ({ role: m.role, content: m.content })),
    createdByName: link.createdBy.name,
  };
}
```

- [ ] **Krok 4: Uruchom test — upewnij się że przechodzi**

```bash
npx vitest run src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts
```

Oczekiwany output: `6 passed`.

- [ ] **Krok 5: Commit**

```bash
git add src/features/threads/services/queries/get-public-thread-query.ts src/features/threads/services/queries/__tests__/get-public-thread-query.test.ts
git commit -m "feat: add get-public-thread-query with KMS decrypt and tests"
```

---

## Task 6: Query — lista linków usera + query dla owner view

**Files:**
- Create: `src/features/threads/services/queries/get-user-public-links-query.ts`
- Create: `src/features/threads/services/queries/get-public-link-query.ts`
- Create: `src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts`

- [ ] **Krok 1: Napisz test**

Utwórz `src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserPublicLinksQuery } from '../get-user-public-links-query';

const mockDb = {
  threadPublicLink: {
    findMany: vi.fn(),
  },
};

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

describe('getUserPublicLinksQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no links', async () => {
    mockDb.threadPublicLink.findMany.mockResolvedValue([]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(result).toEqual([]);
  });

  it('returns links scoped to userId', async () => {
    const now = new Date();
    mockDb.threadPublicLink.findMany.mockResolvedValue([
      {
        publicId: 'pub-1',
        threadId: 'thread-1',
        expiresAt: null,
        passwordHash: null,
        createdAt: now,
        thread: { title: 'My Thread' },
      },
    ]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(mockDb.threadPublicLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdByUserId: 'user-1' },
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      publicId: 'pub-1',
      threadId: 'thread-1',
      threadTitle: 'My Thread',
      expiresAt: null,
      hasPassword: false,
      createdAt: now.toISOString(),
    });
  });

  it('sets hasPassword true when passwordHash is set', async () => {
    mockDb.threadPublicLink.findMany.mockResolvedValue([
      {
        publicId: 'pub-1',
        threadId: 'thread-1',
        expiresAt: null,
        passwordHash: 'some-hash',
        createdAt: new Date(),
        thread: { title: null },
      },
    ]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(result[0].hasPassword).toBe(true);
  });
});
```

- [ ] **Krok 2: Uruchom test — upewnij się że NIE przechodzi**

```bash
npx vitest run src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts
```

- [ ] **Krok 3: Zaimplementuj oba queries**

Utwórz `src/features/threads/services/queries/get-user-public-links-query.ts`:

```typescript
import db from '@ragenai/prisma-client';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

export async function getUserPublicLinksQuery(userId: string): Promise<PublicLinkDto[]> {
  const links = await db.threadPublicLink.findMany({
    where: { createdByUserId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      threadId: true,
      expiresAt: true,
      passwordHash: true,
      createdAt: true,
      thread: { select: { title: true } },
    },
  });

  return links.map((link) => ({
    publicId: link.publicId,
    threadId: link.threadId,
    threadTitle: link.thread.title,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: link.passwordHash !== null,
    createdAt: link.createdAt.toISOString(),
  }));
}
```

Utwórz `src/features/threads/services/queries/get-public-link-query.ts`:

```typescript
import db from '@ragenai/prisma-client';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

export async function getPublicLinkQuery(
  threadId: string,
  userId: string,
): Promise<PublicLinkDto | null> {
  const link = await db.threadPublicLink.findUnique({
    where: { threadId },
    select: {
      publicId: true,
      threadId: true,
      expiresAt: true,
      passwordHash: true,
      createdAt: true,
      createdByUserId: true,
      thread: { select: { title: true } },
    },
  });

  if (!link || link.createdByUserId !== userId) {
    return null;
  }

  return {
    publicId: link.publicId,
    threadId: link.threadId,
    threadTitle: link.thread.title,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: link.passwordHash !== null,
    createdAt: link.createdAt.toISOString(),
  };
}
```

- [ ] **Krok 4: Uruchom test — upewnij się że przechodzi**

```bash
npx vitest run src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts
```

Oczekiwany output: `3 passed`.

- [ ] **Krok 5: Commit**

```bash
git add src/features/threads/services/queries/get-user-public-links-query.ts src/features/threads/services/queries/get-public-link-query.ts src/features/threads/services/queries/__tests__/get-user-public-links-query.test.ts
git commit -m "feat: add get-user-public-links-query and get-public-link-query"
```

---

## Task 7: Server Actions

**Files:**
- Create: `src/app/actions/thread-public-links.ts`

- [ ] **Krok 1: Utwórz plik actions**

Utwórz `src/app/actions/thread-public-links.ts`:

```typescript
'use server';

import { cookies } from 'next/headers';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { createPublicLinkCommand } from '@/features/threads/services/commands/create-public-link-command';
import { revokePublicLinkCommand } from '@/features/threads/services/commands/revoke-public-link-command';
import { getPublicLinkQuery } from '@/features/threads/services/queries/get-public-link-query';
import { getUserPublicLinksQuery } from '@/features/threads/services/queries/get-user-public-links-query';
import { getPublicThreadQuery } from '@/features/threads/services/queries/get-public-thread-query';
import type { PublicLinkDto, PublicThreadResult } from '@/features/threads/contracts/thread.types';

export async function createPublicLinkAction(
  threadId: string,
  expiresAt: Date | null,
  password?: string,
): Promise<{ success: true; publicId: string } | { success: false; error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }
  const organizationId = await getOrgIdFromAuthOrThrow();

  return createPublicLinkCommand({ threadId, organizationId, currentUserId: userId, expiresAt, password });
}

export async function revokePublicLinkAction(
  threadId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  return revokePublicLinkCommand({ threadId, currentUserId: userId });
}

export async function getPublicLinkAction(
  threadId: string,
): Promise<PublicLinkDto | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  return getPublicLinkQuery(threadId, userId);
}

export async function getUserPublicLinksAction(): Promise<PublicLinkDto[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  return getUserPublicLinksQuery(userId);
}

export async function verifyPublicLinkPasswordAction(
  publicId: string,
  password: string,
): Promise<{ valid: boolean }> {
  const result = await getPublicThreadQuery({ publicId, submittedPassword: password });

  if (result.status === 'ok') {
    const cookieStore = await cookies();
    cookieStore.set(`thread-pwd-${publicId}`, password, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { valid: true };
  }

  return { valid: false };
}
```

- [ ] **Krok 2: Uruchom pełne testy — upewnij się że nic nie psujesz**

```bash
npx vitest run
```

Oczekiwany output: wszystkie poprzednie testy nadal przechodzą.

- [ ] **Krok 3: Commit**

```bash
git add src/app/actions/thread-public-links.ts
git commit -m "feat: add thread-public-links server actions"
```

---

## Task 8: Rate limiting w middleware

**Files:**
- Create lub Modify: `src/middleware.ts`

- [ ] **Krok 1: Sprawdź czy middleware istnieje**

```bash
ls src/middleware.ts 2>/dev/null && echo "EXISTS" || echo "NOT FOUND"
```

- [ ] **Krok 2: Utwórz lub zaktualizuj middleware**

Jeśli plik NIE istnieje, utwórz `src/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_THREAD_RATE_LIMIT = 30;
const WINDOW_SECONDS = 60;

async function checkPublicThreadRateLimit(ip: string): Promise<boolean> {
  try {
    const { getRedisInstance } = await import('@/app/lib/services/redis');
    const redis = getRedisInstance();
    if (!redis) {
      return true;
    }
    const key = `ptl:rl:ip:${ip}`;
    const count = await redis.incrWithExpire(key, WINDOW_SECONDS);
    return count <= PUBLIC_THREAD_RATE_LIMIT;
  } catch {
    return true;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicThread = /^\/[^/]+\/public\/thread\//.test(pathname);

  if (isPublicThread) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    const allowed = await checkPublicThreadRateLimit(ip);
    if (!allowed) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

Jeśli plik ISTNIEJE, odczytaj go i dodaj blok rate-limitingu dla public thread analogicznie do powyższego wzorca, przed wywołaniem `intlMiddleware`.

- [ ] **Krok 3: Sprawdź że lint przechodzi**

```bash
npm run lint
```

Oczekiwany output: brak błędów.

- [ ] **Krok 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add rate limiting for public thread routes in middleware"
```

---

## Task 9: Strona publiczna (Server Component + PasswordGateForm)

**Files:**
- Create: `src/app/[locale]/public/thread/[publicId]/page.tsx`
- Create: `src/app/[locale]/public/thread/[publicId]/PasswordGateForm.tsx`

- [ ] **Krok 1: Utwórz PasswordGateForm (Client Component)**

Utwórz `src/app/[locale]/public/thread/[publicId]/PasswordGateForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verifyPublicLinkPasswordAction } from '@/app/actions/thread-public-links';

type Props = {
  publicId: string;
  invalid?: boolean;
};

export function PasswordGateForm({ publicId, invalid = false }: Props) {
  const t = useTranslations('public-thread');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(invalid);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    const result = await verifyPublicLinkPasswordAction(publicId, password);

    if (result.valid) {
      router.refresh();
    } else {
      setError(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-light dark:bg-primary-dark">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-white">
          {t('password-required')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('password-description')}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder={t('password-placeholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t('password-invalid')}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading || !password}>
            {isLoading ? t('password-verifying') : t('password-submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Krok 2: Utwórz stronę publiczną (Server Component)**

Utwórz `src/app/[locale]/public/thread/[publicId]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getPublicThreadQuery } from '@/features/threads/services/queries/get-public-thread-query';
import { PasswordGateForm } from './PasswordGateForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string; locale: string }>;
}) {
  return {
    robots: { index: false, follow: false },
  };
}

type Props = {
  params: Promise<{ publicId: string; locale: string }>;
};

export default async function PublicThreadPage({ params }: Props) {
  const { publicId, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public-thread');

  const cookieStore = await cookies();
  const submittedPassword = cookieStore.get(`thread-pwd-${publicId}`)?.value ?? null;

  const result = await getPublicThreadQuery({ publicId, submittedPassword });

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'password_required') {
    return <PasswordGateForm publicId={publicId} />;
  }

  if (result.status === 'password_invalid') {
    return <PasswordGateForm publicId={publicId} invalid />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
          {result.title ?? t('untitled-thread')}
        </h1>
        {result.createdByName && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('shared-by', { name: result.createdByName })}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {result.messages.map((message, index) => (
          <div
            key={index}
            className={`rounded-lg p-4 ${
              message.role === 'user'
                ? 'ml-8 bg-zinc-100 dark:bg-zinc-800'
                : 'mr-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
              {message.role === 'user' ? t('role-user') : t('role-assistant')}
            </p>
            <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Krok 3: Sprawdź lint**

```bash
npm run lint
```

Oczekiwany output: brak błędów.

- [ ] **Krok 4: Commit**

```bash
git add src/app/[locale]/public/thread/
git commit -m "feat: add public thread page with password gate"
```

---

## Task 10: Tłumaczenia

**Files:**
- Modify: `src/app/messages/en.json`
- Modify: `src/app/messages/pl.json`

- [ ] **Krok 1: Dodaj klucze do en.json**

W pliku `src/app/messages/en.json` dodaj nowy namespace `public-thread` (przed ostatnim `}` w pliku):

```json
  "public-thread": {
    "untitled-thread": "Untitled thread",
    "shared-by": "Shared by {name}",
    "role-user": "You",
    "role-assistant": "Assistant",
    "password-required": "This thread is password protected",
    "password-description": "Enter the password to view this thread.",
    "password-placeholder": "Password",
    "password-invalid": "Incorrect password. Please try again.",
    "password-verifying": "Verifying...",
    "password-submit": "View thread"
  },
```

W namespace `thread-actions` dodaj nowe klucze (po `"export-error"`):

```json
    "share-public": "Share publicly",
    "public-share-title": "Public link",
    "public-share-description": "Anyone with the link can view this thread",
    "public-share-expires": "Expiration",
    "public-share-expires-24h": "24 hours",
    "public-share-expires-7d": "7 days",
    "public-share-expires-30d": "30 days",
    "public-share-expires-never": "Never",
    "public-share-password": "Password (optional)",
    "public-share-password-placeholder": "Leave empty for no password",
    "public-share-generate": "Generate link",
    "public-share-copy": "Copy link",
    "public-share-copied": "Copied!",
    "public-share-revoke": "Revoke link",
    "public-share-revoke-confirm": "Are you sure you want to revoke this link? Anyone with the link will lose access.",
    "public-share-expires-on": "Expires: {date}",
    "public-share-never-expires": "Never expires",
    "public-share-has-password": "Password protected",
    "public-share-no-password": "No password",
    "public-share-error": "Failed to create public link",
    "public-share-revoke-error": "Failed to revoke public link"
```

W namespace `settings-page.nav` dodaj:

```json
      "shared-threads": "Shared threads"
```

Dodaj nowy namespace `settings-page.shared-threads`:

```json
    "shared-threads": {
      "title": "Shared threads",
      "description": "Manage your publicly shared thread links.",
      "empty": "No shared threads",
      "thread-title": "Thread",
      "expires": "Expires",
      "actions": "Actions",
      "copy-link": "Copy link",
      "revoke": "Revoke",
      "revoke-confirm": "Revoke this link? Anyone with the link will lose access.",
      "never": "Never",
      "has-password": "Password protected"
    }
```

- [ ] **Krok 2: Dodaj klucze do pl.json**

W pliku `src/app/messages/pl.json` dodaj identyczne klucze po polsku:

```json
  "public-thread": {
    "untitled-thread": "Wątek bez tytułu",
    "shared-by": "Udostępnione przez {name}",
    "role-user": "Ty",
    "role-assistant": "Asystent",
    "password-required": "Ten wątek jest chroniony hasłem",
    "password-description": "Wprowadź hasło, aby wyświetlić ten wątek.",
    "password-placeholder": "Hasło",
    "password-invalid": "Nieprawidłowe hasło. Spróbuj ponownie.",
    "password-verifying": "Weryfikowanie...",
    "password-submit": "Wyświetl wątek"
  },
```

W namespace `thread-actions`:

```json
    "share-public": "Udostępnij publicznie",
    "public-share-title": "Publiczny link",
    "public-share-description": "Każdy z linkiem może wyświetlić ten wątek",
    "public-share-expires": "Wygaśnięcie",
    "public-share-expires-24h": "24 godziny",
    "public-share-expires-7d": "7 dni",
    "public-share-expires-30d": "30 dni",
    "public-share-expires-never": "Nigdy",
    "public-share-password": "Hasło (opcjonalne)",
    "public-share-password-placeholder": "Zostaw puste, jeśli bez hasła",
    "public-share-generate": "Generuj link",
    "public-share-copy": "Kopiuj link",
    "public-share-copied": "Skopiowano!",
    "public-share-revoke": "Unieważnij link",
    "public-share-revoke-confirm": "Czy na pewno chcesz unieważnić ten link? Osoby z linkiem stracą dostęp.",
    "public-share-expires-on": "Wygasa: {date}",
    "public-share-never-expires": "Nie wygasa",
    "public-share-has-password": "Chronione hasłem",
    "public-share-no-password": "Bez hasła",
    "public-share-error": "Nie udało się utworzyć publicznego linku",
    "public-share-revoke-error": "Nie udało się unieważnić publicznego linku"
```

W `settings-page.nav`:

```json
      "shared-threads": "Udostępnione wątki"
```

W `settings-page`:

```json
    "shared-threads": {
      "title": "Udostępnione wątki",
      "description": "Zarządzaj publicznie udostępnionymi linkami do wątków.",
      "empty": "Brak udostępnionych wątków",
      "thread-title": "Wątek",
      "expires": "Wygasa",
      "actions": "Akcje",
      "copy-link": "Kopiuj link",
      "revoke": "Unieważnij",
      "revoke-confirm": "Unieważnić ten link? Osoby z linkiem stracą dostęp.",
      "never": "Nigdy",
      "has-password": "Chronione hasłem"
    }
```

- [ ] **Krok 3: Commit**

```bash
git add src/app/messages/en.json src/app/messages/pl.json
git commit -m "feat: add translations for public thread share"
```

---

## Task 11: Komponent PublicShareDialog

**Files:**
- Create: `src/app/components/PublicShareDialog.tsx`
- Create: `src/app/components/__tests__/PublicShareDialog.test.tsx`

- [ ] **Krok 1: Napisz test**

Utwórz `src/app/components/__tests__/PublicShareDialog.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PublicShareDialog } from '../PublicShareDialog';

vi.mock('@/app/actions/thread-public-links', () => ({
  getPublicLinkAction: vi.fn(),
  createPublicLinkAction: vi.fn(),
  revokePublicLinkAction: vi.fn(),
}));

import {
  getPublicLinkAction,
  createPublicLinkAction,
  revokePublicLinkAction,
} from '@/app/actions/thread-public-links';

const messages = {
  'thread-actions': {
    'public-share-title': 'Public link',
    'public-share-description': 'Anyone with the link can view this thread',
    'public-share-expires': 'Expiration',
    'public-share-expires-24h': '24 hours',
    'public-share-expires-7d': '7 days',
    'public-share-expires-30d': '30 days',
    'public-share-expires-never': 'Never',
    'public-share-password': 'Password (optional)',
    'public-share-password-placeholder': 'Leave empty for no password',
    'public-share-generate': 'Generate link',
    'public-share-copy': 'Copy link',
    'public-share-copied': 'Copied!',
    'public-share-revoke': 'Revoke link',
    'public-share-revoke-confirm': 'Are you sure?',
    'public-share-expires-on': 'Expires: {date}',
    'public-share-never-expires': 'Never expires',
    'public-share-has-password': 'Password protected',
    'public-share-no-password': 'No password',
    'public-share-error': 'Failed to create public link',
    'public-share-revoke-error': 'Failed to revoke public link',
    cancel: 'Cancel',
  },
};

function renderDialog(props = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PublicShareDialog
        isOpen={true}
        onClose={vi.fn()}
        threadId="thread-1"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('PublicShareDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows generate form when no existing link', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue(null);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Generate link')).toBeTruthy();
    });
  });

  it('shows active link info when link exists', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue({
      publicId: 'pub-id',
      threadId: 'thread-1',
      threadTitle: 'My Thread',
      expiresAt: null,
      hasPassword: false,
      createdAt: new Date().toISOString(),
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Copy link')).toBeTruthy();
      expect(screen.getByText('Revoke link')).toBeTruthy();
    });
  });

  it('calls createPublicLinkAction on generate', async () => {
    vi.mocked(getPublicLinkAction).mockResolvedValue(null);
    vi.mocked(createPublicLinkAction).mockResolvedValue({ success: true, publicId: 'new-pub-id' });
    vi.mocked(getPublicLinkAction).mockResolvedValueOnce(null).mockResolvedValue({
      publicId: 'new-pub-id',
      threadId: 'thread-1',
      threadTitle: null,
      expiresAt: null,
      hasPassword: false,
      createdAt: new Date().toISOString(),
    });

    renderDialog();

    await waitFor(() => screen.getByText('Generate link'));
    fireEvent.click(screen.getByText('Generate link'));

    await waitFor(() => {
      expect(createPublicLinkAction).toHaveBeenCalledWith('thread-1', null, undefined);
    });
  });
});
```

- [ ] **Krok 2: Uruchom test — upewnij się że NIE przechodzi**

```bash
npx vitest run src/app/components/__tests__/PublicShareDialog.test.tsx
```

- [ ] **Krok 3: Zaimplementuj dialog**

Utwórz `src/app/components/PublicShareDialog.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getPublicLinkAction,
  createPublicLinkAction,
  revokePublicLinkAction,
} from '@/app/actions/thread-public-links';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
};

type ExpirationOption = '24h' | '7d' | '30d' | 'never';

function getExpiresAt(option: ExpirationOption): Date | null {
  if (option === 'never') {
    return null;
  }
  const now = new Date();
  if (option === '24h') {
    now.setHours(now.getHours() + 24);
  } else if (option === '7d') {
    now.setDate(now.getDate() + 7);
  } else if (option === '30d') {
    now.setDate(now.getDate() + 30);
  }
  return now;
}

export function PublicShareDialog({ isOpen, onClose, threadId }: Props) {
  const t = useTranslations('thread-actions');
  const { successToast, errorToast } = statusToast();
  const [existingLink, setExistingLink] = useState<PublicLinkDto | null | undefined>(undefined);
  const [expiration, setExpiration] = useState<ExpirationOption>('7d');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLink = useCallback(async () => {
    const link = await getPublicLinkAction(threadId);
    setExistingLink(link);
  }, [threadId]);

  useEffect(() => {
    if (isOpen) {
      fetchLink();
    }
  }, [isOpen, fetchLink]);

  const buildUrl = (publicId: string) => {
    return `${window.location.origin}/pl/public/thread/${publicId}`;
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const expiresAt = getExpiresAt(expiration);
      const result = await createPublicLinkAction(
        threadId,
        expiresAt,
        password || undefined,
      );
      if (result.success) {
        await fetchLink();
      } else {
        errorToast({ message: t('public-share-error') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm(t('public-share-revoke-confirm'))) {
      return;
    }
    setIsLoading(true);
    try {
      const result = await revokePublicLinkAction(threadId);
      if (result.success) {
        setExistingLink(null);
      } else {
        errorToast({ message: t('public-share-revoke-error') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!existingLink) {
      return;
    }
    await navigator.clipboard.writeText(buildUrl(existingLink.publicId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLoadingLink = existingLink === undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('public-share-title')}</DialogTitle>
          <DialogDescription>{t('public-share-description')}</DialogDescription>
        </DialogHeader>

        {isLoadingLink ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400" />
          </div>
        ) : existingLink ? (
          <div className="space-y-3">
            <Input
              readOnly
              value={buildUrl(existingLink.publicId)}
              className="text-xs"
            />
            <div className="flex gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span>
                {existingLink.expiresAt
                  ? t('public-share-expires-on', { date: new Date(existingLink.expiresAt).toLocaleDateString() })
                  : t('public-share-never-expires')}
              </span>
              <span>·</span>
              <span>
                {existingLink.hasPassword
                  ? t('public-share-has-password')
                  : t('public-share-no-password')}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('public-share-expires')}
              </label>
              <Select value={expiration} onValueChange={(v) => setExpiration(v as ExpirationOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('public-share-expires-24h')}</SelectItem>
                  <SelectItem value="7d">{t('public-share-expires-7d')}</SelectItem>
                  <SelectItem value="30d">{t('public-share-expires-30d')}</SelectItem>
                  <SelectItem value="never">{t('public-share-expires-never')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('public-share-password')}
              </label>
              <Input
                type="password"
                placeholder={t('public-share-password-placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          {existingLink ? (
            <>
              <Button variant="destructive" onClick={handleRevoke} disabled={isLoading}>
                {t('public-share-revoke')}
              </Button>
              <Button onClick={handleCopy} disabled={isLoading}>
                {copied ? t('public-share-copied') : t('public-share-copy')}
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerate} disabled={isLoading || isLoadingLink}>
              {t('public-share-generate')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Krok 4: Uruchom test — upewnij się że przechodzi**

```bash
npx vitest run src/app/components/__tests__/PublicShareDialog.test.tsx
```

Oczekiwany output: `3 passed`.

- [ ] **Krok 5: Commit**

```bash
git add src/app/components/PublicShareDialog.tsx src/app/components/__tests__/PublicShareDialog.test.tsx
git commit -m "feat: add PublicShareDialog component with tests"
```

---

## Task 12: Integracja z ThreadDropdownMenu

**Files:**
- Modify: `src/app/components/ThreadDropdownMenu.tsx`

- [ ] **Krok 1: Zaktualizuj ThreadDropdownMenu**

Otwórz `src/app/components/ThreadDropdownMenu.tsx`. Dodaj import:

```typescript
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { PublicShareDialog } from '@/app/components/PublicShareDialog';
```

W sekcji stanu (po `const [isShareOpen, setIsShareOpen] = useState(false);`) dodaj:

```typescript
const [isPublicShareOpen, setIsPublicShareOpen] = useState(false);
```

W sekcji JSX, po `<DropdownMenuItem onClick={() => setIsShareOpen(true)}>`, dodaj:

```typescript
<DropdownMenuItem onClick={() => setIsPublicShareOpen(true)}>
  <GlobeAltIcon className="size-4" />
  {t('share-public')}
</DropdownMenuItem>
```

Na końcu, po `<ShareThreadDialog ... />`, dodaj:

```typescript
<PublicShareDialog
  isOpen={isPublicShareOpen}
  onClose={() => setIsPublicShareOpen(false)}
  threadId={thread.id}
/>
```

- [ ] **Krok 2: Sprawdź lint**

```bash
npm run lint
```

Oczekiwany output: brak błędów.

- [ ] **Krok 3: Commit**

```bash
git add src/app/components/ThreadDropdownMenu.tsx
git commit -m "feat: add share-publicly option to ThreadDropdownMenu"
```

---

## Task 13: Settings page — zarządzanie linkami

**Files:**
- Modify: `src/features/settings/registry.ts`
- Create: `src/app/[locale]/(panel)/settings/shared-threads/page.tsx`

- [ ] **Krok 1: Dodaj wpis do registry**

Otwórz `src/features/settings/registry.ts`. W tablicy `settingsRegistry` dodaj nowy wpis po `connectors`:

```typescript
  {
    id: 'shared-threads',
    path: '/settings/shared-threads',
    labelKey: 'shared-threads',
    icon: 'user',
    order: 35,
    visibility: { requireRole: 'user' },
  },
```

Upewnij się że w typie `SettingsIcon` jest `'user'` — już jest.

- [ ] **Krok 2: Utwórz stronę settings**

Utwórz `src/app/[locale]/(panel)/settings/shared-threads/page.tsx`:

```typescript
import { getTranslations } from 'next-intl/server';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { getUserPublicLinksQuery } from '@/features/threads/services/queries/get-user-public-links-query';
import { SharedThreadsList } from './SharedThreadsList';

export async function generateMetadata() {
  const t = await getTranslations('settings-page.shared-threads');
  return { title: t('title') };
}

export default async function SharedThreadsPage() {
  const t = await getTranslations('settings-page.shared-threads');
  const userId = await getCurrentUserId();
  const links = userId ? await getUserPublicLinksQuery(userId) : [];

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </section>
      <SharedThreadsList initialLinks={links} />
    </div>
  );
}
```

- [ ] **Krok 3: Utwórz SharedThreadsList (Client Component)**

Utwórz `src/app/[locale]/(panel)/settings/shared-threads/SharedThreadsList.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { statusToast } from '@/app/lib/utils/toast';
import { revokePublicLinkAction } from '@/app/actions/thread-public-links';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';
import { useRouter } from '@/i18n/routing';

type Props = {
  initialLinks: PublicLinkDto[];
};

export function SharedThreadsList({ initialLinks }: Props) {
  const t = useTranslations('settings-page.shared-threads');
  const { errorToast } = statusToast();
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);

  const buildUrl = (publicId: string) =>
    `${window.location.origin}/pl/public/thread/${publicId}`;

  const handleCopy = async (publicId: string) => {
    await navigator.clipboard.writeText(buildUrl(publicId));
  };

  const handleRevoke = async (threadId: string) => {
    if (!confirm(t('revoke-confirm'))) {
      return;
    }
    const result = await revokePublicLinkAction(threadId);
    if (result.success) {
      setLinks((prev) => prev.filter((l) => l.threadId !== threadId));
      router.refresh();
    } else {
      errorToast({ message: 'Failed to revoke' });
    }
  };

  if (links.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div
          key={link.publicId}
          className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
              {link.threadTitle ?? '—'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {link.expiresAt
                ? `${t('expires')}: ${new Date(link.expiresAt).toLocaleDateString()}`
                : t('never')}
              {link.hasPassword && ` · ${t('has-password')}`}
            </p>
          </div>
          <div className="flex gap-2 ml-4">
            <Button variant="outline" size="sm" onClick={() => handleCopy(link.publicId)}>
              {t('copy-link')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRevoke(link.threadId)}
            >
              {t('revoke')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Krok 4: Sprawdź lint**

```bash
npm run lint
```

Oczekiwany output: brak błędów.

- [ ] **Krok 5: Commit**

```bash
git add src/features/settings/registry.ts src/app/[locale]/(panel)/settings/shared-threads/
git commit -m "feat: add shared-threads settings page"
```

---

## Task 14: robots.txt

**Files:**
- Modify: `public/robots.txt`

- [ ] **Krok 1: Sprawdź czy robots.txt istnieje**

```bash
cat public/robots.txt 2>/dev/null || echo "NOT FOUND"
```

- [ ] **Krok 2: Dodaj dyrektywę Disallow**

Jeśli plik istnieje, dodaj na końcu:

```
Disallow: /*/public/thread/*
```

Jeśli nie istnieje, utwórz `public/robots.txt`:

```
User-agent: *
Disallow: /*/public/thread/*
```

- [ ] **Krok 3: Commit**

```bash
git add public/robots.txt
git commit -m "feat: disallow indexing of public thread share pages"
```

---

## Task 15: Testy E2E (Playwright)

**Files:**
- Create: `e2e/p1-34-public-thread-share.spec.ts`

- [ ] **Krok 1: Sprawdź strukturę e2e helpers**

```bash
head -50 e2e/helpers.ts
```

Upewnij się że znasz dostępne ROUTES i LABELS.

- [ ] **Krok 2: Utwórz plik E2E**

Utwórz `e2e/p1-34-public-thread-share.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { login, ROUTES } from './helpers';

test.describe('Public thread share', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('creates public link without password and views it anonymously', async ({
    page,
    browser,
  }) => {
    // Navigate to threads
    await page.goto(ROUTES.threads);
    await page.waitForLoadState('networkidle');

    // Open first thread dropdown
    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();

    // Click "Share publicly"
    await page.getByRole('menuitem', { name: /udostępnij publicznie/i }).click();

    // Dialog opens — set 7 days expiration
    await page.getByRole('combobox').selectOption('7d');

    // Generate link
    await page.getByRole('button', { name: /generuj link/i }).click();

    // Wait for link to appear
    const linkInput = page.getByRole('textbox');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const publicUrl = await linkInput.inputValue();
    expect(publicUrl).toContain('/public/thread/');

    // Visit public URL anonymously in a new browser context
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(publicUrl);

    // Should see messages read-only (no chat input)
    await expect(anonPage.locator('text=Ty').or(anonPage.locator('text=Asystent'))).toBeVisible({
      timeout: 10000,
    });
    await expect(anonPage.locator('[data-testid="prompt-form"]')).not.toBeVisible();

    await anonContext.close();
  });

  test('revoked link returns 404', async ({ page, browser }) => {
    await page.goto(ROUTES.threads);
    await page.waitForLoadState('networkidle');

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();
    await page.getByRole('menuitem', { name: /udostępnij publicznie/i }).click();
    await page.getByRole('button', { name: /generuj link/i }).click();

    const linkInput = page.getByRole('textbox');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const publicUrl = await linkInput.inputValue();

    // Revoke the link
    await page.getByRole('button', { name: /unieważnij link/i }).click();
    page.on('dialog', (d) => d.accept());

    // Navigate to settings/shared-threads to confirm no links
    await page.goto('/pl/settings/shared-threads');
    await expect(page.getByText(/brak udostępnionych wątków/i)).toBeVisible();

    // Visit revoked URL
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    const response = await anonPage.goto(publicUrl);
    expect(response?.status()).toBe(404);
    await anonContext.close();
  });

  test('password protected link requires password', async ({ page, browser }) => {
    await page.goto(ROUTES.threads);
    await page.waitForLoadState('networkidle');

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();
    await page.getByRole('menuitem', { name: /udostępnij publicznie/i }).click();

    // Set password
    await page.getByPlaceholder(/zostaw puste/i).fill('secret123');
    await page.getByRole('button', { name: /generuj link/i }).click();

    const linkInput = page.getByRole('textbox');
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const publicUrl = await linkInput.inputValue();

    // Visit URL without password
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(publicUrl);
    await expect(anonPage.getByText(/chroniony hasłem/i)).toBeVisible();

    // Submit wrong password
    await anonPage.getByPlaceholder(/hasło/i).fill('wrongpass');
    await anonPage.getByRole('button', { name: /wyświetl wątek/i }).click();
    await expect(anonPage.getByText(/nieprawidłowe hasło/i)).toBeVisible();

    // Submit correct password
    await anonPage.getByPlaceholder(/hasło/i).fill('secret123');
    await anonPage.getByRole('button', { name: /wyświetl wątek/i }).click();
    await expect(
      anonPage.locator('text=Ty').or(anonPage.locator('text=Asystent'))
    ).toBeVisible({ timeout: 10000 });

    await anonContext.close();

    // Revoke created link
    await page.getByRole('button', { name: /unieważnij link/i }).click();
    page.on('dialog', (d) => d.accept());
  });
});
```

- [ ] **Krok 3: Commit**

```bash
git add e2e/p1-34-public-thread-share.spec.ts
git commit -m "test: add E2E tests for public thread share"
```

---

## Task 16: Weryfikacja końcowa

- [ ] **Krok 1: Uruchom wszystkie testy jednostkowe**

```bash
npx vitest run
```

Oczekiwany output: wszystkie testy zielone, brak failed.

- [ ] **Krok 2: Sprawdź lint**

```bash
npm run lint
```

Oczekiwany output: brak błędów.

- [ ] **Krok 3: Zbuduj projekt**

```bash
npm run build
```

Oczekiwany output: build zakończony bez błędów TypeScript.

- [ ] **Krok 4: Commit końcowy jeśli potrzebny**

```bash
git status
```

Jeśli są niezacommitowane zmiany:

```bash
git add -A
git commit -m "chore: public thread share final cleanup"
```
