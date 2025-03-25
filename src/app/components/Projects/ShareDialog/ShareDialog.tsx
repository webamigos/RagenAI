import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { Dialog, Text, Switch } from '@ragenai/common-ui';
import { Collapse } from '@ragenai/common-ui/Collapse';
import { generateKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { PublicLinkSection } from './components/PublicLinkSection';
import { ChatbotConfiguration } from './components/ChatbotConfiguration';
import { EmbedScriptSection } from './components/EmbedScriptSection';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
};

export const ShareDialog = ({ open, onClose, projectId }: ShareDialogProps) => {
  const [isSharedLinkPublicly, setIsSharedLinkPublicly] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const [isChatbotEnabled, setIsChatbotEnabled] = useState(false);
  const [isChatbotCustomized, setIsChatbotCustomized] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotTitle, setChatbotTitle] = useState('');

  const t = useTranslations('projects');
  const { organization } = useOrganization();

  const embedScript = useMemo(() => {
    if (!accessKey) return '';
    return `<script src='${
      window.location.origin
    }/api/embed/${accessKey}?${new URLSearchParams({
      title: chatbotTitle,
      message: chatbotName,
    }).toString()}'></script>`;
  }, [accessKey, chatbotTitle, chatbotName]);

  const handleShareToggle = async (checked: boolean) => {
    setIsSharedLinkPublicly(checked);
    if (checked && !shareUrl) {
      if (!organization) return;
      try {
        setIsGeneratingKey(true);
        const key = await generateKey(organization.id, projectId);
        const url = `${window.location.origin}/pl/public/${key}`;
        setShareUrl(url);
      } catch (error) {
        setIsSharedLinkPublicly(false);
      } finally {
        setIsGeneratingKey(false);
      }
    }
  };

  const handleChatbotToggle = async (checked: boolean) => {
    setIsChatbotEnabled(checked);
    if (checked && !accessKey) {
      if (!organization) return;
      try {
        setIsGeneratingKey(true);
        const key = await generateKey(organization.id, projectId);
        setAccessKey(key);
      } catch (error) {
        setIsChatbotEnabled(false);
      } finally {
        setIsGeneratingKey(false);
      }
    }
  };

  const handleChatbotCustomizeToggle = () =>
    setIsChatbotCustomized((prev) => !prev);

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl">
      <div className="w-full p-6 space-y-6">
        <Text className="text-xl font-semibold">
          {t('share-knowledge.title')}
        </Text>

        <div>
          {/* PUBLIC LINK */}
          <PublicLinkSection
            isSharedLinkPublicly={isSharedLinkPublicly}
            shareUrl={shareUrl}
            isGeneratingKey={isGeneratingKey}
            onToggle={handleShareToggle}
          />

          {/* CHATBOT ENABLE */}
          <div>
            <div className="flex items-center justify-between">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('share-knowledge.enable-chatbot')}
              </Text>
              <Switch
                checked={isChatbotEnabled}
                onChange={handleChatbotToggle}
                disabled={isGeneratingKey}
              />
            </div>

            {isChatbotEnabled && (
              <div className="flex items-center justify-between mt-8">
                <Text className="text-sm text-gray-700 dark:text-gray-300">
                  {t('share-knowledge.personalize-chatbot')}
                </Text>
                <button
                  onClick={handleChatbotCustomizeToggle}
                  className="p-1 hover:bg-muted rounded-md transition"
                >
                  <ChevronDownIcon
                    className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                      isChatbotCustomized ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* CHATBOT SETTINGS + EMBED SCRIPT */}
          {isChatbotEnabled && (
            <>
              <Collapse isOpen={isChatbotCustomized}>
                <ChatbotConfiguration
                  chatbotTitle={chatbotTitle}
                  chatbotName={chatbotName}
                  onTitleChange={setChatbotTitle}
                  onNameChange={setChatbotName}
                />
              </Collapse>

              {embedScript && <EmbedScriptSection embedScript={embedScript} />}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
};
