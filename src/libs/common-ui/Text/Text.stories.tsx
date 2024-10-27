import type { Meta, StoryObj } from '@storybook/react';
import { Text } from './Text';

const meta: Meta<typeof Text> = {
  title: 'UI/Atoms/Text',
  component: Text,
  argTypes: {
    children: {
      control: 'text',
      description: 'Treść tekstu do wyświetlenia',
    },
    fontWeight: {
      control: 'select',
      options: ['light', 'normal', 'medium', 'semibold', 'bold'],
      description: 'Waga fontu tekstu',
    },
    fontSize: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: 'Rozmiar fontu tekstu',
    },
    color: {
      control: 'select',
      options: [
        'zinc-950',
        'blue-600',
        'gray-400',
        'gray-500',
        'gray-600',
        'red-500',
      ],
      description: 'Kolor tekstu',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Przykładowy tekst',
    fontWeight: 'normal',
    fontSize: 'md',
    color: 'zinc-950',
  },
};

export const BoldText: Story = {
  args: {
    children: 'Pogrubiony tekst',
    fontWeight: 'bold',
  },
};

export const CustomFontWeight: Story = {
  args: {
    children: 'Tekst o wybranej wadze fontu',
    fontWeight: 'semibold',
  },
};

export const DifferentFontSizes: Story = {
  args: {
    children: 'Tekst o różnym rozmiarze',
    fontSize: 'xl',
  },
};

export const DifferentColors: Story = {
  args: {
    children: 'Tekst w różnych kolorach',
    color: 'blue-600',
  },
};

export const AllPropsExample: Story = {
  args: {
    children: 'Przykład z wszystkimi właściwościami',
    fontWeight: 'semibold',
    fontSize: 'lg',
    color: 'gray-400',
  },
};
