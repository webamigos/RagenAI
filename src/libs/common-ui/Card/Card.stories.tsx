import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Card } from './Card';
import { Text } from '../Text';

const meta: Meta<typeof Card> = {
  title: 'UI/Molecules/Card',
  component: Card,
  argTypes: {
    title: {
      control: 'text',
      description: 'Title displayed at the top of the card.',
      defaultValue: 'Example title',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'full'],
      description: 'Card size.',
      defaultValue: 'sm',
    },
    // shadow: {
    //   control: 'boolean',
    //   description: 'Box-shadow presence control.',
    //   defaultValue: true,
    // },
    children: {
      control: false,
      description: 'Content inside card.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SmallCard: Story = {
  args: {
    title: 'Small card',
    size: 'sm',
    children: <Text>Lorem Ipsum dolor sit</Text>,
  },
};

export const MediumCard: Story = {
  args: {
    title: 'Middle card',
    size: 'md',
    children: (
      <Text>
        Middle card Neque porro quisquam est qui dolorem ipsum quia dolor sit
        amet, consectetur, adipisci velit...
      </Text>
    ),
  },
};

export const LargeCard: Story = {
  args: {
    title: 'Large card',
    size: 'lg',
    children: (
      <Text>
        Neque porro quisquam est qui dolorem ipsum quia dolor sit amet,
        consectetur, adipisci velit... There is no one who loves pain itself,
        who seeks after it and wants to have it, simply because it is pain...
      </Text>
    ),
  },
};

export const FullWidthCard: Story = {
  args: {
    title: 'Full width',
    size: 'full',
    children: <Text>This tab takes up all available space</Text>,
  },
};

export const CustomContent: Story = {
  args: {
    title: 'Example card',
    size: 'md',
    children: (
      <div>
        <Text>Lorem ipsum dolor sit amet, consectetur adipiscing elit </Text>
        <ul className="list-disc list-inside mt-2">
          <li>First</li>
          <li>Second</li>
          <li>Third</li>
        </ul>
      </div>
    ),
  },
};

export const NoShadowCard: Story = {
  args: {
    title: 'No shadow-sm card',
    size: 'md',
    // shadow: false,
    children: (
      <Text>
        This card does not have a shadow. You can use this for simpler layouts
        where shadows are not needed.
      </Text>
    ),
  },
};
