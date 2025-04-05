import React, {
  type ReactNode,
  type ReactElement,
  type ComponentProps,
  type ComponentPropsWithRef,
  ComponentPropsWithoutRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { classMerge } from '../utils/cn';
import { Link } from '@/i18n/routing';
type TabListProps = {
  children: ReactNode[] | ReactNode;
  activeTab: number;
  setActiveTab: (index: number) => void;
};

interface TabPropsInterface {
  children: ReactNode;
  isActive?: boolean;
  href: string;
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
  const childArray = React.Children.toArray(children);

  return (
    <div className={classMerge('w-full', className)}>
      {childArray.map((child, index) =>
        React.isValidElement(child) && child.type === TabList
          ? React.cloneElement(child as ReactElement<TabListProps>, {
              key: `tablist-${index}`,
              activeTab,
              setActiveTab,
            })
          : null
      )}
      <AnimatePresence mode="wait">
        {childArray.map((child, index) =>
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
}: TabListProps & ComponentProps<'div'>) => {
  if (!children) return null;

  const childArray = React.Children.toArray(children);

  return (
    <div className={classMerge('flex ml-[18px]', className)}>
      {childArray.map((child, index) =>
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
};

const Tab = ({
  className,
  children,
  isActive,
  href,
  onClick,
  ...props
}: TabPropsInterface & ComponentPropsWithoutRef<'a'>) => (
  <Link
    href={href}
    className={classMerge(
      'flex cursor-pointer px-2 mx-2 py-2 text-sm font-medium transition',
      isActive
        ? 'border-b-2 border-primary-blue-500 dark:border-gray-200 text-blue-600 dark:text-gray-200'
        : 'text-gray-600',
      className
    )}
    onClick={onClick}
    {...props}
  >
    {children}
  </Link>
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
