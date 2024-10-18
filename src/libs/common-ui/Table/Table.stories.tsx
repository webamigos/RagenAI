import { Meta, StoryFn } from '@storybook/react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from './Table';

export default {
  title: 'UI/Molecules/Table',
  component: Table,
  subcomponents: { TableHead, TableBody, TableRow, TableHeader, TableCell },
  argTypes: {
    bleed: { control: 'boolean' },
    dense: { control: 'boolean' },
    grid: { control: 'boolean' },
    striped: { control: 'boolean' },
  },
} as Meta;

const Template: StoryFn = (args) => (
  <Table {...args}>
    <TableHead>
      <TableRow>
        <TableHeader>Name</TableHeader>
        <TableHeader>Age</TableHeader>
        <TableHeader>Location</TableHeader>
      </TableRow>
    </TableHead>
    <TableBody>
      <TableRow>
        <TableCell>John Doe</TableCell>
        <TableCell>28</TableCell>
        <TableCell>New York</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Jane Smith</TableCell>
        <TableCell>34</TableCell>
        <TableCell>Los Angeles</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);

export const Default = Template.bind({});
Default.args = {};

export const Striped = Template.bind({});
Striped.args = {
  striped: true,
};

export const Grid = Template.bind({});
Grid.args = {
  grid: true,
};

export const Dense = Template.bind({});
Dense.args = {
  dense: true,
};

export const Bleed = Template.bind({});
Bleed.args = {
  bleed: true,
};

export const AllOptionsEnabled = Template.bind({});
AllOptionsEnabled.args = {
  bleed: true,
  dense: true,
  grid: true,
  striped: true,
};
