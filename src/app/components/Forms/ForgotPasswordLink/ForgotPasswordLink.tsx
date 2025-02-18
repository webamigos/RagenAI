import Link from 'next/link';

type Props = {
  label: string;
};

export const ForgotPasswordLink = ({ label }: Props) => {
  return (
    <div className="flex w-full mt-8 justify-center">
      <Link
        href="/forgot-password"
        className="font-normal text-indigo-600 hover:text-indigo-500"
      >
        {label}
      </Link>
    </div>
  );
};
