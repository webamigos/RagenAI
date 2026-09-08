/**
 * The shared account a demo deployment offers its visitors, or nothing.
 *
 * **Read from the environment, never written down here.** A password in an
 * Apache-2.0 repository is the same mistake as the Google Tag Manager
 * container id that used to sit in `[locale]/layout.tsx`: harmless-looking,
 * and shipped to everyone who clones it. `tests/architecture/demo-credentials-
 * are-not-hardcoded.test.ts` fails the gate if one appears.
 *
 * **Presence of both variables is the gate**, deliberately not
 * `TARGET_ENV === 'demo'`. `libs/utils/env.ts` warns against exactly that
 * after the tag-manager incident: `TARGET_ENV` cannot answer "is this the
 * vendor's own deployment", and someone standing up their own showcase
 * instance might reasonably set it to `demo`. An operator who sets these two
 * variables has said what they mean, and nobody sets them by accident.
 *
 * Both are `NEXT_PUBLIC_`, so both reach the browser — which is the point.
 * The account they name is meant to be used by strangers, holds only seeded
 * data, and is an ordinary member of one organization with no platform role.
 * Never put a credential here that is any of those things less.
 */
export type DemoCredentials = { email: string; password: string };

function read(): DemoCredentials | null {
  // Literal member access, because Next inlines `process.env.NEXT_PUBLIC_*`
  // at build time only when it can see the whole name.
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL?.trim();
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export const demoCredentials: DemoCredentials | null = read();
