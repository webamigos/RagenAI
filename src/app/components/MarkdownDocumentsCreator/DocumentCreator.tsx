import parse from 'html-react-parser';
import DOMPurify from 'dompurify';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useOrganization } from '@clerk/nextjs';
import TurndownService from 'turndown';

import { zodResolver } from '@hookform/resolvers/zod';
import { statusToast } from '@/app/lib/utils/toast';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';
import {
  Card,
  ArrowRightCircleIcon,
  Input,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  WysiwygEditor,
} from '@salesyy/common-ui';
import { uploadFiles } from '@/app/lib/services/api';

const turndownService = new TurndownService();

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
});

const initialValues = {
  title: '',
  content: '',
};

export type DocumentSchema = z.infer<typeof schema>;

export const DocumentCreator = () => {
  const [activeTab, setActiveTab] = useState(0);

  const t = useTranslations('create-document');
  const { successToast, errorToast } = statusToast();
  const { organization } = useOrganization();
  const { addDocument } = useUserDocumentsContext();

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, touchedFields },
  } = useForm<DocumentSchema>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });

  const editorContent = watch('content');
  const sanitizedContent = DOMPurify.sanitize(editorContent || '');

  const onEditorStateChange = (editorState: string) => {
    setValue('content', editorState, {
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const onSubmit = async (data: DocumentSchema) => {
    if (!organization) return;
    try {
      const organizationId = organization.id.toLowerCase();
      const markdownContent = turndownService.turndown(editorContent);

      const formData = new FormData();
      formData.append(
        'files',
        new File([markdownContent], `${data.title}.md`, {
          type: 'text/markdown',
        })
      );
      formData.append('organizationId', organization.id);

      const response = await uploadFiles(organizationId, formData);

      if (response.status === 200 && response.files) {
        const document = response.files[0];
        addDocument({
          id: document.uniqueFileId,
          organization_id: organizationId,
          file_name: document.fileName,
          file_size: document.fileSize,
        });
        reset();
        successToast({ message: t('created-successful') });
      } else if (response.message) {
        errorToast({ message: response.message });
      }
    } catch (error) {
      errorToast({ message: t('send-error') });
    }
  };

  return (
    <Card title={t('title')} size="full" className="h-full flex flex-col">
      <form onSubmit={handleSubmit(onSubmit)} className="h-full flex flex-col">
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
          <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
            <Tab>{t('edit')}</Tab>
            <Tab>{t('preview')}</Tab>
          </TabList>
          <TabPanel className="h-full">
            <Input
              mandatory={true}
              label={t('input-label')}
              type="text"
              placeholder={t('input-placeholder')}
              {...register('title')}
              className="mb-2 w-full p-2 border-gray-300"
              error={touchedFields.title ? errors.title : undefined}
              errorMessage={errors.title?.message}
            />
            <div className="h-[25.2rem] flex-1 flex flex-col">
              <WysiwygEditor
                label={t('content')}
                mandatory={true}
                onChange={onEditorStateChange}
                value={editorContent || ''}
                error={touchedFields.content ? errors.content : undefined}
                errorMessage={errors.content?.message}
                className="flex-1 "
              />
            </div>
          </TabPanel>
          <TabPanel className="h-full flex-1">
            <div className="flex-1 preview-content  h-[25.2rem] overflow-auto border dark:border-gray-600 p-4 rounded-2xl bg-gray-50 dark:bg-accent-dark-300">
              <h2 className="text-xl font-semibold mb-4">{watch('title')}</h2>
              <div className="h-full flex-1 prose prose-lg dark:prose-invert">
                {parse(sanitizedContent)}
              </div>
            </div>
          </TabPanel>
        </Tabs>
        <button type="submit" className="rounded-full cursor-pointer">
          <ArrowRightCircleIcon className="ml-3 fill-accent-dark-400 hover:fill-gray-100 dark:hover:fill-accent-dark-300 stroke-1" />
        </button>
      </form>
    </Card>
  );
};
