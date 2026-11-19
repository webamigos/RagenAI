'use client';

import { useState } from 'react';
import {
  INSTANCE_PALETTES,
  INSTANCE_PALETTE_OPTIONS,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  PRODUCT_NAME_MAX_LENGTH,
  type InstancePalette,
} from '@ragenai/platform-contracts';

import { saveInstanceBrandingAction } from './actions';

type Props = {
  productName: string | null;
  palette: InstancePalette;
  hasLogo: boolean;
  /** The stored logo as a `data:` URL, or null when it could not be fetched. */
  logoPreview: string | null;
};

const ACCEPT = Object.values(LOGO_CONTENT_TYPES).join(',');

export function BrandingForm({
  productName,
  palette,
  hasLogo,
  logoPreview,
}: Props) {
  const [selected, setSelected] = useState<InstancePalette>(palette);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // An unchecked checkbox sends nothing; the action reads 'true' or not.
    form.set('removeLogo', form.get('removeLogo') === 'on' ? 'true' : 'false');
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      const outcome = await saveInstanceBrandingAction(form);
      if (outcome.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(outcome.reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <label htmlFor="productName" className="text-sm font-medium">
          Product name
        </label>
        <input
          id="productName"
          name="productName"
          defaultValue={productName ?? ''}
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          placeholder="Ragen AI"
          className="block w-80 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown in the sidebar when there is no logo, in page titles and in
          emails. Leave empty for Ragen AI.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Colour palette</legend>
        <div className="flex flex-wrap gap-3">
          {INSTANCE_PALETTES.map((id) => (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary"
            >
              <input
                type="radio"
                name="palette"
                value={id}
                checked={selected === id}
                onChange={() => setSelected(id)}
              />
              <span
                aria-hidden
                className="inline-block h-4 w-4 rounded-full"
                style={{ backgroundColor: INSTANCE_PALETTE_OPTIONS[id].swatch }}
              />
              {INSTANCE_PALETTE_OPTIONS[id].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Replaces the panel&apos;s primary colour in light and dark mode. Every
          palette is checked for readable contrast; red, green and amber are not
          offered because the panel uses them for deleting and for document
          status.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="logo" className="text-sm font-medium">
          Logo
        </label>
        {hasLogo && (
          <div className="flex items-center gap-4">
            {logoPreview ? (
              // A data: URL fetched on the server; next/image would add nothing.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview}
                alt="Current logo"
                className="h-12 max-w-60 rounded border border-border bg-white object-contain p-1"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                A logo is uploaded (preview unavailable).
              </span>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeLogo" />
              Remove the current logo
            </label>
          </div>
        )}
        <input
          id="logo"
          name="logo"
          type="file"
          accept={ACCEPT}
          className="block text-sm"
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP or SVG, up to {LOGO_MAX_BYTES / 1024} KB. One file is
          used in light and dark mode, so pick one that reads on both. PNG is
          the safest choice for emails, where many clients do not show SVG. An
          SVG must be a plain drawing: no scripts, links or embedded images, and
          text converted to outlines so it looks the same everywhere.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save branding'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
