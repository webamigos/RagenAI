import { expect, test, type Page } from '@playwright/test';

import { ROUTES, TEST_ORG_NAME } from './constants';

/**
 * Authoring a platform guardrail, end to end through the form.
 *
 * Phase A ships no evaluator, so nothing here asserts that a rule *does*
 * anything — apps/web still moderates through `MODERATION_ENABLED` and reads
 * no guardrail row. What this covers is the half that exists: a rule an
 * operator creates is stored, listed, switched, edited, refused when it should
 * be, and removed.
 *
 * The unit tests for these actions mock Prisma and call them as functions.
 * That is what let `/guardrails` ship with a client bundle that threw on
 * hydration — every action test passed against a page nobody had loaded. This
 * suite loads it.
 */

const RULE_NAME = 'E2E throwaway rule';
const RENAMED = 'E2E throwaway rule (edited)';

/** The organization card for the rule under test. */
const orgCard = (page: Page) =>
  page.locator('div.rounded-lg.border', { hasText: RENAMED }).last();

/**
 * The action select, read back after a reload.
 *
 * A round trip is the point: a `<select>` holds whatever was chosen, stored or
 * not, so asserting its value without reloading would pass against a write
 * that never happened.
 */
const onHitAfterReload = async (page: Page) => {
  // Awaited. A floating `page.reload()` races the locator that follows it, and
  // the resulting flake looks like a slow server rather than like this.
  await page.reload();
  return orgCard(page).getByLabel(`On a hit for ${RENAMED}`, { exact: true });
};

const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The list row for a rule, by the name shown in its first cell. */
function ruleRow(page: Page, name: string) {
  return page.locator('tr', { hasText: name }).first();
}

async function openNewRuleForm(page: Page) {
  await page.goto(ROUTES.guardrails);
  await expect(
    page.locator('main').getByRole('heading', { name: 'Guardrails', level: 1 }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'New rule' }).click();
  await expect(
    page.getByRole('heading', { name: 'New platform rule' }),
  ).toBeVisible();
}

