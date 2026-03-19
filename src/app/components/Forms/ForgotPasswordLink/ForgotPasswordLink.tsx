import { Link } from '@/i18n/routing';

type Props = {
  label: string;
};

export const ForgotPasswordLink = ({ label }: Props) => {
  return (
    <div className="flex w-full mt-8 justify-center">
      <Link
        href="/forgot-password"
        className="font-normal dark:text-indigo-400 text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        {label}
      </Link>
    </div>
  );
};
