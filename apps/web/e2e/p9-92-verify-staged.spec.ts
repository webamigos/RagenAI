// @ts-nocheck
import { expect, test } from '@playwright/test';
import pg from 'pg';
const SHOTS =
  '/private/tmp/claude-501/-Users-patryk-Workspace-webamigos-ragen-ragen-app/d12702e7-4a90-472f-b718-f3aa03f3a0ba/scratchpad/shots';
const ORG = 'e2e-test-org-00000-0000-0001';
test.setTimeout(6 * 60_000);
async function points(fileId) {
  const r = await fetch(
    'http://localhost:6333/collections/' + ORG + '/points/scroll',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'metadata.file_id', match: { value: fileId } }],
        },
        limit: 50,
      }),
    },
  );
  return (await r.json()).result?.points ?? [];
}
test('a document uploaded into Brain is stored but not indexed until sent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pl/brain/documents');
  await page
    .getByTestId('brain-upload-input')
    .setInputFiles('/tmp/claude-501/parking-policy.txt');
  await expect(page.getByText(/Wgrano do Brain/)).toBeVisible({
    timeout: 30000,
  });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  let file;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    file = (
      await c.query(
        "select id, embedding_status, parsing_status, metadata from user_files where file_name = 'parking-policy.txt'",
      )
    ).rows[0];
    if (
      file &&
      (file.embedding_status === 'STAGED' || file.embedding_status === 'FAILED')
    )
      break;
  }
  console.log(
    'after upload:',
    file?.embedding_status,
    file?.parsing_status,
    JSON.stringify(file?.metadata),
  );
  console.log('points while staged:', (await points(file.id)).length);
  const doc = (
    await c.query(
      'select count(*)::int as n from user_documents where file_id = $1',
      [file.id],
    )
  ).rows[0].n;
  console.log('document rows (parsed text stored):', doc);
  await page.reload();
  const row = page
    .getByTestId('brain-document-row')
    .filter({ hasText: 'parking-policy.txt' });
  console.log('brain row:', (await row.textContent()).replace(/\s+/g, ' '));
  console.log(
    'summary:',
    await page
      .getByTestId('brain-staged-summary')
      .textContent()
      .catch(() => 'none'),
  );
  await page.screenshot({ path: SHOTS + '/40-staged.png', fullPage: true });
  await page.goto('/pl/knowledge');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOTS + '/41-kb-staged.png', fullPage: true });
  console.log(
    'kb staged label:',
    await page.getByText('W Brain — poza wyszukiwaniem').count(),
  );
  await page.goto('/pl/brain/documents');
  await row.getByRole('button', { name: 'Wyślij do bazy wiedzy' }).click();
  await expect(page.getByText('Wysłano do bazy wiedzy')).toBeVisible({
    timeout: 15000,
  });
  let status;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    status = (
      await c.query('select embedding_status from user_files where id = $1', [
        file.id,
      ])
    ).rows[0].embedding_status;
    if (status === 'COMPLETED' || status === 'FAILED') break;
  }
  console.log('after send:', status, 'points:', (await points(file.id)).length);
  await c.end();
});
