import { UserButton } from '@clerk/nextjs';

export const UserButtonClerk = () => {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'h-9 w-9 border border-primary-blue-400 shadow-none',
          userButtonAvatarBox: 'shadow-none',
          userButtonTrigger: 'shoadow-none',
          userButtonPopoverFooter: 'hidden',
          userButtonPopoverActionButton__manageAccount: 'hidden',
        },
      }}
    />
  );
};
