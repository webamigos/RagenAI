import { Meta, StoryObj } from '@storybook/react';

import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Atoms/Input',
  component: Input,
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['text', 'range', 'number', 'email', 'password'],
    },
    label: { control: 'text' },
    hint: { control: 'text' },
    error: { control: 'object' },
    errorMessage: { control: 'text' },
    isLoading: { control: 'boolean' },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    skeletonHeight: { control: 'text' },
    skeletonWidth: { control: 'text' },
    containerClassName: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    label: 'Etykieta pola',
    placeholder: 'Wpisz tekst...',
    type: 'text',
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: 'To jest podpowiedź dla użytkownika.',
  },
};

export const WithError: Story = {
  args: {
    error: { message: 'Wystąpił błąd w tym polu.' } as any,
  },
};

export const PasswordField: Story = {
  args: {
    type: 'password',
    label: 'Hasło',
  },
};

export const LoadingState: Story = {
  args: {
    isLoading: true,
    skeletonHeight: 'h-8',
    skeletonWidth: 'w-full',
  },
};

export const RangeInput: Story = {
  args: {
    type: 'range',
    label: 'Wybierz wartość',
    min: 0,
    max: 100,
    step: 10,
  },
};

export const CustomStyles: Story = {
  args: {
    label: 'Niestandardowe pole',
    className: 'bg-blue-100',
    containerClassName: 'border p-4',
  },
};
