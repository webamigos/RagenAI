'use client';

import './[locale]/global.css';

import Error from 'next/error';

export default function GlobalError({ error }: { error: Error }) {
  return (
    <html>
      <body>
        {/* This is the default Next.js error component but it doesn't allow omitting the statusCode property yet. */}
        <Error statusCode={undefined as any} />
      </body>
    </html>
  );
}
