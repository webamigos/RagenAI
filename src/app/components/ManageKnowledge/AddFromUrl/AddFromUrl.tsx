'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { useForm } from 'react-hook-form';

import { Card, Button, Input } from '@ragenai/common-ui';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@ragenai/common-ui/Dropdown';
import { statusToast } from '@/app/lib/utils/toast';
// import { processUrl } from '@/app/actions/url';

type CrawlMode = 'scrape' | 'crawl';

interface FormValues {
  url: string;
  mode: CrawlMode;
}

export const AddFromUrl = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<CrawlMode>('scrape');

  const { organization } = useOrganization();
  const { successToast, errorToast } = statusToast();
  const t = useTranslations('add-from-url');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      url: '',
      mode: 'scrape',
    },
  });

  if (!organization) {
    return null;
  }

  const validateUrl = (value: string): boolean | string => {
    if (!value) return t('validation.url-required');

    try {
      const urlObj = new URL(value);
      return (
        urlObj.protocol === 'http:' ||
        urlObj.protocol === 'https:' ||
        t('validation.invalid-url')
      );
    } catch (e) {
      return t('validation.invalid-url');
    }
  };

  const handleModeChange = (newMode: CrawlMode) => {
    setSelectedMode(newMode);
    setValue('mode', newMode);
  };

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);

    try {
      //   const result = await processUrl(data.url, data.mode);

      //   if (!result.success) {
      //     throw new Error(result.message || 'Failed to process URL');
      //   }

      successToast({ message: t('success-message') });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error processing URL:', error);
      errorToast({ message: t('error-message') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6" size="full">
      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">{t('title')}</h2>

        <div className="flex flex-col">
          <div className="w-full max-w-2xl flex flex-col gap-4">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <div>
                <Input
                  label={t('url-label')}
                  placeholder={t('url-placeholder')}
                  {...register('url', {
                    required: t('validation.url-required'),
                    validate: validateUrl,
                  })}
                  error={errors.url}
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="block text-sm/6 text-gray-600 font-medium leading-6 dark:text-gray-300">
                  {t('mode-label')}
                </label>
                <Dropdown>
                  <DropdownButton className="w-full py-2 px-3 text-left border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-accent-dark-500 dark:text-white">
                    {selectedMode === 'scrape'
                      ? t('mode-scrape')
                      : t('mode-crawl')}
                  </DropdownButton>
                  <DropdownMenu>
                    <DropdownItem onClick={() => handleModeChange('scrape')}>
                      {t('mode-scrape')}
                    </DropdownItem>
                    <DropdownItem onClick={() => handleModeChange('crawl')}>
                      {t('mode-crawl')}
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
                <input type="hidden" {...register('mode')} />
              </div>

              <div className="mt-2">
                <Button
                  className="px-6"
                  label={
                    isLoading ? t('button-processing') : t('button-process')
                  }
                  type="submit"
                  isLoading={isLoading}
                  disabled={isLoading}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </Card>
  );
};
