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
    public_recommendations: 'No',
    public_books: 'No',
    public_movie: 'No',
    public_games: 'No',
    public_music: 'No',
  };

  await page.route('**/graphql', async route => {
    const payload = route.request().postDataJSON();

    if (payload?.query?.includes('CheckOnboardingStatus') || payload?.query?.includes('MyAccountForBooks') || payload?.query?.includes('UsersPermissionsUser') || payload?.query?.includes('usersPermissionsUser')) {
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
    } else if (payload?.query?.includes('createBookList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createBookList: {
              documentId: 'book-list-123',
              List_Name: 'My Summer Reads',
              list_description: null,
              slug: 'my-summer-reads',
              visibility: false,
              cover_image: null,
              top_reads_heading: null,
              display_order: 0,
              account: { documentId: account.documentId, username: account.username },
            }
          }
        })
      });
    } else if (payload?.query?.includes('createRecommendedBook')) {
      recommendationCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendedBook: {
              documentId: 'book-rec-456',
              volume_id: 'clean-code-id',
              title: 'Clean Code',
              display_order: 0,
              is_pinned: false,
            }
          }
        })
      });
    } else if (payload?.query?.includes('BOOK_LISTS_BY_ACCOUNT') || payload?.query?.includes('BookLists')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            bookLists: [
              {
                documentId: 'book-list-123',
                List_Name: 'My Summer Reads',
                list_description: null,
                slug: 'my-summer-reads',
                visibility: false,
                cover_image: null,
                top_reads_heading: null,
                display_order: 0,
                account: { documentId: account.documentId, username: account.username },
                recommended_books: []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('BOOKS_BY_LIST') || payload?.query?.includes('BooksByList')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            bookLists: [
              {
                documentId: 'book-list-123',
                List_Name: 'My Summer Reads',
                list_description: null,
                slug: 'my-summer-reads',
                visibility: false,
                cover_image: null,
                top_reads_heading: null,
                display_order: 0,
                account: { documentId: account.documentId, username: account.username },
                recommended_books: recommendationCreated ? [
                  {
                    documentId: 'book-rec-456',
                    volume_id: 'clean-code-id',
                    title: 'Clean Code',
                    subtitle: 'A Handbook of Agile Software Craftsmanship',
                    authors: ['Robert C. Martin'],
                    year: '2008',
                    cover_url: 'http://books.google.com/books/content?id=clean-code-id&printsec=frontcover',
                    cover_url_large: null,
                    subjects: '["Computers"]',
                    publisher: 'Prentice Hall',
                    page_count: 464,
                    google_rating: 4.5,
                    description: 'Even bad code can function.',
                    isbn_13: '9780132350884',
                    preview_link: 'http://books.google.com',
                    user_recommendation_note: 'Essential guide to programming craft.',
                    user_rating: 9,
                    buy_links: '[]',
                    is_pinned: false,
                    pin_order: null,
                    display_order: 0,
                    media_details: '{}',
                    book_categories: [],
                    Media: []
                  }
                ] : []
              }
            ]
          }
        })
      });
    } else if (payload?.query?.includes('bookCategories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { bookCategories: [] } }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} })
      });
    }
  });

  await page.route('**/books/content**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });

  await page.route('**/api/instagram/media-proxy**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });

  await page.route('**/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ url: '/uploads/fixture-book-cover.jpg' }]),
    });
  });

  // Mock Google Books API search call
  await page.route('https://www.googleapis.com/books/v1/volumes**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'clean-code-id',
            volumeInfo: {
              title: 'Clean Code',
              authors: ['Robert C. Martin'],
              publishedDate: '2008-08-01',
              pageCount: 464,
              averageRating: 4.5,
              imageLinks: {
                thumbnail: 'http://books.google.com/books/content?id=clean-code-id&printsec=frontcover'
              }
            }
          }
        ]
      })
    });
  });
});

test('Flow 2: Books List and Recommendation creation E2E', async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/recommendations/books');

  const addListBtn = page.locator('button:has-text("New List")').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  const nameInput = page.locator('input[name="List_Name"]');
  await nameInput.fill('My Summer Reads');

  const submitBtn = page.locator('button[type="submit"]:has-text("Create List")');
  await submitBtn.click();

  await page.goto('/recommendations/books/book-list-123');

  const addBookBtn = page.locator('button:has-text("Add Book")');
  await expect(addBookBtn).toBeVisible();
  await addBookBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/books\/book-list-123\/add/);

  const searchInput = page.locator('input[placeholder*="Search by title"]');
  await searchInput.fill('Clean Code');

  const searchResult = page.locator('button:has-text("Clean Code")');
  await expect(searchResult).toBeVisible();
  await searchResult.click();

  const noteEditor = page.locator('.ql-editor');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill('Essential guide to programming craft.');

  const saveBtn = page.locator('button:has-text("Add to List")');
  await saveBtn.click();

  await expect(page).toHaveURL(/\/recommendations\/books\/book-list-123/);
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Draft' }).click();
  await expect(page.getByRole('heading', { name: 'Publish this list?' })).toBeHidden();
  await expect(page.locator('text=Clean Code')).toBeVisible();
  expect(failedResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
