import { CreateOrganization } from '@clerk/nextjs';

import { Link } from '@/app/components/Link';
import { Logo } from '@/app/components/Logo';

export default function RootLayout() {
  return (
    <div className="h-full">
      <header className="absolute inset-x-0 top-0 z-50 bg-black">
        <nav
          className="flex items-center justify-between p-6 lg:px-8"
          aria-label="Global"
        >
          <Link href="/">
            <Logo />
          </Link>
        </nav>
      </header>
      <main className="flex h-screen w-screen items-center justify-center">
        <CreateOrganization
          appearance={{
            elements: {
              footer: 'hidden',
            },
          }}
        />
      </main>
    </div>
  );
}
