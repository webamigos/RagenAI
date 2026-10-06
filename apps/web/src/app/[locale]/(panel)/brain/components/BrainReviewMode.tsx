'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import type { KnowledgePageDetail } from '@/features/brain/contracts/brain.types';
import type { ReviewOptions } from '@/features/brain/contracts/brain-review.types';
import type { ReviewQueuePage } from '@/features/brain/contracts/brain-review-queue.types';
import type { BrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { withLanguage } from '@/features/brain/utils/with-language';
import { pageStatusVariant } from '@/features/brain/utils/page-status-variant';
import { Link, useRouter } from '@/i18n/routing';
import {
  approveKnowledgePageAction,
  approveAndPublishKnowledgePageAction,
  rejectKnowledgePageAction,
  setOwnerForDocumentCandidatesAction,
} from '../actions';
import { OwnerPicker } from './OwnerPicker';
import { ClaimAlignment } from './ClaimAlignment';
import { useReviewAction } from './useReviewAction';
import { BrainScreen } from './assistant/BrainAssistantContext';

export function BrainReviewMode({
  queue,
  page,
  members,
  candidateCounts,
  language,
  canWrite,
  warningsEnabled,
  progress,
}: {
  queue: ReviewQueuePage[];
  page: KnowledgePageDetail | null;
  members: ReviewOptions['members'];
  candidateCounts: Record<string, number>;
  language: BrainLanguage | null;
  canWrite: boolean;
  warningsEnabled: boolean;
  progress: { reviewed: number; total: number };
}) {
  const t = useTranslations('brain');
  const router = useRouter();
  const { pending: decisionPending, run } = useReviewAction();
  const [ownerPending, setOwnerPending] = useState(false);
  const pending = decisionPending || ownerPending;
  const [groupBy, setGroupBy] = useState<'document' | 'type'>('document');
  const [bulkOwnerPage, setBulkOwnerPage] = useState<string | null>(null);
  const bulkOwner = bulkOwnerPage !== null && bulkOwnerPage === page?.publicId;
  const [confirmReject, setConfirmReject] = useState(false);
  const [publicationFailure, setPublicationFailure] = useState<{
    pageId: string;
    message: string;
  } | null>(null);
  const publicationProblem =
    publicationFailure?.pageId === page?.publicId
      ? publicationFailure?.message
      : null;
  const [claimProgress, setClaimProgress] = useState({
    confirmed: 0,
    total: 0,
  });
  const title = useRef<HTMLHeadingElement>(null);
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; pages: ReviewQueuePage[] }
    >();
    for (const item of queue) {
      const document = item.documents[0];
      const key =
        groupBy === 'type' ? item.type : (document?.fileId ?? 'unknown');
      const label =
        groupBy === 'type'
          ? t(`page-type.${item.type}`)
          : (document?.fileName ?? t('page.sources.unknown-file'));
      const group = grouped.get(key) ?? { label, pages: [] };
      group.pages.push(item);
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [queue, groupBy, t]);
  const ordered = groups.flatMap((group) => group.pages);
  const index = ordered.findIndex((item) => item.publicId === page?.publicId);
  const document = queue.find((item) => item.publicId === page?.publicId)
    ?.documents[0];
  const candidateCount = document ? (candidateCounts[document.fileId] ?? 0) : 0;
  const ownerIsMember =
    page?.ownerId !== null &&
    members.some((member) => member.userId === page?.ownerId);
  const canDecide = canWrite && page?.status === 'CANDIDATE';
  const canApprove = canDecide && ownerIsMember;
  const canPublish = canApprove && (page?.principals.length ?? 0) > 0;
  const navigate = useCallback(
    (publicId?: string) => {
      router.push(
        withLanguage(
          publicId ? `/brain/review?page=${publicId}` : '/brain/review',
          language,
        ),
      );
    },
    [router, language],
  );
  const decision = useCallback(
    (kind: 'approve' | 'publish' | 'reject') => {
      if (
        !page ||
        pending ||
        !canDecide ||
        (kind !== 'reject' && !canApprove) ||
        (kind === 'publish' && !canPublish)
      ) {
        return;
      }
      const next =
        ordered[index + 1] ??
        ordered.find((item) => item.publicId !== page.publicId);
      const ref = {
        publicId: page.publicId,
        expectedUpdatedAt: page.updatedAt,
      };
      const action =
        kind === 'reject'
          ? rejectKnowledgePageAction
          : approveKnowledgePageAction;
      run(
        async () => {
          if (kind === 'publish') {
            const result = await approveAndPublishKnowledgePageAction(ref);
            if (!result.success) {
              if (result.approved) {
                setPublicationFailure({
                  pageId: page.publicId,
                  message: t('review-mode.publication-failed', {
                    reason: t(`review.errors.${result.error}`),
                  }),
                });
              }
              router.refresh();
            }
            return result;
          }
          return action(ref);
        },
        t(kind === 'reject' ? 'review.rejected' : 'review.approved'),
        { onSuccess: () => navigate(next?.publicId) },
      );
    },
    [
      page,
      pending,
      canDecide,
      canApprove,
      canPublish,
      ordered,
      index,
      run,
      t,
      navigate,
      router,
    ],
  );
  useEffect(() => {
    title.current?.focus();
  }, [page?.publicId]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        pending ||
        confirmReject
      ) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="combobox"],[role="textbox"],[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]',
        )
      ) {
        return;
      }
      if (documentForShortcuts()) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'j' && ordered[index + 1]) {
        event.preventDefault();
        navigate(ordered[index + 1]!.publicId);
      }
      if (key === 'k' && index > 0) {
        event.preventDefault();
        navigate(ordered[index - 1]!.publicId);
      }
      if (key === 'a' && canPublish) {
        event.preventDefault();
        decision('publish');
      }
      if (key === 'r' && canDecide) {
        event.preventDefault();
        setConfirmReject(true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [
    ordered,
    index,
    pending,
    confirmReject,
    navigate,
    canApprove,
    canPublish,
    canDecide,
    decision,
  ]);
  return (
    <section
      className="space-y-4"
      data-testid="brain-review-mode"
      aria-busy={pending}
    >
      <BrainScreen
        context={
          page
            ? { view: 'page', pageId: page.publicId }
            : { view: 'pages', status: 'CANDIDATE' }
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={withLanguage('/brain/overview', language)}
            className="inline-flex min-h-8 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ← {t('title')}
          </Link>
          <h2 className="font-display text-xl font-semibold">
            {t('review-mode.title')}
          </h2>
          <span className="text-sm text-muted-foreground">
            {t('review-mode.progress', progress)}
          </span>
          <Progress
            className="w-32 [&_[data-slot=progress-indicator]]:bg-ready"
            value={
              progress.total ? (100 * progress.reviewed) / progress.total : 0
            }
            aria-label={t('review-mode.title')}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            canWrite
              ? 'review-mode.shortcuts'
              : 'review-mode.navigation-shortcuts',
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[220px_minmax(0,1fr)_280px] xl:grid-cols-[180px_minmax(0,1fr)_240px]">
        <Card className="min-w-0">
          <CardHeader className="min-w-0">
            <CardTitle role="heading" aria-level={3} className="text-sm">
              {t('review-mode.queue', { count: queue.length })}
            </CardTitle>
            <Select
              value={groupBy}
              onValueChange={(value) =>
                setGroupBy(value === 'type' ? 'type' : 'document')
              }
            >
              <SelectTrigger
                className="w-full min-w-0"
                aria-label={t('review-mode.grouping')}
              >
                <SelectValue className="min-w-0 overflow-hidden text-ellipsis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="document">
                  {t('review-mode.by-document')}
                </SelectItem>
                <SelectItem value="type">{t('review-mode.by-type')}</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="max-h-[480px] space-y-4 overflow-y-auto xl:max-h-[70vh]">
            {groups.map((group, i) => (
              <div key={i} className="space-y-2">
                <h4 className="break-words text-xs text-muted-foreground">
                  {group.label} · {group.pages.length}
                </h4>
                <ul className="space-y-1">
                  {group.pages.map((item) => (
                    <li key={item.publicId}>
                      <Link
                        href={withLanguage(
                          `/brain/review?page=${item.publicId}`,
                          language,
                        )}
                        aria-current={
                          item.publicId === page?.publicId ? 'page' : undefined
                        }
                        data-testid="review-queue-page"
                        className={
                          item.publicId === page?.publicId
                            ? 'block min-h-8 rounded-md bg-accent px-2 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                            : 'block min-h-8 rounded-md px-2 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                        }
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {queue.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('review-mode.queue-empty')}
              </p>
            )}
          </CardContent>
        </Card>
        {page ? (
          <>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  tabIndex={-1}
                  ref={title}
                  data-testid="review-page-title"
                  className="break-words font-display text-3xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {page.title}
                </h3>
                <Badge variant={pageStatusVariant(page.status)}>
                  {t(`page-status.${page.status}`)}
                </Badge>
                <Badge variant="outline">{t(`page-type.${page.type}`)}</Badge>
              </div>
              <ClaimAlignment
                key={page.publicId}
                page={page}
                warningsEnabled={warningsEnabled}
                canWrite={canWrite}
                onProgress={setClaimProgress}
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={3} className="text-sm">
                  {t('review-mode.owner-step')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('review-mode.owner-question')}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {canDecide ? (
                  <>
                    <OwnerPicker
                      key={`${page.publicId}-${page.updatedAt}`}
                      publicId={page.publicId}
                      updatedAt={page.updatedAt}
                      ownerId={page.ownerId}
                      members={members}
                      disabled={decisionPending}
                      onPendingChange={setOwnerPending}
                      saveAction={
                        bulkOwner && document
                          ? (ownerId) =>
                              setOwnerForDocumentCandidatesAction({
                                fileId: document.fileId,
                                ownerId,
                              })
                          : undefined
                      }
                      saveLabel={
                        bulkOwner
                          ? t('review-mode.save-document-owner')
                          : undefined
                      }
                    />
                    {document && candidateCount > 0 && (
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          aria-label={t('review-mode.bulk-owner', {
                            count: candidateCount,
                          })}
                          checked={bulkOwner}
                          onCheckedChange={(checked) =>
                            setBulkOwnerPage(
                              checked === true ? page.publicId : null,
                            )
                          }
                          disabled={pending}
                        />
                        <span>
                          {t('review-mode.bulk-owner', {
                            count: candidateCount,
                          })}
                        </span>
                      </label>
                    )}
                  </>
                ) : (
                  <p className="text-sm">
                    {page.ownerName ?? t('pages.no-owner')}
                  </p>
                )}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {t('review-mode.claims-step')}
                  </h4>
                  <Progress
                    value={
                      claimProgress.total
                        ? (100 * claimProgress.confirmed) / claimProgress.total
                        : 0
                    }
                    aria-label={t('review-mode.claims-step')}
                    className="[&_[data-slot=progress-indicator]]:bg-ready"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('review-mode.claim-progress', { ...claimProgress })}
                  </p>
                </div>
                {publicationProblem && (
                  <p
                    role="alert"
                    className="rounded-md border border-pending bg-pending-tint p-3 text-sm"
                  >
                    {publicationProblem}
                  </p>
                )}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {t('review-mode.decision-step')}
                  </h4>
                  {canDecide ? (
                    <>
                      <Button
                        className="w-full whitespace-normal"
                        disabled={pending || !canPublish}
                        onClick={() => decision('publish')}
                      >
                        {t('review-mode.approve-publish')}
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={pending || !canApprove}
                        onClick={() => decision('approve')}
                      >
                        {t('review-mode.approve-only')}
                      </Button>
                      <Button
                        className="w-full border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setConfirmReject(true)}
                      >
                        {t('review-mode.reject')}
                      </Button>
                      {!ownerIsMember && (
                        <p className="text-sm text-muted-foreground">
                          {t('review-mode.needs-owner')}
                        </p>
                      )}
                      {ownerIsMember && !canPublish && (
                        <p className="text-sm text-muted-foreground">
                          {t('review-mode.needs-access')}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('review-mode.not-candidate')}
                    </p>
                  )}
                </div>
                <div className="space-y-2 border-t border-border pt-3 text-sm">
                  <p>
                    {t('review-mode.relations', { count: page.edges.length })} ·{' '}
                    <Link
                      href={withLanguage(
                        `/brain/graph?focus=${page.publicId}`,
                        language,
                      )}
                      className="inline-flex min-h-8 items-center text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t('review-mode.show-graph')}
                    </Link>
                  </p>
                  <Link
                    href={withLanguage(
                      `/brain/pages/${page.publicId}`,
                      language,
                    )}
                    className="block min-h-8 text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t('review-mode.open-page')}
                  </Link>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={pending || index <= 0}
                    onClick={() => navigate(ordered[index - 1]?.publicId)}
                  >
                    {t('review-mode.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending || !ordered[index + 1]}
                    onClick={() => navigate(ordered[index + 1]?.publicId)}
                  >
                    {t('review-mode.next')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-4 xl:col-span-2">
            <h3 className="font-display text-xl font-semibold">
              {t('review-mode.empty-title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('review-mode.empty-description')}
            </p>
            <Button asChild variant="outline">
              <Link href={withLanguage('/brain/overview', language)}>
                {t('review-mode.back')}
              </Link>
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title={t('review.reject-confirm-title')}
        description={t('review.reject-confirm-description')}
        confirmLabel={t('review-mode.reject')}
        destructive
        onConfirm={() => decision('reject')}
      />
    </section>
  );
}
function documentForShortcuts(): boolean {
  return (
    document.querySelector(
      '[role="alertdialog"], [role="dialog"], [role="listbox"][data-state="open"]',
    ) !== null
  );
}
