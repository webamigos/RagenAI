'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, Button, Input } from '@ragenai/common-ui';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@ragenai/common-ui/Dropdown';
import { statusToast } from '@/app/lib/utils/toast';
import { processUrl } from './actions';
import { logger } from '@/app/lib/utils/logger';
import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';
import { getAddFromUrlSchema, AddFromUrlFormData } from './schema';

export const AddFromUrl = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<WebsiteLoaderMode>(
    WebsiteLoaderMode.SCRAPE
  );

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('add-from-url');
  const schema = getAddFromUrlSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
  } = useForm<AddFromUrlFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: '',
      mode: WebsiteLoaderMode.SCRAPE,
    },
  });

  const handleModeChange = (newMode: WebsiteLoaderMode) => {
    setSelectedMode(newMode);
    setValue('mode', newMode);
  };

  const onSubmit = async (data: AddFromUrlFormData) => {
    setIsLoading(true);

    try {
      const result = await processUrl(data.url, data.mode);

      if (!result.success) {
        throw new Error(result.message || 'Failed to process URL');
      }

      successToast({ message: t('success-message') });
      reset();
      setSelectedMode(WebsiteLoaderMode.SCRAPE);
    } catch (error) {
      logger.error({ err: error }, 'Error processing URL');
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
                  {...register('url')}
                  error={errors.url}
                  disabled={isLoading}
                />
              </div>

              {/* TODO: enable as a feature */}
              <div className="flex flex-col gap-1">
                {/* <label className="block text-sm/6 text-gray-600 font-medium leading-6 dark:text-gray-300">
                  {t('mode-label')}
                </label>
                <Dropdown>
                  <DropdownButton className="w-full py-2 px-3 text-left border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-accent-dark-500 dark:text-white">
                    {selectedMode === WebsiteLoaderMode.SCRAPE
                      ? t('mode-scrape')
                      : t('mode-crawl')}
                  </DropdownButton>

                  <DropdownMenu>
                    <DropdownItem
                      onClick={() => handleModeChange(WebsiteLoaderMode.SCRAPE)}
                    >
                      {t('mode-scrape')}
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => handleModeChange(WebsiteLoaderMode.CRAWL)}
                    >
                      {t('mode-crawl')}
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown> */}
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
