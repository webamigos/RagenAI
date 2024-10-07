import type { Meta, StoryObj } from '@storybook/react';
import { Divider } from './Divider';

const meta: Meta<typeof Divider> = {
  title: 'UI/Atoms/Divider',
  component: Divider,
  argTypes: {
    soft: {
      control: 'boolean',
      description:
        'Specifies whether the Divider is displayed in soft mode - it should look thinner',
      defaultValue: false,
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    soft: false,
  },
};

export const SoftDivider: Story = {
  args: {
    soft: true,
  },
};
