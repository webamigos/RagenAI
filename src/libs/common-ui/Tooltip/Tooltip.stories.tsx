import { Meta, StoryFn } from '@storybook/react';
import { Tooltip, TooltipProps } from './Tooltip';
import { Button } from '../Button';

export default {
  title: 'UI/Atoms/Tooltip',
  component: Tooltip,
  argTypes: {
    place: {
      control: {
        type: 'select',
        options: ['top', 'right', 'bottom', 'left'],
      },
    },
    offset: { control: { type: 'number' } },
    delayShow: { control: { type: 'number' } },
    delayHide: { control: { type: 'number' } },
    content: { control: { type: 'text' } },
    className: { control: { type: 'text' } },
  },
} as Meta;

const Template: StoryFn<TooltipProps> = (args) => (
  <Tooltip {...args}>
    <Button>Hover over me</Button>
  </Tooltip>
);

export const Default = Template.bind({});
Default.args = {
  id: 'default-tooltip',
  content: 'This is a tooltip',
};

export const TopPlacement = Template.bind({});
TopPlacement.args = {
  id: 'top-tooltip',
  content: 'Tooltip on top',
  place: 'top',
};

export const RightPlacement = Template.bind({});
RightPlacement.args = {
  id: 'right-tooltip',
  content: 'Tooltip on the right',
  place: 'right',
};

export const CustomOffset = Template.bind({});
CustomOffset.args = {
  id: 'offset-tooltip',
  content: 'Tooltip with custom offset',
  offset: 20,
};

export const CustomDelay = Template.bind({});
CustomDelay.args = {
  id: 'delay-tooltip',
  content: 'Tooltip with custom delays',
  delayShow: 500,
  delayHide: 500,
};
