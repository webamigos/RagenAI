import { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from './Dialog';
import { Button } from '../Button';

export default {
  title: 'UI/Molecules/Dialog',
  component: Dialog,
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'],
    },
    open: {
      control: 'boolean',
    },
  },
} as Meta;

const Template: StoryFn<typeof Dialog> = (args) => {
  const [isOpen, setIsOpen] = useState(args.open);

  const handleClose = () => setIsOpen(false);
  const handleOpen = () => setIsOpen(true);

  return (
    <>
      <Button label="Open Dialog" onClick={handleOpen} />
      <Dialog {...args} open={isOpen} onClose={handleClose}>
        <DialogTitle>Dialog Title</DialogTitle>
        <DialogBody>
          <DialogDescription>
            This is the description for the dialog. You can provide more details
            here.
          </DialogDescription>
        </DialogBody>
        <DialogActions>
          <Button label="Cancel" onClick={handleClose} />

          <Button label="Confirm" onClick={handleClose} />
        </DialogActions>
      </Dialog>
    </>
  );
};

export const Default = Template.bind({});
Default.args = {
  size: 'lg',
  open: false,
};

export const SmallDialog = Template.bind({});
SmallDialog.args = {
  size: 'sm',
  open: false,
};

export const LargeDialog = Template.bind({});
LargeDialog.args = {
  size: '2xl',
  open: false,
};

export const ExtraLargeDialog = Template.bind({});
ExtraLargeDialog.args = {
  size: '4xl',
  open: false,
};
