import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ publicId: string }>;
};

export default async function ThreadRedirect({ params }: Props) {
  const { publicId } = await params;
  const locale = await getLocale();
  redirect({ href: `/chats/${publicId}`, locale });
}
