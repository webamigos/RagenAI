'use client';

import './editor-styles.css';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import ReactQuill from 'react-quill-new';
import { Card, Button, Text } from '@salesyy/common-ui';

const schema = z.object({
  content: z.string().min(1, 'Content is required'),
});

export type DocumentSchema = z.infer<typeof schema>;

export const DocumentCreator = () => {
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DocumentSchema>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    register('content', { required: true, minLength: 11 });
  }, [register]);

  const onEditorStateChange = (editorState: string) => {
    setValue('content', editorState);
  };
  const editorContent = watch('content');

  const onSubmit = async (data: DocumentSchema) => {};

  return (
    <Card size="full">
      <form onSubmit={handleSubmit(onSubmit)}>
        <ReactQuill
          className="custom-quill w-full"
          theme="snow"
          value={editorContent}
          onChange={onEditorStateChange}
        />
        {errors.content && (
          <Text color="red-500">{errors.content.message}</Text>
        )}
        <Button label="Save" type="submit" />
      </form>
    </Card>
  );
};
