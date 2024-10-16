import React from 'react';
import { Meta, StoryFn } from '@storybook/react';
import { FileUploader } from './FileUploader';
import { action } from '@storybook/addon-actions';

export default {
  title: 'UI/Molecules/FileUploader',
  component: FileUploader,
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Is Disabled?',
    },
  },
} as Meta<typeof FileUploader>;

const Template: StoryFn<typeof FileUploader> = (args) => (
  <FileUploader {...args} />
);

export const Default = Template.bind({});
Default.args = {
  onFilesAdded: action('Files Added'),
  disabled: false,
};

export const Disabled = Template.bind({});
Disabled.args = {
  onFilesAdded: action('Files Added'),
  disabled: true,
};

export const MarkdownAndEpubSupport = Template.bind({});
MarkdownAndEpubSupport.args = {
  onFilesAdded: (files) => {
    files.forEach((file) => {
      if (file.name.endsWith('.md') || file.name.endsWith('.epub')) {
        action('Files Added')(file.name);
      }
    });
  },
  disabled: false,
};
