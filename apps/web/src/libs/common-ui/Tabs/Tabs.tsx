import React, {
  type ReactNode,
  type ReactElement,
  type ComponentProps,
  type ComponentPropsWithoutRef,
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
  href?: string;
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
          : null,
      )}
      <AnimatePresence mode="wait">
        {childArray.map((child, index) =>
          React.isValidElement(child) &&
          child.type === TabPanel &&
          index - 1 === activeTab
            ? React.cloneElement(child as ReactElement<TabPanelProps>, {
                key: `tabpanel-${index}`,
              })
            : null,
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
  if (!children) {
    return null;
  }

  const childArray = React.Children.toArray(children);

  return (
    <div
      className={classMerge(
        'inline-flex gap-1 rounded-lg bg-muted p-1',
        className,
      )}
    >
      {childArray.map((child, index) =>
        React.isValidElement(child)
          ? React.cloneElement(child as ReactElement<TabPropsInterface>, {
              key: `tab-${index}`,
              isActive: index === activeTab,
              onClick: () => {
                setActiveTab(index);
              },
            })
          : null,
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
    href={href ? href : '#'}
    className={classMerge(
      'flex cursor-pointer px-3 py-1.5 text-sm rounded-md transition-all',
      isActive
        ? 'bg-card text-foreground font-semibold shadow-sm'
        : 'font-medium text-muted-foreground hover:text-foreground ',
      className,
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
