import { createEmbedScript } from '@/app/[locale]/public/embed';
import { logger } from '@/app/lib/utils/logger';

const CONFIG = {
  allowedOrigins: ['http://localhost:4321'] as string[], // TODO: in future it should be fetched from the organization settings
  defaults: {
    title: 'Chatbot',
    message: 'Hello, how can I help you today?',
  },
  protocol: process.env.NODE_ENV === 'production' ? 'https' : 'http',
} as const;

const validateHeaders = (request: Request) => {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const originDomain = origin ? new URL(origin).hostname : null;
  const refererDomain = referer ? new URL(referer).hostname : null;

  const isAllowedDomain = CONFIG.allowedOrigins.some((allowed) => {
    const allowedDomain = new URL(allowed).hostname;
    return [originDomain, refererDomain].some(
      (domain) =>
        domain === allowedDomain || domain?.endsWith(`.${allowedDomain}`)
    );
  });

  if (!host) {
    throw new Error('No host header');
  }

  if (!isAllowedDomain) {
    throw new Error('Unknown origin, please contact us');
  }

  return { host, origin };
};

export async function GET(
  request: Request,
  { params }: { params: { organizationId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const { host, origin } = validateHeaders(request);

    const title = searchParams.get('title') || CONFIG.defaults.title;
    const message = searchParams.get('message') || CONFIG.defaults.message;
    const appOrigin = `${CONFIG.protocol}://${host}`;

    const script = createEmbedScript(
      params.organizationId,
      { title, message },
      appOrigin
    );

    return new Response(script, {
      headers: {
        'Content-Type': 'text/javascript',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in embed route');
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      {
        status: 500,
      }
    );
  }
}
