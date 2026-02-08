'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useOrganization } from '@/app/hooks/use-auth';

import { Card } from '@ragenai/common-ui';
import { fetchVoiceId, updateVoiceId } from './actions';
import { statusToast } from '@/app/lib/utils/toast';
import { AudioPlayer } from './AudioPlayer';

const VOICE_OPTIONS = [
  {
    value: 'JBFqnCBsd6RMkjVDRZzb',
    label: 'Male Voice (George)',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/JBFqnCBsd6RMkjVDRZzb/e6206d1a-0721-4787-aafb-06a6e705cac5.mp3',
  },
  {
    value: 'cgSgspJ2msm6clMCkdW9',
    label: 'Female Voice (Jessica)',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3',
  },
];

export const VoiceModeSettings = () => {
  const t = useTranslations('assistant-settings.voice-mode-settings');
  const { organization } = useOrganization();
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].value);
  const toast = statusToast();

  useEffect(() => {
    const getVoiceSettings = async () => {
      if (organization?.id) {
        const response = await fetchVoiceId(organization.id);
        if (response.success && response.data?.voiceId) {
          setSelectedVoice(response.data.voiceId);
        }
      }
    };
    getVoiceSettings();
  }, [organization?.id]);

  const handleVoiceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (organization?.id) {
      const response = await updateVoiceId(organization.id, e.target.value);
      if (response.success) {
        setSelectedVoice(e.target.value);
        toast.successToast({ message: t('voice-updated') });
      } else {
        toast.errorToast({ message: t('voice-update-failed') });
      }
    }
  };

  return (
    <Card title={t('title')} size="full" collapsible defaultCollapsed>
      <Card title={t('voice-select')} className="flex flex-col mb-3">
        <div className="flex flex-col gap-2">
          <div className="space-y-2">
            {VOICE_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center gap-3">
                <input
                  type="radio"
                  id={option.value}
                  name="voice"
                  value={option.value}
                  checked={selectedVoice === option.value}
                  onChange={handleVoiceChange}
                  className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor={option.value}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  {option.label}
                </label>
                <AudioPlayer audioUrl={option.sampleUrl} />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </Card>
  );
};
