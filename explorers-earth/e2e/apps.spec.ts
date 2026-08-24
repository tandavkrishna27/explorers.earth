import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);
  let recommendationCreated = false;
  const account = {
    documentId: 'acc-123',
    username: 'testuser',
    Account_Name: 'Test Account',
    Account_Type: 'business',
    mobile_number: '1234567890',
    profile_picture: null,
    public_movie: 'No',
    public_books: 'No',
    public_games: 'No',
    public_music: 'No',
    public_apps: 'No',
    public_products: 'No',
    public_people: 'No',
    public_guides: 'No',
    public_recommendations: 'No',
  };
  const appList = (withRecommendations: boolean) => ({
    documentId: 'app-list-123',
    List_Name: 'Productivity Stack',
    list_description: null,
    slug: 'productivity-stack',
    Visibility: false,
    visibility: false,
    cover_image: null,
    top_apps_heading: null,
    display_order: 0,
    account,
    recommended_apps: withRecommendations ? [
      {
        documentId: 'app-rec-456',
        app_url: 'https://example.com/app',
        title: 'Mock App Name',
        description: 'App Bio',
        logo_url: 'https://example.com/logo.png',
        developer: 'Mock Dev',
        platforms: '["Web"]',
        price_tier: 'Free',
        download_url: 'https://example.com/download',
        user_recommendation_note: 'Great productivity app!',
        user_rating: 9,
        is_pinned: false,
        pin_order: null,
        display_order: 0,
        screenshots: '[]',
        app_category: null,
      },
    ] : [],
  });

  await page.route('**/graphql', async route => {
    const payload = route.request().postDataJSON();

    if (payload?.query?.includes('CheckOnboardingStatus') || payload?.query?.includes('MyAccount') || payload?.query?.includes('UsersPermissionsUser') || payload?.query?.includes('usersPermissionsUser')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              id: 'fixture-user',
              documentId: 'fixture-user',
              username: 'testuser',
              email: 'test@example.test',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              accounts: [account],
            }
          }
        })
      });
    } else if (payload?.query?.includes('createAppList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createAppList: appList(false),
          }
        })
      });
    } else if (payload?.query?.includes('createRecommendedApp')) {
      recommendationCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendedApp: {
              documentId: 'app-rec-456',
              title: 'Mock App Name',
              display_order: 0,
              is_pinned: false,
              pin_order: null,
            }
          }
        })
      });
    } else if (payload?.query?.includes('APP_LISTS_BY_ACCOUNT') || payload?.query?.includes('AppLists')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            appLists: [appList(false)],
          }
        })
      });
    } else if (payload?.query?.includes('APPS_BY_LIST') || payload?.query?.includes('AppsByList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            appLists: [appList(recommendationCreated)],
          }
        })
      });
    } else if (payload?.query?.includes('appCategories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { appCategories: [] } }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} })
      });
    }
  });

  // Mock Scraper Endpoint
  await page.route('**/api/apps/scrape-url', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Mock App Name',
        description: 'App Bio',
        developer: 'App Developer',
        price_tier: 'Free',
        platforms: ['Web'],
        screenshots: []
      })
    });
  });
});

test('Flow 6: Apps & Tools List and Scraper E2E', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/recommendations/apps');

  const addListBtn = page.locator('button:has-text("New List")').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  const nameInput = page.locator('input[name="List_Name"]');
  await nameInput.fill('Productivity Stack');

  const submitBtn = page.locator('button[type="submit"]:has-text("Create List")');
  await submitBtn.click();

  await page.goto('/recommendations/apps/app-list-123');

  const addAppBtn = page.locator('button:has-text("Add App")');
  await expect(addAppBtn).toBeVisible();
  await addAppBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/apps\/app-list-123\/add/);

  // Method selection step: click Add via URL
  const addViaUrlBtn = page.locator('button:has-text("Add via URL")');
  await expect(addViaUrlBtn).toBeVisible();
  await addViaUrlBtn.click();

  const urlInput = page.locator('input[placeholder*="figma.com"]');
  await urlInput.fill('https://figma.com');

  const fetchBtn = page.locator('button:has-text("Fetch")');
  await fetchBtn.click();

  const noteEditor = page.locator('.ql-editor');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill('Best collaborative design tool.');

  const saveBtn = page.locator('button:has-text("Add to List")');
  await saveBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/apps\/app-list-123/);
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Draft' }).click();
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeHidden();
  expect(consoleErrors).toEqual([]);
});
