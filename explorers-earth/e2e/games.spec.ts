import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);
  let recommendationCreated = false;

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
              accounts: [
                {
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
                  public_recommendations: 'No'
                }
              ]
            }
          }
        })
      });
    } else if (payload?.query?.includes('createGameList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createGameList: {
              documentId: 'game-list-123',
              List_Name: 'My Favorite Games',
              list_description: null,
              slug: 'my-favorite-games',
              Visibility: false,
              visibility: false,
              cover_image: null,
              top_games_heading: null,
              top_picks_heading: null,
              display_order: 0,
              account: { documentId: 'acc-123', username: 'testuser' },
            }
          }
        })
      });
    } else if (payload?.query?.includes('createRecommendedGame')) {
      recommendationCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendedGame: {
              documentId: 'game-rec-456',
              igdb_id: 125,
              title: 'Portal 2',
              display_order: 0,
              is_pinned: false,
              pin_order: null,
            }
          }
        })
      });
    } else if (payload?.query?.includes('GAME_LISTS_BY_ACCOUNT') || payload?.query?.includes('GameLists')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            gameLists: [
              {
                documentId: 'game-list-123',
                List_Name: 'My Favorite Games',
                list_description: null,
                slug: 'my-favorite-games',
                Visibility: false,
                visibility: false,
                cover_image: null,
                top_games_heading: null,
                top_picks_heading: null,
                display_order: 0,
                account: { documentId: 'acc-123', username: 'testuser' },
                recommended_games: []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('GAMES_BY_LIST') || payload?.query?.includes('GamesByList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            gameLists: [
              {
                documentId: 'game-list-123',
                List_Name: 'My Favorite Games',
                list_description: null,
                slug: 'my-favorite-games',
                Visibility: false,
                visibility: false,
                cover_image: null,
                top_games_heading: null,
                top_picks_heading: null,
                display_order: 0,
                account: { documentId: 'acc-123', username: 'testuser' },
                recommended_games: recommendationCreated ? [
                  {
                    documentId: 'game-rec-456',
                    igdb_id: 125,
                    igdb_slug: 'portal-2',
                    title: 'Portal 2',
                    cover_url: 'http://images.igdb.com/igdb/image/upload/t_cover_big/co1xft.jpg',
                    cover_url_large: null,
                    igdb_image_id: 'co1xft',
                    summary: 'Portal 2 is a first-person puzzle-platform video game.',
                    release_date: '2011-04-19',
                    release_year: 2011,
                    igdb_rating: 9.8,
                    igdb_rating_count: 5000,
                    genres: '["Puzzle", "Platformer"]',
                    platforms: '["PC", "Mac", "Linux", "Xbox 360", "PlayStation 3"]',
                    developer: 'Valve',
                    publisher: 'Valve',
                    game_modes: '["Single player", "Cooperative"]',
                    screenshot_ids: '[]',
                    igdb_url: 'https://www.igdb.com/games/portal-2',
                    user_recommendation_note: 'One of the best puzzle games ever made.',
                    user_rating: 10,
                    is_pinned: false,
                    pin_order: null,
                    display_order: 0,
                    media_details: '{}',
                    game_categories: [],
                    Media: []
                  }
                ] : []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('gameCategories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { gameCategories: [] } }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} })
      });
    }
  });

  await page.route('**/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ url: '/uploads/fixture-game-cover.jpg' }]),
    });
  });

  // Mock Twitch / IGDB Proxy token endpoint
  await page.route('**/twitch-api/oauth2/token', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-igdb-token',
        expires_in: 3600
      })
    });
  });

  // Mock Twitch / IGDB Proxy games search endpoint
  await page.route('**/igdb-api/v4/games', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 125,
          name: 'Portal 2',
          first_release_date: 1303171200,
          total_rating: 98,
          cover: { image_id: 'co1rab' },
          involved_companies: [
            { developer: true, company: { name: 'Valve' } }
          ]
        }
      ])
    });
  });
});

test('Flow 3: Games List and Recommendation creation E2E', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/recommendations/games');

  const addListBtn = page.locator('button:has-text("New List")').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  const nameInput = page.locator('input[name="List_Name"]');
  await nameInput.fill('My Favorite Games');

  const submitBtn = page.locator('button[type="submit"]:has-text("Create List")');
  await submitBtn.click();

  await page.goto('/recommendations/games/game-list-123');

  const addGameBtn = page.locator('button:has-text("Add Game")');
  await expect(addGameBtn).toBeVisible();
  await addGameBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/games\/game-list-123\/add/);

  const searchInput = page.locator('input[placeholder="Search for a game..."]');
  await searchInput.fill('Portal 2');

  const searchResult = page.locator('button:has-text("Portal 2")');
  await expect(searchResult).toBeVisible();
  await searchResult.click();

  const noteEditor = page.locator('.ql-editor');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill('Greatest puzzle co-op game ever.');

  const saveBtn = page.locator('button:has-text("Add to List")');
  await saveBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/games\/game-list-123/);
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Draft' }).click();
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeHidden();
  await expect(page.locator('text=Portal 2')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
