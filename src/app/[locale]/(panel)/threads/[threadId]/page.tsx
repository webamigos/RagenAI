import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ threadId: string }>;
};

export default async function ThreadRedirect({ params }: Props) {
  const { threadId } = await params;
  const locale = await getLocale();
  redirect({ href: `/chats/${threadId}`, locale });
}
