import { NextIntlClientProvider, useMessages } from 'next-intl';
import { NavHeader } from '../../components/NavHeader';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import {
  SidebarBody,
  SidebarSection,
  SidebarItem,
  SidebarLabel,
  SidebarHeader,
} from '../../components/Sidebar/Sidebar';
import { Navbar } from '../../components/Sidebar/navbar';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownLabel,
} from '../../components/Sidebar/dropdown';
import { SidebarLayout } from '../../components/Sidebar/sidebar-layout';
import { Logo } from '../../components/Logo';
import { ThemeSwitcher } from '../../components/Theme';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function MarketingLayout({ children }: Props) {
  const messages = useMessages();
  const DownIcon = () => {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m19.5 8.25-7.5 7.5-7.5-7.5"
        />
      </svg>
    );
  };
  return (
    <NextIntlClientProvider messages={messages}>
      <Toast />
      <div className="h-screen flex flex-col">
        <SidebarLayout
          navbar={
            <Navbar>
              <NavHeader />
            </Navbar>
          }
          sidebar={
            <Sidebar className="dark:bg-slate-900">
              <SidebarHeader>
                <Dropdown>
                  <div className="flex">
                    <Logo />
                    <DropdownButton as={SidebarItem} className="lg:mb-2.5">
                      <DownIcon />
                    </DropdownButton>
                    <DropdownMenu
                      className="w-60 lg:min-w-64"
                      anchor="bottom end"
                    >
                      <DropdownItem className="w-full">
                        <NavHeader />
                      </DropdownItem>
                    </DropdownMenu>
                  </div>
                </Dropdown>
              </SidebarHeader>
              <SidebarBody>
                <SidebarSection>
                  <SidebarItem href="/">
                    {/* <HomeIcon /> */}
                    <SidebarLabel>Home</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
              </SidebarBody>
            </Sidebar>
          }
        >
          {children}
        </SidebarLayout>
      </div>
    </NextIntlClientProvider>
  );
}
