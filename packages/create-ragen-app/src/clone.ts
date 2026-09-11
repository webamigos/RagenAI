import { downloadTemplate } from 'giget';

/**
 * Kept as one constant so the org/repo path is a one-line change if the
 * public location differs from this by launch time — see the create-ragen-app
 * plan's non-goals.
 */
export const RAGEN_APP_REPO = 'webamigos/RagenAI';

export async function cloneRagenApp(
  targetDir: string,
  ref: string,
): Promise<void> {
  await downloadTemplate(`github:${RAGEN_APP_REPO}#${ref}`, {
    dir: targetDir,
    forceClean: false,
    install: false,
  });
}
