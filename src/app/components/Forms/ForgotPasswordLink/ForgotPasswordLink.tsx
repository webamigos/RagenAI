import { Link } from '@/i18n/routing';

type Props = {
  label: string;
  className?: string;
};

export const ForgotPasswordLink = ({ label, className }: Props) => {
  return (
    <div className={`flex w-full justify-center ${className ?? 'mt-6'}`}>
      <Link
        href="/forgot-password"
        className="text-sm font-normal dark:text-indigo-400 text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        {label}
      </Link>
    </div>
  );
};
