'use client';

import React, { ComponentProps } from 'react';
import * as Headless from '@headlessui/react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';

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

  return (
    <Headless.Dialog
      open={isSidebarOpen}
      onClose={closeSidebar}
      className="lg:hidden"
    >
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0  bg-black/30 transition data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />
      <Headless.DialogPanel
        transition
        className="fixed inset-y-0 w-full sm:w-1/2 max-w-80 p-2 transition duration-300 ease-in-out data-[closed]:-translate-x-full"
      >
        <div className="flex h-full flex-col rounded-3xl bg-white shadow-sm dark:bg-slate-900 dark:ring-white/10">
          <div className="-mb-3 px-4 pt-3">
            <Headless.CloseButton as={NavbarItem} aria-label="Close navigation">
              <CloseMenuIcon />
            </Headless.CloseButton>
          </div>
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
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
}>) {
  const { openSidebar } = useSidebar();
  const pathname = usePathname();
  const locale = useLocale();

  const isMyProfile =
    pathname.startsWith(`/${locale}/my-profile`) ||
    pathname.startsWith(`/${locale}/admin`);

  return (
    <div className="relative isolate flex h-full w-full bg-white max-lg:flex-col lg:bg-primary-light lg:dark:bg-slate-900 dark:bg-zinc-900 dark:lg:bg-zinc-950">
      {/* Sidebar on desktop */}
      <div className="fixed inset-y-0 left-5 top-5 bottom-5 w-88 rounded-3xl bg-white dark:bg-slate-900 max-lg:hidden">
        {sidebar}
      </div>

      {/* Sidebar on mobile */}
      <MobileSidebar>{sidebar}</MobileSidebar>

      {/* Navbar on mobile */}
      <header className="flex items-center px-4 lg:hidden bg-primary-light">
        <NavbarItem
          className="relative"
          onClick={openSidebar}
          aria-label="Open navigation"
        >
          <div className="absolute -top-6 py-3 px-6 rounded-2xl bg-primary-blue-400 z-50">
            <OpenMenuIcon className="mt-4 text-white" />
          </div>
        </NavbarItem>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      {/* content */}
      {isMyProfile ? (
        <main className="flex flex-1 flex-col pb-6 px-2.5 lg:ml-[22rem] lg:pt-2 bg-primary-light overflow-y-auto">
          <div className="flex flex-1 h-full items-start sm:px-0 pt-5 lg:rounded-lg lg:bg-primary-light lg:py-3.5 lg:shadow-sm lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
            <div className="w-full max-w-7xl lg:ml-5 pb-5 mx-auto">
              {children}
            </div>
          </div>
        </main>
      ) : (
        <main className="relative flex justify-center flex-1 flex-col pb-2 lg:ml-96 lg:pt-2 bg-primary-light">
          <div className="flex flex-1 h-full lg:rounded-lg lg:bg-primary-light lg:py-3.5 justify-end lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
            <div className="w-full max-w-7xl mx-auto">{children}</div>
          </div>
        </main>
      )}
    </div>
  );
}
