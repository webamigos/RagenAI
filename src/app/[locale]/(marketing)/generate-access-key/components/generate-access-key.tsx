'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import {
  Button,
  Input,
  OpenEyeIcon,
  EyeOffIcon,
  Text,
  Card,
  StackIcon,
} from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { decodeKey, generateKey } from '../actions/generate-key';

import { type Organization } from '@prisma/client';

type Props = {
  organizationRecord: Organization;
};

export const GenerateAccessKey = ({ organizationRecord }: Props) => {
  const [key, setKey] = useState('');
  const [decodedKey, setDecodedKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotTitle, setChatbotTitle] = useState('');
  const [isOrgIdVisible, setIsOrgIdVisible] = useState(false);

  const { errorToast } = statusToast();
  const { organization } = useOrganization();
  const t = useTranslations('generateAccessKey');

  const organizationClerkId = organization?.id;
  const organizationPublicId = organizationRecord.public_id;

  if (!organizationClerkId) {
    return null;
  }

  const handleGenerateEmbedId = async () => {
    const key = await generateKey(organizationClerkId);
    setKey(key);
  };

  const handleDecodeKey = async () => {
    try {
      const decodedKey = await decodeKey(userKey);
      setDecodedKey(decodedKey);
    } catch (error) {
      errorToast({ message: t('decode-key-error') });
    }
  };

  const toggleOrgIdVisibility = () => {
    setIsOrgIdVisible((prev) => !prev);
  };

  const embedScript = `<script src='${
    window.location.origin
  }/api/embed/${key}?${new URLSearchParams({
    title: chatbotTitle,
    message: chatbotName,
  }).toString()}'></script>`;
  const publicUrl = `${window.location.origin}/pl/public/${key}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="w-full">
        <Card
          title={t('title')}
          size="full"
          className="mt-5 lg:mt-[4.9rem] mb-3"
        >
          <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap break-all">
            <div className="text-sm text-gray-500">
              <Text className="mb-1" fontWeight="bold">
                {t('organization-id')}
              </Text>
              <div className="grid grid-cols-[1fr_auto] gap-2 p-1 border rounded-lg items-center">
                <Text className={`${isOrgIdVisible ? '' : 'blur-sm'}`}>
                  {organizationClerkId}
                </Text>
                {isOrgIdVisible ? (
                  <EyeOffIcon
                    className="w-4 h-4"
                    onClick={toggleOrgIdVisibility}
                  />
                ) : (
                  <OpenEyeIcon
                    className="w-4 h-4"
                    onClick={toggleOrgIdVisibility}
                  />
                )}
              </div>
            </div>
            <div className="text-sm text-gray-500">
              <Text className="mb-1" fontWeight="bold">
                {t('public-id')}
              </Text>
              <div className="p-1 border rounded-lg">
                <Text>{organizationPublicId}</Text>
              </div>
            </div>
          </div>
        </Card>

        <Card size="full" title={t('decode-key')}>
          <div className="space-y-2">
            <Input
              value={userKey}
              onChange={(e) => setUserKey(e.target.value)}
              placeholder={t('decode-key-placeholder')}
              className="max-w-md h-10 mb-2"
            />
            <Button onClick={handleDecodeKey}>{t('decode-key')}</Button>
          </div>

          {decodedKey && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                {t('decode-key')}:{' '}
                <span className="font-mono text-lg text-red-500">
                  {decodedKey}
                </span>
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card
        size="full"
        title={t('configure-public-access')}
        className="mt-5 lg:mt-[4.9rem] h-min"
      >
        <div>
          <Input
            value={chatbotTitle}
            onChange={(e) => setChatbotTitle(e.target.value)}
            placeholder={t('chatbot-title')}
            className="max-w-md h-10"
          />
          <Input
            value={chatbotName}
            onChange={(e) => setChatbotName(e.target.value)}
            placeholder={t('chatbot-subtitle')}
            className="max-w-md h-10 mb-4"
          />
          <Button onClick={handleGenerateEmbedId}>
            {t('generate-public-key')}
          </Button>

          {key && (
            <div className="space-y-4 mt-6 overflow-y-auto">
              <div className="space-y-2 p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                <p className="text-sm text-gray-600">
                  {t('your-access-key')}:
                  <span className="block mt-1 font-mono text-red-500">
                    {key}
                  </span>
                </p>
                <p className="text-sm text-orange-500">
                  {t('access-key-warning')}
                </p>
              </div>
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

              <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  {t('embed-code')}:
                  <code className="block mt-1 p-2 bg-gray-100 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all">
                    {embedScript}
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
