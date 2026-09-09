import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

type Tab = 'settings' | 'conversations';

type Props = {
  chatbotId: string;
  activeTab: Tab;
};

export async function ChatbotTabs({ chatbotId, activeTab }: Props) {
  const t = await getTranslations('settings-page.chatbots');

  const tabs: { key: Tab; label: string; href: string }[] = [
    {
      key: 'settings',
      label: t('edit-title'),
      href: `/organization/chatbots/${chatbotId}`,
    },
    {
      key: 'conversations',
      label: t('conversations.title'),
      href: `/organization/chatbots/${chatbotId}/conversations`,
    },
  ];

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) =>
        tab.key === activeTab ? (
          <span
            key={tab.key}
            className="inline-flex items-center border-b-2 border-border px-3 py-1.5 text-sm font-medium text-foreground dark:border-white dark:text-white"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={tab.href}
            className="inline-flex items-center border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}
