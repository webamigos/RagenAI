import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { Dialog, Text, Switch } from '@ragenai/common-ui';
import { Collapse } from '@ragenai/common-ui/Collapse';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { statusToast } from '@/app/lib/utils/toast';
import { useProjectKeyGenerator } from '@/app/hooks/useProjectKeyGenerator';
import { useDisablePublicAccess } from '@/app/hooks/useDisablePublicAccess';

import { PublicLinkSection } from './components/PublicLinkSection';
import { ChatbotConfiguration } from './components/ChatbotConfiguration';
import { EmbedScriptSection } from './components/EmbedScriptSection';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
  isPublicProject: boolean;
  linkToPublicProject: string;
  publishedAt: string;
  isChatbotEnabled?: boolean;
  onChatbotEnabledChange?: (enabled: boolean) => Promise<boolean>;
};

const BASE_URL = `${window.location.origin}/pl/public/project`;

export const ShareDialog = ({
  open,
  onClose,
  projectId,
  isPublicProject,
  linkToPublicProject,
  publishedAt,
  isChatbotEnabled: initialChatbotEnabled = false,
  onChatbotEnabledChange,
}: ShareDialogProps) => {
  const [isSharedLinkPublicly, setIsSharedLinkPublicly] = useState(
    isPublicProject || false
  );
  const [shareUrl, setShareUrl] = useState('');
  const wasPublicLinkKeyGenerated = useRef<boolean>(false);
  const wasChatbotKeyGenerated = useRef<boolean>(false);
  const [currentLinkToPublicProject, setCurrentLinkToPublicProject] =
    useState(linkToPublicProject);
  const [currentPublishedAt, setCurrentPublishedAt] = useState(publishedAt);

  const [isChatbotEnabled, setIsChatbotEnabled] = useState(
    initialChatbotEnabled
  );
  const [isChatbotCustomized, setIsChatbotCustomized] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotTitle, setChatbotTitle] = useState('');
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isUpdatingChatbotState, setIsUpdatingChatbotState] = useState(false);

  const t = useTranslations('projects');
  const { organization } = useOrganization();
  const { generateKey, isGenerating: isGeneratingKey } =
    useProjectKeyGenerator(projectId);
  const { disablePublicAccess, isDisabling } =
    useDisablePublicAccess(projectId);
  const { errorToast, successToast } = statusToast();

  const embedScript = useMemo(() => {
    if (!accessKey) {
      return;
    }

    return `<script src='${
      window.location.origin
    }/api/embed/${accessKey}?${new URLSearchParams({
      title: chatbotTitle,
      message: chatbotName,
    }).toString()}'></script>`;
  }, [accessKey, chatbotTitle, chatbotName]);

  const generateTokenAndSetUrl = async (forChatbot = false) => {
    if (!organization) {
      return null;
    }

    try {
      const accessToken = await generateKey();

      if (!accessToken) {
        return null;
      }

      if (forChatbot) {
        wasChatbotKeyGenerated.current = true;
      } else {
        wasPublicLinkKeyGenerated.current = true;
      }
      return accessToken;
    } catch (error) {
      errorToast({
        message: t('share-knowledge.refresh-error'),
      });
      return null;
    }
  };

  const handleShareToggle = async (checked: boolean) => {
    if (checked) {
      setIsSharedLinkPublicly(true);
      if (!shareUrl) {
        const accessToken = await generateTokenAndSetUrl(false);
        if (accessToken) {
          setShareUrl(`${BASE_URL}/${accessToken}`);
        } else {
          setIsSharedLinkPublicly(false);
        }
      }
    } else {
      // When toggling off, show confirmation modal
      setIsDisableModalOpen(true);
    }
  };

  const handleDisableConfirm = async () => {
    try {
      const success = await disablePublicAccess();

      if (success) {
        setIsSharedLinkPublicly(false);
        setShareUrl('');
        wasPublicLinkKeyGenerated.current = false;
        setCurrentLinkToPublicProject('');
        setCurrentPublishedAt('');
        successToast({
          message: t('share-knowledge.disable-success'),
        });
      } else {
        errorToast({
          message: t('share-knowledge.disable-error'),
        });
      }
    } catch (error) {
      errorToast({
        message: t('share-knowledge.disable-error'),
      });
    } finally {
      setIsDisableModalOpen(false);
    }
  };

  const handleDisableCancel = () => {
    setIsDisableModalOpen(false);
  };

  const handleChatbotToggle = async (checked: boolean) => {
    if (!onChatbotEnabledChange) {
      setIsChatbotEnabled(checked);
      if (checked && !accessKey) {
        const accessToken = await generateTokenAndSetUrl(true);
        if (accessToken) {
          setAccessKey(accessToken);
        } else {
          setIsChatbotEnabled(false);
        }
      }
      return;
    }

    setIsUpdatingChatbotState(true);
    try {
      const success = await onChatbotEnabledChange(checked);

      if (success) {
        setIsChatbotEnabled(checked);
        if (checked && !accessKey) {
          const accessToken = await generateTokenAndSetUrl(true);
          if (accessToken) {
            setAccessKey(accessToken);
          } else {
            // If we couldn't generate a key, revert the DB change
            await onChatbotEnabledChange(false);
            setIsChatbotEnabled(false);
            errorToast({
              message: t('share-knowledge.chatbot-enable-error'),
            });
          }
        }
      } else {
        errorToast({
          message: t('share-knowledge.chatbot-update-error'),
        });
      }
    } catch (error) {
      errorToast({
        message: t('share-knowledge.chatbot-update-error'),
      });
    } finally {
      setIsUpdatingChatbotState(false);
    }
  };

  const handleChatbotCustomizeToggle = () =>
    setIsChatbotCustomized((prev) => !prev);

  const handleLinkRefreshed = (newLink: string) => {
    setCurrentLinkToPublicProject(newLink);
    setCurrentPublishedAt(new Date().toISOString());
  };

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
            wasKeyGenerated={wasPublicLinkKeyGenerated.current}
            linkToPublicProject={`${BASE_URL}/${currentLinkToPublicProject}`}
            publishedAt={currentPublishedAt}
            projectId={projectId}
            onToggle={handleShareToggle}
            onLinkRefreshed={handleLinkRefreshed}
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
                disabled={isGeneratingKey || isUpdatingChatbotState}
              />
            </div>

            {isChatbotEnabled && wasChatbotKeyGenerated.current && (
              <div className="flex items-center justify-between mt-8">
                <Text className="text-sm text-gray-700 dark:text-gray-300">
                  {t('share-knowledge.personalize-chatbot')}
                </Text>
                <button
                  onClick={handleChatbotCustomizeToggle}
                  className="p-1 hover:bg-muted rounded-md transition"
                  aria-label={isChatbotCustomized ? t('collapse') : t('expand')}
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
          {isChatbotEnabled && wasChatbotKeyGenerated.current && (
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

      {/* Confirmation Modal for Disabling Public Access */}
      <Dialog
        open={isDisableModalOpen}
        onClose={handleDisableCancel}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <Text className="text-lg font-semibold">
            {t('share-knowledge.disable-title')}
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {t('share-knowledge.disable-confirmation')}
          </Text>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleDisableCancel}
              className="px-4 py-2 rounded text-sm text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleDisableConfirm}
              disabled={isDisabling}
              className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisabling
                ? t('share-knowledge.disabling')
                : t('share-knowledge.disable')}
            </button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
};
