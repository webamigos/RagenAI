import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';

import { Tabs, TabList, Tab, TabPanel } from './Tabs';

describe('Tabs Component', () => {
  const renderTabs = () => {
    const setActiveTab = jest.fn();
    const activeTab = 0;
    render(
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
        <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
          <Tab>Tab 1</Tab>
          <Tab>Tab 2</Tab>
          <Tab>Tab 3</Tab>
        </TabList>
        <TabPanel>Content 1</TabPanel>
        <TabPanel>Content 2</TabPanel>
        <TabPanel>Content 3</TabPanel>
      </Tabs>
    );
    return { setActiveTab };
  };

  test('renders Tabs component with TabList and TabPanel', () => {
    renderTabs();
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  test('renders first TabPanel by default', () => {
    renderTabs();
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Content 3')).not.toBeInTheDocument();
  });

  test('changes TabPanel on Tab click', () => {
    const { setActiveTab } = renderTabs();
    fireEvent.click(screen.getByText('Tab 2'));
    expect(setActiveTab).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText('Tab 3'));
    expect(setActiveTab).toHaveBeenCalledWith(2);
  });
});
