import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';

const createMockGuide = (overrides = {}) => ({
  documentId: 'guide-123',
  Title: 'Weekend in London',
  Description: 'A lovely weekend in London',
  Guide_Type: 'Itinerary',
  Visibility: 'Public',
  Estimated_Budget: 500,
  Budget_Type: 'Medium',
  is_Multicity: false,
  slug: 'weekend-in-london',
  Guide_Media: [],
  Place_Details: null,
  Number_Of_Days: 3,
  Category: 'Culture',
  Best_Time_To_Visit: [],
  Guide_Tags: [],
  Tips_Notes: '',
  Guide_Section_Details: null,
  guide_sections: [
    {
      documentId: 'section-456',
      Title: 'Day 1: Royal London',
      Sequence: 1,
      Description: 'Explore palaces and parks.',
      Timeline: [],
      Transport: [],
      Stay: [],
      Recommendation_Activity: [],
      Map_Details: null,
      Packing_List: [],
      Pre_Tasks: [],
      Section_tags: [],
      Budget: [],
      __typename: 'GuideSection'
    }
  ],
  account: {
    documentId: 'acc-123',
    __typename: 'Account'
  },
  is_pinned: false,
  pin_order: 0,
  display_order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  __typename: 'Guide',
  ...overrides
});

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);

  // Inject Google Maps Autocomplete Mock
  await context.addInitScript(() => {
    (window as any).google = {
      maps: {
        importLibrary: async () => ({
          Autocomplete: class {
            callback: () => void = () => {};
            constructor(inputElement: any) {
              inputElement._autocompleteMock = this;
            }
            addListener(event: string, callback: () => void) {
              this.callback = callback;
            }
            getPlace() {
              return {
                place_id: 'mock-london-id',
                name: 'London',
                formatted_address: 'London, UK',
                geometry: {
                  location: {
                    lat: () => 51.5074,
                    lng: () => -0.1278,
                  }
                },
                address_components: [
                  { long_name: 'London', short_name: 'London', types: ['locality'] },
                  { long_name: 'United Kingdom', short_name: 'UK', types: ['country'] }
                ]
              };
            }
          }
        }),
        event: {
          clearInstanceListeners: () => {},
          addListener: () => ({ remove: () => {} }),
        },
        places: {
          Autocomplete: class {
            callback: () => void = () => {};
            constructor(inputElement: any) {
              inputElement._autocompleteMock = this;
            }
            addListener(event: string, callback: () => void) {
              this.callback = callback;
            }
            getPlace() {
              return {
                place_id: 'mock-london-id',
                name: 'London',
                formatted_address: 'London, UK',
                geometry: {
                  location: {
                    lat: () => 51.5074,
                    lng: () => -0.1278,
                  }
                },
                address_components: [
                  { long_name: 'London', short_name: 'London', types: ['locality'] },
                  { long_name: 'United Kingdom', short_name: 'UK', types: ['country'] }
                ]
              };
            }
          }
        }
      }
    };
  });

  // Mock places details HTTP request
  await page.route('https://places.googleapis.com/v1/places/**', async route => {
    if (route.request().url().includes('/photos/mock-photo-ref/media')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from(
          'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          'base64',
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-london-id',
        primaryType: 'locality',
        primaryTypeDisplayName: { text: 'City' },
        rating: 4.9,
        photos: [{ name: 'places/mock-london-id/photos/mock-photo-ref' }],
      })
    });
  });
  await page.route('**/api/guides?**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 123, documentId: 'guide-123', Guide_Media: [] }],
      }),
    });
  });
  await page.route('**/api/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 456, url: 'https://cdn.example.test/guides/london.gif' },
      ]),
    });
  });
  await page.route('**/graphql', async route => {
    const payload = route.request().postDataJSON();
    const operationName =
      payload?.operationName ||
      payload?.query?.match(/(?:query|mutation)\s+(\w+)/i)?.[1] ||
      '';

    if (payload?.query?.includes('CheckOnboardingStatus') || payload?.query?.includes('GetUserAccount') || payload?.query?.toLowerCase().includes('userspermissionsuser')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              email: 'test@explorers.earth',
              username: 'testuser',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              accounts: [
                {
                  documentId: 'acc-123',
                  Account_Name: 'Test Account',
                  Account_Type: 'business',
                  mobile_number: '1234567890',
                  public_movie: 'No',
                  public_books: 'No',
                  public_games: 'No',
                  public_music: 'No',
                  public_apps: 'No',
                  public_products: 'No',
                  public_people: 'No',
                  public_guides: 'No',
                  public_recommendations: 'Yes',
                  profile_picture: null,
                  localtunes_integrated: false
                }
              ]
            }
          }
        })
      });
    } else if (operationName === 'CreateGuide') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createGuide: createMockGuide({ Visibility: false })
          }
        })
      });
    } else if (operationName === 'CreateGuideSection') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createGuideSection: createMockGuide().guide_sections[0]
          }
        })
      });
    } else if (operationName === 'GetGuideCategories') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            guideCategories: [
              { documentId: 'cat-1', Category_Name: 'Adventure' },
              { documentId: 'cat-2', Category_Name: 'Food & Drink' },
              { documentId: 'cat-3', Category_Name: 'Culture' },
              { documentId: 'cat-4', Category_Name: 'Sightseeing' },
              { documentId: 'cat-5', Category_Name: 'Nature' }
            ]
          }
        })
      });
    } else if (operationName === 'GetGuides') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            guides: [createMockGuide()]
          }
        })
      });
    } else if (operationName === 'GetGuideById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            guide: createMockGuide()
          }
        })
      });
    } else if (
      operationName === 'PublicCategoryListCounts' ||
      operationName === 'CheckPublishedLists'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recommendationLists: [],
            bookLists: [],
            movieLists: [],
            gameLists: [],
            appLists: [],
            productLists: [],
            personLists: [],
            guides: [createMockGuide()],
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} })
      });
    }
  });
});

