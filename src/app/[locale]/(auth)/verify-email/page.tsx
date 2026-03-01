import Image from 'next/image';

import { VerifyEmailForm } from '@/app/components/Forms/VerifyEmailForm/VerifyEmailForm';
import { Logo } from '@/app/components/Logo';

export async function generateMetadata() {
  return {
    title: 'Verify Email - Ragen AI',
  };
}

export default async function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
          </div>

          <div className="mt-8">
            <VerifyEmailForm />
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_1.jpeg"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
