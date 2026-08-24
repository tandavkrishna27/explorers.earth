import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);
  let recommendationCreated = false;
  const account = {
    documentId: 'acc-789',
    username: 'testuser',
    Account_Name: 'Test Account',
    Account_Type: 'business',
    mobile_number: '1234567890',
    profile_picture: null,
    public_movie: 'No',
    public_recommendations: 'No',
    public_books: 'No',
    public_games: 'No',
    public_music: 'No',
  };

  // Intercept GraphQL queries
  await page.route('**/graphql', async route => {
    const payload = route.request().postDataJSON();
    
    if (payload?.query?.includes('CheckOnboardingStatus') || payload?.query?.includes('MyAccountForMovies') || payload?.query?.includes('UsersPermissionsUser') || payload?.query?.includes('usersPermissionsUser')) {
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
    } else if (payload?.query?.includes('createMovieList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createMovieList: {
              documentId: 'movie-list-123',
              List_Name: 'My Favorite Sci-Fi',
              list_description: null,
              slug: 'my-favorite-sci-fi',
              Visibility: false,
              cover_image: null,
              top_picks_heading: null,
              display_order: 0,
              account: { documentId: account.documentId, username: account.username },
            }
          }
        })
      });
    } else if (payload?.query?.includes('createRecommendedMovie')) {
      recommendationCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendedMovie: {
              documentId: 'movie-rec-456',
              tmdb_id: '157336',
              media_type: 'movie',
              title: 'Interstellar',
              display_order: 0,
              is_pinned: false,
            }
          }
        })
      });
    } else if (payload?.query?.includes('MOVIE_LISTS_BY_ACCOUNT') || payload?.query?.includes('MovieLists')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            movieLists: [
              {
                documentId: 'movie-list-123',
                List_Name: 'My Favorite Sci-Fi',
                list_description: null,
                slug: 'my-favorite-sci-fi',
                Visibility: false,
                cover_image: null,
                top_picks_heading: null,
                display_order: 0,
                account: { documentId: account.documentId, username: account.username },
                recommended_movies: []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('MOVIES_BY_LIST') || payload?.query?.includes('MoviesByList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            movieLists: [
              {
                documentId: 'movie-list-123',
                List_Name: 'My Favorite Sci-Fi',
                list_description: null,
                slug: 'my-favorite-sci-fi',
                Visibility: false,
                cover_image: null,
                top_picks_heading: null,
                display_order: 0,
                account: { documentId: account.documentId, username: account.username },
                recommended_movies: recommendationCreated ? [
                  {
                    documentId: 'movie-rec-456',
                    tmdb_id: '157336',
                    media_type: 'movie',
                    title: 'Interstellar',
                    original_title: 'Interstellar',
                    poster_path: null,
                    backdrop_path: null,
                    year: '2014',
                    genres: '[]',
                    director: 'Christopher Nolan',
                    runtime: 169,
                    tmdb_rating: 8.6,
                    overview: 'Interstellar overview',
                    season_count: null,
                    user_recommendation_note: 'Great movie!',
                    user_rating: 5,
                    watch_providers: '[]',
                    is_pinned: false,
                    pin_order: null,
                    display_order: 0,
                    cast_details: '{}',
                    media_details: '{}',
                    movie_categories: [],
                    Media: []
                  }
                ] : []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('movieCategories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { movieCategories: [] } }),
      });
    } else {
      // Default empty query mock fallback
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
      body: JSON.stringify([{ url: '/uploads/fixture-movie-cover.jpg' }]),
    });
  });

  // Mock TMDB API call
  await page.route('https://api.themoviedb.org/3/search/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            id: 157336,
            title: 'Interstellar',
            release_date: '2014-11-05',
            poster_path: '/gEU2QvHOm5geW8jNWzWQ5Ok43tD.jpg',
            vote_average: 8.6,
            media_type: 'movie',
          }
        ]
      })
    });
  });

  // Mock TMDB detail details fallback
  await page.route('https://api.themoviedb.org/3/movie/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 157336,
        title: 'Interstellar',
        runtime: 169,
        genres: [{ id: 18, name: 'Drama' }],
        credits: { cast: [] }
      })
    });
  });
});

test('Flow 1: Movies List and Recommendation creation E2E', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  // Phase 1: Navigate and Create List
  await page.goto('/recommendations/movies');
  
  const addListBtn = page.locator('button:has-text("New List")').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  const nameInput = page.locator('input[name="List_Name"]');
  await nameInput.fill('My Favorite Sci-Fi');

  const submitBtn = page.locator('button[type="submit"]:has-text("Create List")');
  await submitBtn.click();

  // Phase 2: Add Recommendation
  const listCard = page.locator('h3:has-text("My Favorite Sci-Fi")');
  await page.goto('/recommendations/movies/movie-list-123');

  const addMovieBtn = page.locator('button:has-text("Add Movie or Show")');
  await expect(addMovieBtn).toBeVisible();
  await addMovieBtn.click();

  // Redirected to add page
  await expect(page).toHaveURL(/\/recommendations\/movies\/movie-list-123\/add/);

  const searchInput = page.locator('input[placeholder*="Search \\"Interstellar\\""]');
  await searchInput.fill('Interstellar');

  const searchResult = page.locator('button:has-text("Interstellar")');
  await expect(searchResult).toBeVisible();
  await searchResult.click();

  // Confirm details form loaded
  const noteEditor = page.locator('.ql-editor');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill('Masterpiece by Nolan.');

  const saveBtn = page.locator('button:has-text("Add to List")');
  await saveBtn.click();

  // Redirected back to detail page and item listed
  await expect(page).toHaveURL(/\/recommendations\/movies\/movie-list-123/);
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Draft' }).click();
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeHidden();
  await expect(page.locator('text=Interstellar')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
