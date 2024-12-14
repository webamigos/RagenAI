'use client';

import React, { ComponentProps } from 'react';
import * as Headless from '@headlessui/react';

import { usePathname } from '@/i18n/routing';
import { useSidebar } from '@/app/hooks/useSidebar';

import { classMerge } from '../utils/cn';
import { NavbarItem } from '../Navbar';

function OpenMenuIcon({ className }: ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={classMerge('w-6 h-6 cursor-pointer', className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className="w-6 h-6 cursor-pointer"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}

function MobileSidebar({ children }: React.PropsWithChildren<{}>) {
  const { isSidebarOpen, closeSidebar } = useSidebar();

  const tabClasses = [
    'absolute w-92 h-5 create-organization-tab-mobile top-[15.5rem]',
    'absolute w-92 h-5 assistant-management-mobile top-[18rem]',
    'absolute w-92 h-5 manage-knowledge-mobile top-[20.5rem]',
  ];

  return (
    <Headless.Dialog
      open={isSidebarOpen}
      onClose={closeSidebar}
      className="lg:hidden"
    >
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 transition data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />
      <Headless.DialogPanel
        transition
        className="fixed inset-y-0 w-full sm:w-1/2 max-w-80 p-2 transition duration-300 ease-in-out data-[closed]:-translate-x-full"
      >
        <div className="flex h-full flex-col rounded-3xl bg-white dark:bg-secondary-dark shadow-sm dark:ring-white/10">
          <div className="-mb-3 px-4 pt-3">
            <Headless.CloseButton as={NavbarItem} aria-label="Close navigation">
              <CloseMenuIcon />
            </Headless.CloseButton>
          </div>
          {tabClasses.map((tabClass, index) => (
            <div key={index} className={tabClass} />
          ))}
          {children}
        </div>
      </Headless.DialogPanel>
    </Headless.Dialog>
  );
}

export function SidebarLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{
  navbar?: React.ReactNode;
  sidebar: React.ReactNode;
}>) {
  const { openSidebar } = useSidebar();
  const pathname = usePathname();

  const isMyProfile =
    pathname.startsWith(`/my-profile`) || pathname.startsWith(`/admin`);

  const baseMainStyles =
    'flex flex-1 flex-col bg-primary-light dark:bg-primary-dark overflow-y-auto';
  const baseNavbarWrapperStyles = 'flex justify-end hidden lg:flex';
  const baseContentWrapperStyles =
    'flex flex-1 h-full lg:rounded-lg lg:bg-primary-light dark:lg:bg-primary-dark lg:pb-3.5 lg:ring-zinc-950/5 dark:lg:ring-white/10';

  return (
    <div className="relative isolate flex h-full w-full bg-white max-lg:flex-col lg:bg-primary-light lg:dark:bg-primary-dark dark:bg-primary-dark">
      {/* Sidebar on desktop */}
      <div className="fixed inset-y-0 left-5 top-5 bottom-5 w-88 rounded-3xl bg-white dark:bg-secondary-dark max-lg:hidden">
        {sidebar}
      </div>

      {/* Sidebar on mobile */}
      <MobileSidebar>{sidebar}</MobileSidebar>

      {/* Navbar on mobile */}
      <header className="flex items-center px-4 lg:hidden bg-primary-light dark:bg-primary-dark">
        <NavbarItem
          className="relative"
          onClick={openSidebar}
          aria-label="Open navigation"
        >
          <div className="absolute -top-12 py-3 px-6 rounded-2xl bg-primary-blue-400 dark:bg-secondary-dark z-50">
            <OpenMenuIcon className="mt-4 text-white" />
          </div>
        </NavbarItem>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      {/* content */}
      <main
        className={`${baseMainStyles} ${
          isMyProfile
            ? 'pb-6 px-2.5 lg:ml-[22rem] lg:pt-2'
            : 'relative justify-center pb-2 lg:ml-96 lg:pt-2 overflow-auto'
        }`}
      >
        <div
          className={`${baseNavbarWrapperStyles} ${
            isMyProfile ? 'mr-0.5' : 'mr-3'
          }`}
        >
          {navbar}
        </div>
        <div
          className={`${baseContentWrapperStyles} ${
            isMyProfile
              ? 'items-start sm:px-0 pt-5 lg:shadow-sm mt-12'
              : 'justify-end'
          }`}
        >
          <div
            className={`w-full mx-auto pt-[4.5rem] mr-3 ${
              isMyProfile ? 'lg:ml-5 pb-5' : ''
            }`}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
