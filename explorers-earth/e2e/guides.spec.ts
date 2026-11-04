import { test, expect } from '@playwright/test';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { createGuidesEditorFixture } from './setup/guides-editor-fixture';

// Flow 9 used to drive the Strapi-era guide wizard (/guides/new with type, location, budget and
// category steps, then "Add Day/Stop" on GuideDetailsPage) against GraphQL mocks. That wizard is
// gone: /guides/new now redirects to the "New guide" dialog and GuideDetailsPage is no longer
// routed, so a new guide opens in the trip editor. The same user intent - arrive from the legacy
// /guides entry, create a guide, then add a day to its timeline - now runs on the contained
// canonical session with the stateful Guides API fixture (canonical contract schemas).
test('Flow 9: Guides List and Timeline Section E2E', async ({ browser, baseURL }) => {
  const state = fixtureState();
  state.lists.guides = [];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const { page } = handle;
  const api = createGuidesEditorFixture();
  await api.install(page);
  const failedResponses: string[] = [];
  page.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto('/guides');
    await expect(page).toHaveURL(/\/recommendations\/guides$/);

    const newGuide = page.getByRole('button', { name: /New guide/ }).first();
    await expect(newGuide).toBeVisible();
    await newGuide.click();

    const dialog = page.getByRole('dialog', { name: 'New guide' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill('Weekend in London');
    await dialog.getByLabel('Days').fill('3');
    await dialog.getByRole('button', { name: 'Create guide' }).click();

    await expect.poll(() => api.guides.length).toBe(1);
    const guideId = api.guides[0].id;
    await expect(page).toHaveURL(new RegExp(`/recommendations/guides/${guideId}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Weekend in London' })).toBeVisible();
    const chips = page.getByRole('tablist', { name: 'Days' }).getByRole('tab');
    await expect(chips).toHaveText(['Day 1', 'Day 2', 'Day 3']);

    // Adding a timeline day is the editor's replacement for the old "Add Day/Stop" step.
    await page.getByRole('button', { name: '+ Add day' }).click();
    await expect(chips).toHaveText(['Day 1', 'Day 2', 'Day 3', 'Day 4']);
    await expect.poll(() => api.guides[0].sections.length).toBe(4);
    expect(failedResponses).toEqual([]);
  } finally {
    await closeFixture(handle);
  }
});

// WP9 Task 15. The trip editor end to end against a stateful in-memory Guides API
// (setup/guides-editor-fixture.ts) behind the contained canonical session and account routes.
test.describe('Trip editor (WP9)', () => {
  test('create, add, move, label, delete days, phone add and reload', async ({ browser, baseURL }) => {
    const state = fixtureState();
    const handle = await openFixture(browser, baseURL!, state, { owner: true });
    const { page } = handle;
    const api = createGuidesEditorFixture();
    await api.install(page);    const day = (n: number) => page.getByRole('region', { name: `Day ${n}`, exact: true });
    const chips = page.getByRole('tablist', { name: 'Days' }).getByRole('tab');
    const toast = (text: string) => page.locator('[data-sonner-toast]').filter({ hasText: text });
    const addNote = async (dayNumber: number, text: string) => {
      await page.getByRole('button', { name: `+ Add to Day ${dayNumber}`, exact: true }).click();
      const box = page.getByRole('combobox', { name: `Add to Day ${dayNumber}` });
      await expect(box).toBeFocused();
      await box.fill(text);
      await box.press('Enter');
      await expect(day(dayNumber).getByRole('listitem').filter({ hasText: text })).toBeVisible();
      await expect(box).toBeVisible();
      await expect(box).toHaveValue('');
      await box.press('Escape');
      await expect(box).toBeHidden();
    };
    try {
      // 1. New guide popup → editor with two days, starting as a draft.
      await page.goto('/recommendations/guides?new=1');
      const dialog = page.getByRole('dialog', { name: 'New guide' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Title').fill('E2E Goa');
      await dialog.getByLabel('Days').fill('2');
      await dialog.getByRole('button', { name: 'Create guide' }).click();
      await expect.poll(() => api.guides.length).toBe(1);
      const guideId = api.guides[0].id;
      await expect(page).toHaveURL(new RegExp(`/recommendations/guides/${guideId}$`));
      await expect(page.getByRole('heading', { level: 1, name: 'E2E Goa' })).toBeVisible();
      await expect(chips).toHaveText(['Day 1', 'Day 2']);
      await expect(page.getByRole('button', { name: /Draft/ }).first()).toBeVisible();

      // 2. The smart box adds a note and stays open for the next one; Esc closes it.
      await addNote(1, 'Ferry at 7');

      // 3. Move a second note to Day 2 from its menu, then Undo puts it back.
      await addNote(1, 'Beach sunset');
      await page.getByRole('button', { name: 'Actions for Beach sunset' }).click();
      await page.getByRole('menuitem', { name: 'Move to day…' }).click();
      await page.getByRole('menuitem', { name: 'Day 2', exact: true }).click();
      await expect(toast('Moved to Day 2')).toBeVisible();
      await expect(day(2).getByText('Beach sunset')).toBeVisible();
      await toast('Moved to Day 2').getByRole('button', { name: 'Undo' }).click();
      await expect(day(1).getByText('Beach sunset')).toBeVisible();
      await expect(day(2).getByText('Beach sunset')).toHaveCount(0);

      // 4. A time label groups the day under headings.
      const ferry = day(1).getByRole('listitem').filter({ hasText: 'Ferry at 7' });
      await ferry.getByRole('button', { name: '+ time' }).click();
      await page.getByRole('menuitemradio', { name: 'Morning' }).click();
      await expect(day(1).getByRole('heading', { level: 4, name: 'Morning' })).toBeVisible();
      await expect(day(1).getByRole('heading', { level: 4, name: 'Any time' })).toBeVisible();
      await expect(day(1).locator('h4, li span[title]')).toHaveText(['Morning', 'Ferry at 7', 'Any time', 'Beach sunset']);

      // 5. Drag the note onto the Day 2 chip.
      await page.dragAndDrop('li:has-text("Beach sunset")', '[role="tablist"][aria-label="Days"] >> role=tab[name="Day 2"]');
      await expect(day(2).getByText('Beach sunset')).toBeVisible();
      await expect(day(1).getByText('Beach sunset')).toHaveCount(0);

      // 6. Delete Day 2, Undo restores it with its item; with one day left Delete day is disabled.
      await page.getByRole('button', { name: 'Day 2 options' }).click();
      await page.getByRole('menuitem', { name: 'Delete day' }).click();
      await expect(chips).toHaveText(['Day 1']);
      await toast('Day deleted').getByRole('button', { name: 'Undo' }).click();
      await expect(chips).toHaveText(['Day 1', 'Day 2']);
      await expect(day(2).getByText('Beach sunset')).toBeVisible();
      await page.getByRole('button', { name: 'Day 2 options' }).click();
      await page.getByRole('menuitem', { name: 'Delete day' }).click();
      await expect(chips).toHaveText(['Day 1']);
      await page.getByRole('button', { name: 'Day 1 options' }).click();
      await expect(page.getByRole('menuitem', { name: 'Delete day' })).toBeDisabled();
      await page.getByRole('button', { name: 'Day 1 options' }).click();

      // 7. Phone width: the bottom button adds to the selected day.
      await page.setViewportSize({ width: 375, height: 812 });
      const bottom = page.getByTestId('bottom-add-bar').getByRole('button', { name: 'Add to Day 1', exact: true });
      await expect(bottom).toBeVisible();
      await bottom.click();
      const box = page.getByRole('combobox', { name: 'Add to Day 1' });
      await expect(box).toBeVisible();
      await box.press('Escape');

      // 8. A reload reads back the persisted order and labels.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.reload();
      await expect(chips).toHaveText(['Day 1']);
      await expect(day(1).locator('h4, li span[title]')).toHaveText(['Morning', 'Ferry at 7']);
      expect(api.guides[0].sections).toHaveLength(1);
      expect(api.guides[0].sections[0].blocks.items).toEqual([expect.objectContaining({ kind: 'note', text: 'Ferry at 7', timeLabel: 'morning' })]);
    } finally {
      await closeFixture(handle);
    }
  });
});
