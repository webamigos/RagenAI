'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { Button, Input, Card } from '@ragenai/common-ui';
import { generateKey } from '../actions/generate-key';

import { Warning } from './warning';

type Props = {
  organizationRecord: { public_id: string };
};

export const GenerateAccessKey = ({ organizationRecord }: Props) => {
  const [key, setKey] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotTitle, setChatbotTitle] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [embedScript, setEmbedScript] = useState('');

  const { organization } = useOrganization();
  const t = useTranslations('generateAccessKey');

  const organizationClerkId = organization?.id;

  if (!organizationClerkId) {
    return null;
  }

  const handleGenerateKeyIfNeeded = async () => {
    if (!key) {
      const newKey = await generateKey(organizationClerkId);
      setKey(newKey);
      return newKey;
    }
    return key;
  };

  const handleGeneratePublicUrl = async () => {
    const currentKey = await handleGenerateKeyIfNeeded();
    const publicUrl = `${window.location.origin}/pl/public/${currentKey}`;
    setPublicUrl(publicUrl);
  };

  const handleGenerateEmbedCode = async () => {
    const currentKey = await handleGenerateKeyIfNeeded();
    const embedScript = `<script src='${
      window.location.origin
    }/api/embed/${currentKey}?${new URLSearchParams({
      title: chatbotTitle,
      message: chatbotName,
    }).toString()}'></script>`;
    setEmbedScript(embedScript);
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 pl-3 md:pl-0">
      <Card
        size="full"
        title={t('configure-chatbot')}
        className="mt-5 lg:mt-[4.9rem] h-min order-1 md:order-none"
      >
        <Input
          value={chatbotTitle}
          label={t('chatbot-title')}
          onChange={(e) => setChatbotTitle(e.target.value)}
          placeholder="Chatbot"
          className="w-full md:max-w-md h-10"
        />
        <Input
          value={chatbotName}
          label={t('chatbot-subtitle')}
          onChange={(e) => setChatbotName(e.target.value)}
          placeholder="Hello, how can I help you today?"
          className="w-full md:max-w-md h-10 mb-4"
        />
        <Button
          onClick={handleGenerateEmbedCode}
          className="w-full md:w-auto flex justify-center mt-4"
        >
          {t('generate-embed-code')}
        </Button>
        {embedScript && (
          <div className="space-y-4 mt-6 overflow-y-auto">
            <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                {t('embed-code')}:
                <code className="block mt-1 p-2  rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all">
                  {embedScript}
                </code>
              </p>
            </div>
            <Warning warningText={'embed-code-warning'} />
          </div>
        )}
      </Card>
      <Card
        size="full"
        title={t('configure-public-access')}
        className="mt-5 lg:mt-[4.9rem] h-min order-1 md:order-none"
      >
        <div className="flex justify-center">
          <Button
            onClick={handleGeneratePublicUrl}
            className="w-full md:w-auto flex justify-center mt-4"
          >
            {t('generate-public-key')}
          </Button>
        </div>
        {publicUrl && (
          <div className="space-y-4 mt-6 overflow-y-auto">
            <div className="space-y-2 p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
              <p className="text-sm text-gray-600">
                {t('public-access-URL')}:
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 font-mono text-blue-500 hover:underline"
                >
                  {publicUrl}
                </a>
              </p>
            </div>
            <Warning warningText={'public-access-warning'} />
          </div>
        )}
      </Card>
    </div>
  );
};
