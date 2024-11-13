'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { saveUserMetadata } from '@/app/actions';

import { SpinnerSVG } from '@salesyy/common-ui/icons';

export const dynamic = 'force-dynamic';

export default function SSOCallback() {
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

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
        <SpinnerSVG />;
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
      <SpinnerSVG />;
    </div>
  );
}
