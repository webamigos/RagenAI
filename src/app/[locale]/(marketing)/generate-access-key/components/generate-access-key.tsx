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

  const handleGenerateKey = async () => {
    const key = await generateKey(organizationClerkId);
    setKey(key);
  };

  const handleDecodeKey = async () => {
    try {
      const decodedKey = await decodeKey(userKey);
      setDecodedKey(decodedKey);
    } catch (error) {
      errorToast({ message: 'Klucz jest nieprawidłowy' });
    }
  };

  const toggleOrgIdVisibility = () => {
    setIsOrgIdVisible((prev) => !prev);
  };

  return (
    <div className="space-y-6">
      <Card title={t('title')} size="full" className="relative mt-[4.9rem]">
        <div className="p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
          <div className="mb-4 text-sm text-gray-500">
            <Text className="mb-1" fontWeight="bold">
              {t('organization-id')}
            </Text>
            <div className="flex p-1 border rounded-lg w-full md:w-1/2 lg:w-[30%] items-center">
              <Text className={`${isOrgIdVisible ? '' : 'blur-sm'} mr-auto`}>
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
            <div className="flex p-1 border rounded-lg w-full md:w-1/2 lg:w-[30%] items-center">
              <Text>{organizationPublicId}</Text>
            </div>
          </div>
        </div>
      </Card>

      {/* Configuration and Key Generation */}
      <div>
        <div className="flex flex-col items-start gap-4">
          <h2 className="text-lg font-bold">Konfiguracja chatbota</h2>
          <Input
            value={chatbotTitle}
            onChange={(e) => setChatbotTitle(e.target.value)}
            placeholder="Tytuł okna czatbota"
            className="max-w-md h-10"
          />
          <Input
            value={chatbotName}
            onChange={(e) => setChatbotName(e.target.value)}
            placeholder="Podtytuł okna czatbota"
            className="max-w-md h-10"
          />
          <Button onClick={handleGenerateKey}>Generuj klucz</Button>
        </div>

        {key && (
          <div className="space-y-4 mt-6">
            <div className="space-y-2 p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
              <p className="text-sm text-gray-600">
                Twój klucz dostępu to:
                <span className="block mt-1 font-mono text-lg text-red-500">
                  {key}
                </span>
              </p>
              <p className="text-sm text-orange-500">
                Osoby z tym kluczem mają dostęp do wszystkich dokumentów w
                organizacji.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Decode Key */}
      <div className="space-y-4 pt-6 border-t">
        <div className="space-y-2">
          <Input
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            placeholder="Enter access key"
            className="max-w-md h-10"
          />
          <Button onClick={handleDecodeKey}>Decode Key</Button>
        </div>

        {decodedKey && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Decoded key:{' '}
              <span className="font-mono text-lg text-red-500">
                {decodedKey}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