test('Flow 9: Guides List and Timeline Section E2E', async ({ page }) => {
  const consoleIssues: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', message => {
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' && message.text().includes('go.apollo.dev'))
    ) {
      consoleIssues.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/guides');

  const addListBtn = page.locator('button:has-text("Create Guide")').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  // Create Guide Step 1
  await expect(page).toHaveURL(/\/guides\/new/);
  
  const typeSelect = page.locator('select:has-text("Select type")');
  await typeSelect.selectOption('Itinerary');

  const locInput = page.locator('input[placeholder*="Search for a location"]');
  await locInput.fill('London');

  // Wait for Google Autocomplete to attach
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder*="Search for a location"]') as any;
    return input && input._autocompleteMock !== undefined;
  });

  // Trigger autocomplete select
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="Search for a location"]') as any;
    if (input && input._autocompleteMock) {
      input._autocompleteMock.callback();
    }
  });

  const nextBtn = page.locator('button:has-text("Next")');
  await nextBtn.click();

  // Step 2 details: select standard option for days
  const daysOption = page.locator('button:has-text("3 Days")');
  await expect(daysOption).toBeVisible();
  await daysOption.click();

  // Select categories (minimum 4 required)
  const categoryInput = page.locator(
    'input[placeholder="Search and select categories..."], input[placeholder="Add more categories..."]'
  );
  await expect(categoryInput).toBeVisible();
  const categories = ['Adventure', 'Food & Drink', 'Culture', 'Sightseeing'];
  for (const cat of categories) {
    await categoryInput.fill(cat);
    const option = page.locator(`button:has-text("${cat}")`).first();
    await option.click();
  }

  // Select budget type
  const budgetInput = page.locator('input[placeholder*="Select budget type"]');
  await expect(budgetInput).toBeVisible();
  await budgetInput.click();
  const budgetOption = page.locator('button:has-text("Mid-Range")');
  await expect(budgetOption).toBeVisible();
  await budgetOption.click();

  const nextBtn2 = page.locator('button:has-text("Next")');
  await nextBtn2.click();

  // Step 3 details: enter title
  const titleInput = page.locator('input[placeholder*="Enter guide title"]');
  await expect(titleInput).toBeVisible();
  await titleInput.fill('Weekend in London');

  const submitBtn = page.locator('button:has-text("Create Guide")');
  await submitBtn.click();

  // Verify redirected to guide detail view
  await expect(page).toHaveURL(/\/guides\/guide-123/);

  // Creating the first guide offers to expose the Guides tab publicly. Keep the
  // account-private choice in this flow; visibility publishing is covered by
  // the dedicated category visibility tests.
  const keepPrivateButton = page.getByRole('button', { name: 'Keep Private' });
  await expect(keepPrivateButton).toBeVisible();
  await keepPrivateButton.click();
  await expect(keepPrivateButton).toBeHidden();

  // Click Add Day/Stop
  const addDayBtn = page.locator('button:has-text("Add Day/Stop")');
  await expect(addDayBtn).toBeVisible();
  await addDayBtn.click();

  // Redirected to section create page
  await expect(page).toHaveURL(/\/guides\/guide-123\/sections\/new/);
  expect(failedResponses).toEqual([]);
  expect(consoleIssues).toEqual([]);
});
