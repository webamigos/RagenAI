import { LanguageSwitcher } from '../LanguageSwitcher';
import { Logo } from '../Logo';
import { ThemeSwitcher } from '../Theme';

export const NavHeader = () => {
  return (
    <header className="px-4 sm:px-4 lg:px-22 bg-black">
      <nav
        className="flex items-center justify-between p-6 lg:px-8"
        aria-label="Global"
      >
        <Logo />
        <ThemeSwitcher />
        <LanguageSwitcher />
      </nav>
    </header>
  );
};