test.describe.serial('platform guardrails', () => {
  test('a new rule is created switched off', async ({ page }) => {
    await openNewRuleForm(page);

    await page.locator('#guardrail-name').fill(RULE_NAME);
    await page
      .locator('#guardrail-description')
      .fill('Created by the e2e suite.');
    await page.locator('#guardrail-pattern').fill('e2e-forbidden-phrase');
    await page.getByRole('button', { name: 'Create' }).click();

    // The toast says it, and the row proves it. A rule that begins by
    // blocking is a rule whose false-positive rate nobody has measured — that
    // default is the point, so it is asserted rather than assumed.
    await expect(page.getByText('Rule created, switched off')).toBeVisible();

    const row = ruleRow(page, RULE_NAME);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: 'Off' })).toBeVisible();
    await expect(row).toContainText('Records it, turn continues');
  });

  test('a rule can be switched on and back off', async ({ page }) => {
    await page.goto(ROUTES.guardrails);
    const row = ruleRow(page, RULE_NAME);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: 'Off' }).click();
    await expect(page.getByText('Rule switched on')).toBeVisible();
    await expect(row.getByRole('button', { name: 'On' })).toBeVisible({
      timeout: 20_000,
    });

    await row.getByRole('button', { name: 'On' }).click();
    await expect(page.getByText('Rule switched off')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Off' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('an edit is saved and shown', async ({ page }) => {
    await page.goto(ROUTES.guardrails);
    const row = ruleRow(page, RULE_NAME);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Edit' }).click();

    await expect(
      page.getByRole('heading', { name: 'Edit rule' }),
    ).toBeVisible();
    await page.locator('#guardrail-name').fill(RENAMED);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Rule saved')).toBeVisible();
    await expect(ruleRow(page, RENAMED)).toBeVisible({ timeout: 20_000 });
  });

  test('a pattern that backtracks is refused before it is stored', async ({
    page,
  }) => {
    await openNewRuleForm(page);

    await page.locator('#guardrail-name').fill('E2E catastrophic pattern');
    await page.locator('#guardrail-pattern').fill('(a+)+$');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create' }).click();

    // The save-time probe is the only place a catastrophic regex can be
    // stopped — once a turn has entered one it cannot be interrupted. The
    // refusal is asserted by its reason, not by a generic failure.
    await expect(page.getByText(/took longer than \d+ms/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(ruleRow(page, 'E2E catastrophic pattern')).toBeHidden();
  });

  test('a built-in detector cannot be deleted and its kind is fixed', async ({
    page,
  }) => {
    await page.goto(ROUTES.guardrails);
    const row = ruleRow(page, 'Content moderation');
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Deleting a built-in leaves the resolver with no row for a detector the
    // code still knows about, which reads as "this installation does not
    // moderate". The control is absent, not merely refused.
    await expect(row.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#guardrail-kind')).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('an organization override is stored and attributed', async ({
    page,
  }) => {
    await page.goto(ROUTES.guardrails);

    // The organization picker is `SearchableSelect`: a button that opens a
    // list, with the value carried in a hidden input. Not a native <select>,
    // so `selectOption` has nothing to act on.
    await page.getByRole('button', { name: /Select an organization/ }).click();
    await page
      .getByRole('button', { name: new RegExp(escapeForRegExp(TEST_ORG_NAME)) })
      .first()
      .click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: TEST_ORG_NAME }),
    ).toBeVisible({ timeout: 20_000 });

    // The per-organization rows are cards, not table rows.
    const card = orgCard(page);
    await expect(card).toBeVisible({ timeout: 20_000 });

    // **Addressed by label, not by tag.** A row carried one `<select>` until
    // an override could set the action as well as the state, and
    // `card.locator('select')` then matched two — a strict-mode violation that
    // no unit test could have seen, because it is a property of the rendered
    // row rather than of either control.
    const state = card.getByLabel(`State for ${RENAMED}`, { exact: true });
    const onHit = card.getByLabel(`On a hit for ${RENAMED}`, { exact: true });

    // Before: nothing decided it here, so the platform rule did.
    await expect(card).toContainText('from the platform rule');

    await state.selectOption('on');
    await expect(page.getByText('Override saved')).toBeVisible();

    // After: the page says which layer decided it, which is the whole reason
    // the resolver reports a source per field.
    await expect(card).toContainText('set for this organization', {
      timeout: 20_000,
    });

    // The action override, which is the one an organization actually asks for:
    // keep the platform's rule, but only log it for us. The resolver has
    // honoured it since Phase A and no control could set it until C4b, so this
    // is the assertion that would catch that regressing.
    //
    // **Checked after a reload, not from the toast.** A select shows what was
    // chosen whether or not anything stored it, and by this point several
    // saves have happened — the toasts stack, so `getByText('Override saved')`
    // matches more than one and asserts nothing useful either. The value
    // surviving a round trip is the only part that means the write landed.
    await onHit.selectOption('LOG');
    await expect(await onHitAfterReload(page)).toHaveValue('LOG', {
      timeout: 20_000,
    });

    // Put both back, so the delete below is not deleting a rule with an
    // override hanging off it for reasons unrelated to what is being tested.
    // The action first: the row is removed only when every field inherits, so
    // clearing the state while an action is still set leaves the row in place
    // — that is the behaviour C4b introduced, and it is why this order
    // matters rather than being incidental.
    await onHit.selectOption('inherit');
    await expect(await onHitAfterReload(page)).toHaveValue('inherit', {
      timeout: 20_000,
    });

    await orgCard(page)
      .getByLabel(`State for ${RENAMED}`, { exact: true })
      .selectOption('inherit');

    // Back to inheriting everything, which is the state with no row at all.
    await expect(orgCard(page)).toContainText('from the platform rule', {
      timeout: 20_000,
    });
  });

  test('the rule can be deleted again', async ({ page }) => {
    await page.goto(ROUTES.guardrails);
    const row = ruleRow(page, RENAMED);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Delete' }).click();

    await page
      .getByRole('button', { name: 'Delete', exact: true })
      .last()
      .click();
    await expect(page.getByText('Rule deleted')).toBeVisible();
    await expect(ruleRow(page, RENAMED)).toBeHidden({ timeout: 20_000 });
  });
});
