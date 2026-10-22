import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FEATURE_SOURCE_LABELS } from '@ragenai/platform-contracts';

import { getAdminUser } from '@/lib/auth-guard';

import { BrandingForm } from './BrandingForm';
import { getInstanceBrandingAction } from './actions';
import { fetchLogoPreview } from './web-branding';

export const dynamic = 'force-dynamic';

/**
 * The install's product name, logo and palette (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B2).
 *
 * Here and not in apps/web's organization settings because it belongs to the
 * whole install, not to one organization (ADR-35, and the spec's D2).
 */
export default async function BrandingPage() {
  const admin = await getAdminUser();
  if (!admin) {
    redirect('/login');
  }

  const [state, logoPreview] = await Promise.all([
    getInstanceBrandingAction(),
    fetchLogoPreview(admin.id),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Branding</h1>

      <div
        className="rounded-xl border border-border bg-card p-4 text-sm"
        data-testid="branding-feature-status"
      >
        {state.enabled ? (
          <p>
            <strong>Instance branding is on</strong> (
            {FEATURE_SOURCE_LABELS[state.enabledSource]}). What you save here is
            shown to every user, on the sign-in pages and in emails.
          </p>
        ) : (
          <p>
            <strong>Instance branding is off</strong> (
            {FEATURE_SOURCE_LABELS[state.enabledSource]}), so the panel shows
            the Ragen branding and ignores what is saved here. Switch on{' '}
            <em>Instance branding</em> in the platform defaults on{' '}
            <Link href="/features" className="underline">
              Features
            </Link>{' '}
            to show it. Switching it off again is the way back.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <BrandingForm
          productName={state.productName}
          palette={state.palette}
          hasLogo={state.hasLogo}
          logoPreview={logoPreview}
        />
      </div>
    </div>
  );
}
