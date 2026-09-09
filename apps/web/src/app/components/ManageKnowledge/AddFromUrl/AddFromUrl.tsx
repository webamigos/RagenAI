'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from '@ragenai/common-ui/Card';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { processUrl } from './actions';
import { logger } from '@/app/lib/utils/logger';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';
import { getAddFromUrlSchema, type AddFromUrlFormData } from './schema';

export const AddFromUrl = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('add-from-url');
  const schema = getAddFromUrlSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AddFromUrlFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: '',
      mode: WebsiteLoaderMode.SCRAPE,
    },
  });

  const onSubmit = async (data: AddFromUrlFormData) => {
    setIsLoading(true);

    try {
      const result = await processUrl(data.url, data.mode);

      if (!result.success) {
        throw new Error(result.message || 'Failed to process URL');
      }

      successToast({ message: t('success-message') });
      reset();
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
                {/* <label className="block text-sm/6 text-muted-foreground font-medium leading-6">
                  {t('mode-label')}
                </label>
                <Dropdown>
                  <DropdownButton className="w-full py-2 px-3 text-left border border-border rounded-md bg-card dark:bg-paper-800 dark:text-foreground">
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
                  isSubmit={true}
                  isLoading={isLoading}
                  disabled={isLoading}
                >
                  {isLoading ? t('button-processing') : t('button-process')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Card>
  );
};
