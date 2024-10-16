import React from 'react';
import { Meta, StoryFn } from '@storybook/react';
import { Tabs, TabList, Tab, TabPanel } from './Tabs';

export default {
  title: 'UI/Molecules/Tabs',
  component: Tabs,
} as Meta;

const Template: StoryFn = (args) => (
  <Tabs {...args}>
    <TabList activeTab={0} setActiveTab={() => {}}>
      <Tab>Tab 1</Tab>
      <Tab>Tab 2</Tab>
      <Tab>Tab 3</Tab>
    </TabList>
    <TabPanel>Content for Tab 1</TabPanel>
    <TabPanel>Content for Tab 2</TabPanel>
    <TabPanel>Content for Tab 3</TabPanel>
  </Tabs>
);

export const Default = Template.bind({});
Default.args = {};

export const WithMoreTabs = Template.bind({});
WithMoreTabs.args = {};

WithMoreTabs.decorators = [
  () => (
    <Tabs>
      <TabList activeTab={0} setActiveTab={() => {}}>
        <Tab>Tab 1</Tab>
        <Tab>Tab 2</Tab>
        <Tab>Tab 3</Tab>
        <Tab>Tab 4</Tab>
      </TabList>
      <TabPanel>Content for Tab 1</TabPanel>
      <TabPanel>Content for Tab 2</TabPanel>
      <TabPanel>Content for Tab 3</TabPanel>
      <TabPanel>Content for Tab 4</TabPanel>
    </Tabs>
  ),
];
