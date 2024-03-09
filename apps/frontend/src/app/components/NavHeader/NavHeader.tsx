import { LanguageSwitcher } from '../LanguageSwitcher';
import { Logo } from '../Logo';
import { ThemeSwitcher } from '../Theme';

export const NavHeader = () => {
  return (
    <header className="absolute inset-x-0 top-0 z-50 bg-black">
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
