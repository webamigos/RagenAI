'use client';

import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { saveUserMetadata } from '@/app/actions';
import { SpinnerSVG } from '@salesyy/common-ui/icons';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

interface Props {
  params: { locale: string };
}

export default function SSOCallback({ params: { locale } }: Props) {
  setRequestLocale(locale);

  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const completeLogin = async () => {
      if (isLoaded && userId) {
        setLoading(false);
        await saveUserMetadata(userId, false);
        router.push('/');
      } else if (isLoaded && !userId) {
        router.push('/sign-in');
      }
    };

    if (isLoaded) {
      completeLogin();
    }
  }, [userId, isLoaded, router]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
      <SpinnerSVG />
    </div>
  );
}
