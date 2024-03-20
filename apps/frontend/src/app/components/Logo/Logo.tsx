import Link from 'next/link';
import Image from 'next/image';

export const Logo = () => {
  return (
    <div className="flex lg:flex-1 opacity-95">
      <Link href="/" className="-m-1.5 p-1.5 pl-0">
        <span className="sr-only">SalesYY</span>
        <Image
          width={120}
          height={80}
          className="h-8 w-auto"
          src="/assets/salesyy-white-logo-white-on-dark-bg.png"
          alt=""
        />
      </Link>
    </div>
  );
};
