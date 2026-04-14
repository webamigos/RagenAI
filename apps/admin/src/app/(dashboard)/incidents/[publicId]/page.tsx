import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ResolveButton } from './ResolveButton';
import { resolveIncidentAction } from './actions';

export const dynamic = 'force-dynamic';

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-semibold',
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const event = await prisma.securityEvent.findUnique({
    where: { publicId },
    include: {
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!event) {
    notFound();
  }

  // "Similar events" sidebar: last 10 events with the same (eventType,
  // actor) — where actor is userId if present, otherwise organizationId.
  // If neither is present (truly anonymous pre-auth event) we skip the
  // query entirely rather than returning system-wide matches, which
  // would be misleading.
  let actorFilter: { userId: string } | { organizationId: string } | null =
    null;
  if (event.userId) {
    actorFilter = { userId: event.userId };
  } else if (event.organizationId) {
    actorFilter = { organizationId: event.organizationId };
  }

  const similar = actorFilter
    ? await prisma.securityEvent.findMany({
        where: {
          eventType: event.eventType,
          id: { not: event.id },
          ...actorFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          publicId: true,
          severity: true,
          createdAt: true,
          resolvedAt: true,
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                SEVERITY_STYLE[event.severity] ?? SEVERITY_STYLE.info
              }`}
            >
              {event.severity.toUpperCase()}
            </span>
            <h1 className="text-3xl font-bold font-mono">{event.eventType}</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{event.publicId}</p>
        </div>
        {!event.resolvedAt && (
          <form action={resolveIncidentAction}>
            <input type="hidden" name="publicId" value={event.publicId} />
            <ResolveButton />
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="rounded-lg border border-border p-6">
            <h2 className="mb-4 text-base font-semibold">Details</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Source</dt>
                <dd className="font-mono text-xs">{event.source}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Occurred at</dt>
                <dd>
                  {new Date(event.createdAt).toLocaleString()}{' '}
                  <span className="text-muted-foreground">
                    (
                    {formatDistanceToNow(new Date(event.createdAt), {
                      addSuffix: true,
                    })}
                    )
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Organization</dt>
                <dd>
                  {event.organization ? (
                    <a
                      href={`/organizations/${event.organization.id}`}
                      className="text-primary hover:underline"
                    >
                      {event.organization.name}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      — (pre-auth event)
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">User</dt>
                <dd className="font-mono text-xs">
                  {event.user?.email ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">IP address</dt>
                <dd className="font-mono text-xs">{event.ipAddress ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">User agent</dt>
                <dd className="font-mono text-xs break-all">
                  {event.userAgent ?? '—'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Request ID</dt>
                <dd className="font-mono text-xs">{event.requestId ?? '—'}</dd>
              </div>
              {event.resolvedAt && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Resolved by</dt>
                  <dd>
                    {event.resolvedBy} ·{' '}
                    {new Date(event.resolvedAt).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Metadata</h3>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-border p-6">
            <h2 className="mb-3 text-sm font-semibold">
              Similar events ({similar.length})
            </h2>
            {similar.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No prior events of this type for the same actor.
              </p>
            ) : (
              <ul className="space-y-2">
                {similar.map((s) => (
                  <li key={s.publicId} className="text-xs">
                    <a
                      href={`/incidents/${s.publicId}`}
                      className="flex items-center justify-between hover:underline"
                    >
                      <span>
                        {formatDistanceToNow(new Date(s.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                          SEVERITY_STYLE[s.severity] ?? SEVERITY_STYLE.info
                        }`}
                      >
                        {s.severity}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
