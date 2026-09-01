import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { Input } from '@ragenai/common-ui/Input';

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
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('share-knowledge.chatbot-title')}
          className="w-full h-10"
          aria-label={t('share-knowledge.chatbot-title-aria-label')}
        />
        <Input
          value={chatbotName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('share-knowledge.chatbot-subtitle')}
          className="w-full h-10"
          aria-label={t('share-knowledge.chatbot-subtitle-aria-label')}
        />
      </div>
    );
  }
);

ChatbotConfiguration.displayName = 'ChatbotConfiguration';
