import { Meta, StoryFn } from '@storybook/react';
import { LoginForm } from './LoginForm';
import { ClerkAPIError } from '@clerk/types';

export default {
  title: 'UI/Pages/LoginForm',
  component: LoginForm,
  parameters: {
    layout: 'centered',
  },
} as Meta;

const Template: StoryFn = (args) => <LoginForm {...args} />;

export const Default = Template.bind({});

export const WithValidationErrors = Template.bind({});
WithValidationErrors.args = {
  apiErrors: [
    {
      code: 'invalid_email_address',
      message: 'Invalid email address',
      meta: {},
    },
    { code: 'invalid_password', message: 'Password is too weak', meta: {} },
  ] as ClerkAPIError[],
};

export const Submitting = Template.bind({});
Submitting.args = {
  isSubmitting: true,
};

export const ClerkErrors = Template.bind({});
ClerkErrors.args = {
  apiErrors: [
    { code: 'not_found', message: 'User not found', meta: {} },
  ] as ClerkAPIError[],
};
