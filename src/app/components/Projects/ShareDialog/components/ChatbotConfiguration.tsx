import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { Input } from '@ragenai/common-ui';

type ChatbotConfigurationProps = {
  chatbotTitle: string;
  chatbotName: string;
  onTitleChange: (value: string) => void;
  onNameChange: (value: string) => void;
};

export const ChatbotConfiguration = memo(
  ({
    chatbotTitle,
    chatbotName,
    onTitleChange,
    onNameChange,
  }: ChatbotConfigurationProps) => {
    const t = useTranslations('projects');

    return (
      <div className="px-1">
        <Input
          value={chatbotTitle}
          label={t('share-knowledge.chatbot-title')}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Chatbot"
          className="w-full h-10"
          aria-label={t('share-knowledge.chatbot-title-aria-label')}
        />
        <Input
          value={chatbotName}
          label={t('share-knowledge.chatbot-subtitle')}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Hello, how can I help you today?"
          className="w-full h-10"
          aria-label={t('share-knowledge.chatbot-subtitle-aria-label')}
        />
      </div>
    );
  }
);

ChatbotConfiguration.displayName = 'ChatbotConfiguration';
