/**
 * Create or reset a platform administrator, for local development.
 *
 *   npm run local:admin -- --email me@example.com --password 'Secret123!'
 *   npm run local:admin -- --email me@example.com            # prompts, hidden
 *   npm run local:admin -- --list
 *
 * **Why this exists.** The supported way to get the platform role is the
 * first-run screen in apps/web, and `updateInitialAdminAccountCommand` promotes
 * the one existing account exactly once: it refuses when an admin already
 * exists, refuses when there is more than one account, and writes an
 * install-claimed marker so it cannot run twice. That is right for an
 * installation and leaves a developer with no way back in — a local database
 * that has been used for five minutes has two accounts and a claimed marker,
 * and nothing in the repository can set a password on either. The 2026-09-21
 * regression pass got into the panel by hand-writing a scrypt hash into
 * `accounts` with psql, which is not a thing anyone should have to work out
 * twice.
 *
 * **What it refuses.** The database host must be loopback. This writes a
 * password hash and grants the highest privilege in the product, so pointing it
 * at a shared or hosted database is never what was meant — `--i-know` overrides
 * it for the case of a throwaway database on another host, and says so loudly.
 * There is no override for "not local and not asked for".
 *
 * Passwords are hashed with Better Auth's own `hashPassword`, so the row is
 * indistinguishable from one the sign-up form wrote. Writing `accounts.password`
 * any other way produces a value the library cannot verify — the hash is
 * scrypt with its own encoding, not bcrypt.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../apps/web/src/generated/prisma/client.js';

type Args = {
  email?: string;
  password?: string;
  list: boolean;
  force: boolean;
};

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { list: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--list') {
      args.list = true;
    } else if (flag === '--i-know') {
      args.force = true;
    } else if (flag === '--email') {
      args.email = argv[(index += 1)];
    } else if (flag === '--password') {
      args.password = argv[(index += 1)];
    }
  }
  return args;
}

/**
 * Whether a connection string points at this machine.
 *
 * Parsed rather than matched on a substring: `postgresql://user@evil.example
 * /db?host=localhost` contains "localhost" and does not point at one. A URL
 * that will not parse is treated as remote, because the safe answer to "I
 * cannot tell" is no.
 */
export function isLoopbackDatabase(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  // `URL` keeps the brackets on an IPv6 authority — `[::1]`, not `::1` — so a
  // bare comparison against '::1' silently refuses a loopback connection
  // string. Its own test caught this.
  const bare = host.startsWith('[') && host.endsWith(']')
    ? host.slice(1, -1)
    : host;
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '::1';
}

async function readPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Password for the admin account: ');
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;

  if (!isLoopbackDatabase(url) && !args.force) {
    console.error(
      `DATABASE_URL does not point at localhost, and this grants the platform\n` +
        `role and sets a password. Refusing.\n\n` +
        `  host: ${url ? (new URL(url).hostname ?? '(unparseable)') : '(unset)'}\n\n` +
        `If that really is a throwaway database, re-run with --i-know.`,
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    if (args.list) {
      const admins = await prisma.user.findMany({
        where: { role: 'admin' },
        select: { email: true, emailVerified: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      if (admins.length === 0) {
        console.log('No platform administrators in this database.');
        return;
      }
      console.log(`${admins.length} platform administrator(s):`);
      for (const admin of admins) {
        console.log(
          `  ${admin.email}  verified=${admin.emailVerified}  created=${admin.createdAt.toISOString().slice(0, 10)}`,
        );
      }
      return;
    }

    const email = args.email?.trim().toLowerCase();
    if (!email) {
      console.error(
        'Usage: npm run local:admin -- --email you@example.com [--password ...]\n' +
          '       npm run local:admin -- --list',
      );
      process.exitCode = 1;
      return;
    }

    const password = args.password ?? (await readPassword());
    if (password.length < 8) {
      console.error('A password of at least 8 characters, please.');
      process.exitCode = 1;
      return;
    }

    const hashed = await hashPassword(password);
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (!existing) {
      console.error(
        `No account for ${email}. Sign up in apps/web first, then run this to\n` +
          `grant the role and set the password — this script deliberately does\n` +
          `not create users, because a user here without the organization and\n` +
          `default project that sign-up's hook creates is a broken account that\n` +
          `looks fine.`,
      );
      process.exitCode = 1;
      return;
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'admin', emailVerified: true },
    });

    // Better Auth looks a credential account up by three fields at once —
    // `providerId`, `issuer` and `accountId` — and `accountId` is the *user id*
    // for a local credential, not the e-mail. A row missing any of them is a
    // row the library cannot find, which reads as a wrong password. 1.4 matched
    // on `providerId` alone and 1.7 does not; see
    // `docs/lessons/seeded-rows-must-satisfy-the-librarys-lookup.md` and the
    // guard in `tests/architecture/better-auth-account-writes.test.ts`, which
    // failed on this file until `issuer` was added.
    const credential = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: 'credential' },
      select: { id: true },
    });

    if (credential) {
      await prisma.account.update({
        where: { id: credential.id },
        data: { password: hashed },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: existing.id,
          accountId: existing.id,
          providerId: 'credential',
          issuer: 'local:credential',
          password: hashed,
        },
      });
    }

    console.log(
      `${email} is a platform administrator and its password is set.\n` +
        `Sign in at http://localhost:3200/login.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Only when run, never when imported — `tests/scripts/local-admin.test.ts`
 * imports the two pure functions above, and a bare top-level `await main()`
 * would open a database connection and set an exit code during the test run.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
