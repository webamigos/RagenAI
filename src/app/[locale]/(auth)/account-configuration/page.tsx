'use client';

import Image from 'next/image';
import { Suspense } from 'react';
import { AccountConfiguration } from '@/app/components/AccountConfiguration';
import { Logo } from '@/app/components/Logo';
import { useSearchParams } from 'next/navigation';

function AccountConfigurationContent() {
  const searchParams = useSearchParams();
  const misconfigurationDetected =
    searchParams.get('misconfigurationDetected') === 'true';

  return (
    <AccountConfiguration misconfigurationDetected={misconfigurationDetected} />
  );
}

export default function AccountConfigurationPage() {
  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
          </div>
          <div className="mt-1 min-h-[180px]">
            <Suspense fallback={<div>Loading...</div>}>
              <AccountConfigurationContent />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_2.jpeg"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
