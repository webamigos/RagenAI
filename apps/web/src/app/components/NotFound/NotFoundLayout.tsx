type Props = {
  title: string;
  description: string;
  backLabel: string;
  homePath: string;
};

export const NotFoundLayout = ({
  title,
  description,
  backLabel,
  homePath,
}: Props) => {
  return (
    <main className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-24 sm:py-32 lg:px-8">
      {/* Background grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(37,45,83,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(37,45,83,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: '#252d53' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-1/4 h-64 w-64 rounded-full opacity-15 blur-3xl"
        style={{ background: '#cb1d3d' }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* 404 display */}
        <div className="relative select-none">
          <span
            aria-hidden="true"
            className="block text-[10rem] font-black leading-none tracking-tighter sm:text-[14rem]"
            style={{
              WebkitTextStroke: '2px #252d53',
              color: 'transparent',
              opacity: 0.12,
            }}
          >
            404
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center text-[10rem] font-black leading-none tracking-tighter sm:text-[14rem]"
            style={{
              background: 'linear-gradient(135deg, #252d53 0%, #cb1d3d 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            404
          </span>
        </div>

        {/* Divider */}
        <div className="mt-2 flex items-center gap-3">
          <div className="h-px w-16 bg-brand-900/30 dark:bg-brand-900/50" />
          <div className="h-1.5 w-1.5 rounded-full bg-crimson-600" />
          <div className="h-px w-16 bg-brand-900/30 dark:bg-brand-900/50" />
        </div>

        {/* Heading */}
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-brand-900 dark:text-brand-400 sm:text-4xl">
          {title}
        </h1>

        {/* Description */}
        <p className="mt-4 max-w-sm text-base leading-7 text-brand-900/70 dark:text-paper-600">
          {description}
        </p>

        {/* CTA */}
        <div className="mt-10">
          <a
            href={homePath}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
            style={{
              background: 'linear-gradient(135deg, #252d53 0%, #cb1d3d 100%)',
            }}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {backLabel}
          </a>
        </div>
      </div>
    </main>
  );
};
