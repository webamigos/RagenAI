import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getPublicThreadQuery } from '@/features/threads/services/queries/get-public-thread-query';
import { verifyPublicLinkToken } from '@/libs/crypto/public-link-token';
import { PasswordGateForm } from './PasswordGateForm';
import { MarkdownMessage } from './MarkdownMessage';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
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
  const cookieToken = cookieStore.get(`thread-pwd-${publicId}`)?.value ?? null;
  const cookieVerified =
    cookieToken !== null && verifyPublicLinkToken(publicId, cookieToken);

  const result = await getPublicThreadQuery({
    publicId,
    cookieVerified,
  });

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
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground dark:text-white">
          {result.title ?? t('untitled-thread')}
        </h1>
        {result.createdByName && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('shared-by', { name: result.createdByName })}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {result.messages.map((message, index) => (
          <div
            key={index}
            className={`rounded-lg p-4 ${
              message.role === 'USER'
                ? 'ml-8 bg-muted'
                : 'mr-8 border border-border bg-white dark:bg-card'
            }`}
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {message.role === 'USER' ? t('role-user') : t('role-assistant')}
            </p>
            <MarkdownMessage content={message.content} />
          </div>
        ))}
      </div>
    </div>
  );
}
