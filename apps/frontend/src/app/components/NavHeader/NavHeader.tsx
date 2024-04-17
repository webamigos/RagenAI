import { LanguageSwitcher } from '../LanguageSwitcher';
import { Logo } from '../Logo';
import { ThemeSwitcher } from '../Theme';
import { UserLinks } from '../UserLinks';

export const NavHeader = () => {
  return (
    <header className="mt-auto px-4 sm:px-4 lg:px-22 bg-black">
      <nav
        className="flex items-center justify-between py-4 pl-2"
        aria-label="Global"
      >
        <Logo />
        <ThemeSwitcher />
        <LanguageSwitcher />
        <UserLinks />
      </nav>
    </header>
  );
};
