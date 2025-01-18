'use client';

import { useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { decodeKey, generateKey } from '../actions/generate-key';
import { useTranslations } from 'next-intl';

import { Button, Input, Text } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';

import { type Organization } from '@prisma/client';
import { Card } from '@ragenai/common-ui/Card';

type Props = {
  organizationRecord: Organization;
};

export const GenerateAccessKey = ({ organizationRecord }: Props) => {
  const [key, setKey] = useState('');
  const [decodedKey, setDecodedKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotTitle, setChatbotTitle] = useState('');

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

  const embedScript = `<script src='${
    window.location.origin
  }/api/embed/${key}?${new URLSearchParams({
    title: chatbotTitle,
    message: chatbotName,
  }).toString()}'></script>`;
  const publicUrl = `${window.location.origin}/pl/public/${key}`;

  return (
    <Card title={t('title')} size="full" className="relative mt-[4.9rem]">
      <div className="space-y-6">
        <span className="absolute top-6 left-1/3 ml-2 inline-block px-2 py-1 text-xs font-semibold text-red-500 bg-red-50 rounded">
          DANGER ZONE
        </span>
        <div className="p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
          <div className="mb-4 text-sm text-gray-500">
            <Text className="mb-1" fontWeight="bold">
              ID organizacji
            </Text>
            <Text>{organizationClerkId}</Text>
          </div>
          <div className="text-sm text-gray-500">
            <Text className="mb-1" fontWeight="bold">
              Public ID
            </Text>
            <Text>{organizationPublicId}</Text>
          </div>
        </div>

        <div>
          <div className="flex flex-col items-start gap-4">
            <div>
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
            </div>
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

              <div className="space-y-2 p-4 bg-gray-50 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                <p className="text-sm text-gray-600">
                  Public access URL:
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
                  Embed code:
                  <code className="block mt-1 p-2 bg-gray-100 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all">
                    {embedScript}
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>

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
    </Card>
  );
};
