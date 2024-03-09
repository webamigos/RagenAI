import type { Meta, StoryObj } from '@storybook/react';

import { Link } from './Link';

const meta = {
  title: 'UI/Atoms/Link',
  component: Link,
  tags: ['autodocs'],
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '#',
    children: 'Click me',
  },
};

export const _ButtonVariant: Story = {
  args: {
    href: '#',
    children: 'Click me',
    variant: 'button',
  },
};

export const _ArrowVariant: Story = {
  args: {
    href: '#',
    children: 'Click me',
    variant: 'arrow',
  },
};

export const _BlankVariant: Story = {
  args: {
    href: '#',
    children: 'Click me',
    variant: 'blank',
  },
};
