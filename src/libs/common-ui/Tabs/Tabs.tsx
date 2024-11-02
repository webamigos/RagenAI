import React, {
  type ReactNode,
  type ReactElement,
  type ComponentProps,
  type ComponentPropsWithRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { classMerge } from '../utils/cn';
type TabListProps = {
  children: ReactNode[];
  activeTab: number;
  setActiveTab: (index: number) => void;
};

interface TabPropsInterface {
  children: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}

type TabPanelProps = {
  children: ReactNode;
};

const Tabs = ({
  className,
  children,
  activeTab,
  setActiveTab,
}: TabListProps & ComponentProps<'div'>) => {
  return (
    <div className={classMerge('w-full', className)}>
      {children.map((child, index) =>
        React.isValidElement(child) && child.type === TabList
          ? React.cloneElement(child as ReactElement<TabListProps>, {
              key: `tablist-${index}`,
              activeTab,
              setActiveTab,
            })
          : null
      )}
      <AnimatePresence mode="wait">
        {children.map((child, index) =>
          React.isValidElement(child) &&
          child.type === TabPanel &&
          index - 1 === activeTab
            ? React.cloneElement(child as ReactElement<TabPanelProps>, {
                key: `tabpanel-${index}`,
              })
            : null
        )}
      </AnimatePresence>
    </div>
  );
};

const TabList = ({
  className,
  children,
  activeTab,
  setActiveTab,
}: TabListProps & ComponentProps<'div'>) => (
  <div className={classMerge('flex ml-[18px]', className)}>
    {children.map((child, index) =>
      React.isValidElement(child)
        ? React.cloneElement(child as ReactElement<TabPropsInterface>, {
            key: `tab-${index}`,
            isActive: index === activeTab,
            onClick: () => {
              setActiveTab(index);
            },
          })
        : null
    )}
  </div>
);

const Tab = ({
  className,
  children,
  isActive,
  onClick,
  ...props
}: TabPropsInterface & ComponentPropsWithRef<'button'>) => (
  <button
    type="button"
    className={classMerge(
  'flex px-4 py-2 text-sm font-medium transition',
  isActive
    ? 'border-b-2 border-primary-blue-500 dark:border-gray-200 text-primary-blue-500 dark:text-gray-200'
    : 'text-gray-600',
  className
)}
    onClick={onClick}
    {...props}
  >
    {children}
  </button>
);

const TabPanel = ({
  className,
  children,
}: TabPanelProps & ComponentProps<'div'>) => (
  <motion.div
    className={classMerge('p-4', className)}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);

export { Tabs, TabList, Tab, TabPanel };
