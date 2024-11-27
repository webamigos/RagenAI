'use client';

import { useOrganization } from '@clerk/nextjs';
import { decodeKey, generateKey } from '../actions/generate-key';

import { useState } from 'react';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { toast } from 'react-toastify';
import { type Organization } from '@prisma/client';

type Props = {
  organizationRecord: Organization;
};

export const GenerateAccessKey = ({ organizationRecord }: Props) => {
  const { organization } = useOrganization();
  const [key, setKey] = useState('');
  const [decodedKey, setDecodedKey] = useState('');
  const [userKey, setUserKey] = useState('');

  const organizationClerkId = organization?.id;
  // FIXME: to use only public organization id
  const organizationPublicId = organizationRecord.public_id;

  if (!organizationClerkId) {
    return null;
  }

  const handleGenerateKey = async () => {
    // const key = await generateKey(organizationPublicId);
    const key = await generateKey(organizationClerkId);
    setKey(key);
  };

  const handleDecodeKey = async () => {
    try {
      const decodedKey = await decodeKey(userKey);
      setDecodedKey(decodedKey);
    } catch (error) {
      toast.error('Klucz jest nieprawidłowy');
    }
  };

  return (
    <div className="space-y-6 p-10">
      <div className="space-y-2">
        <span className="inline-block px-2 py-1 text-xs font-semibold text-red-500 bg-red-50 rounded">
          DANGER ZONE
        </span>
        <h1 className="text-2xl font-bold">
          Generowanie klucza dostępu do organizacji
        </h1>
        <div className="text-sm text-gray-500">
          ID organizacji: {organizationClerkId}
        </div>
        <div className="text-sm text-gray-500">
          Public ID: {organizationPublicId}
        </div>
      </div>

      <div className="space-y-4">
        <Button onClick={handleGenerateKey}>Generuj klucz</Button>

        {key && (
          <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
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
        )}
      </div>

      <div className="space-y-4 pt-6 border-t">
        <div className="space-y-2">
          <Input
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            placeholder="Enter access key"
            className="max-w-md"
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
