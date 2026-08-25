import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';

test.beforeEach(async ({ context, page }) => {
  await setupMockAuthentication(context);

  // Inject Google Maps Autocomplete Mock
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 1,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 48.8566,
              longitude: 2.3522,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
        watchPosition: (success: PositionCallback) => {
          success({
            coords: {
              accuracy: 1,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 48.8566,
              longitude: 2.3522,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
          return 1;
        },
        clearWatch: () => {},
      },
    });

    class MockAutocomplete {
      callback: () => void = () => {};

      constructor(inputElement: any) {
        inputElement._autocompleteMock = this;
      }

      addListener(_event: string, callback: () => void) {
        this.callback = callback;
        return { remove: () => {} };
      }

      getPlace() {
        return {
          place_id: 'mock-place-id',
          name: 'Paris',
          formatted_address: 'Paris, France',
          geometry: {
            location: {
              lat: () => 48.8566,
              lng: () => 2.3522,
            }
          },
          address_components: [
            { long_name: 'Paris', short_name: 'Paris', types: ['locality'] },
            { long_name: 'France', short_name: 'FR', types: ['country'] }
          ]
        };
      }
    }

    class MockMap {
      private div: HTMLElement;
      private options: any;

      constructor(div: HTMLElement, options: any = {}) {
        this.div = div;
        this.options = { ...options };
      }

      addListener() { return { remove: () => {} }; }
      fitBounds() {}
      getBounds() { return null; }
      getCenter() {
        const center = this.options.center || { lat: 48.8566, lng: 2.3522 };
        return { lat: () => center.lat, lng: () => center.lng };
      }
      getDiv() { return this.div; }
      getHeading() { return this.options.heading || 0; }
      getTilt() { return this.options.tilt || 0; }
      getZoom() { return this.options.zoom || 18; }
      moveCamera(options: any) { this.options = { ...this.options, ...options }; }
      setCenter(center: any) { this.options.center = center; }
      setOptions(options: any) { this.options = { ...this.options, ...options }; }
    }

    class MockAdvancedMarkerElement {
      map: any = null;
      content: HTMLElement = document.createElement('div');
      element: HTMLElement = this.content;
      addListener() { return { remove: () => {} }; }
    }

    class MockPinElement {
      element: HTMLElement = document.createElement('div');
    }

    (window as any).google = {
      maps: {
        importLibrary: async (library: string) => {
          if (library === 'marker') {
            return {
              AdvancedMarkerElement: MockAdvancedMarkerElement,
              PinElement: MockPinElement,
            };
          }
          if (library === 'maps') return { Map: MockMap };
          return { Autocomplete: MockAutocomplete };
        },
        Map: MockMap,
        marker: {
          AdvancedMarkerElement: MockAdvancedMarkerElement,
          PinElement: MockPinElement,
        },
        event: {
          clearInstanceListeners: () => {},
          addListener: (instance: any, event: string, callback: () => void) =>
            instance?.addListener?.(event, callback) || { remove: () => {} },
          removeListener: () => {},
        },
        places: {
          Autocomplete: MockAutocomplete
        }
      }
    };
  });

  // Inject Gemini API Mock for category mapping
  await page.route('**/api/gemini/generate', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          text: JSON.stringify({
            categoryId: 'category-document-123',
            subcategoryId: 'subcategory-document-123'
          })
        }
      })
    });
  });

  // Consolidated Google Places API Mock Handler
  await page.route('https://places.googleapis.com/v1/places**', async route => {
    const url = route.request().url();
    
    if (url.includes('mock-photo-ref/media')) {
      const transparentGif = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      );
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: transparentGif
      });
    } else if (url.includes('mock-place-id')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-place-id',
          displayName: { text: 'Eiffel Tower' },
          formattedAddress: 'Paris, France',
          primaryType: 'tourist_attraction',
          primaryTypeDisplayName: { text: 'Tourist Attraction' },
          rating: 4.8,
          photos: [
            { name: "places/mock-place-id/photos/mock-photo-ref" }
          ]
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-place-id',
          primaryType: 'locality',
          primaryTypeDisplayName: { text: 'City' },
          rating: 4.8
        })
      });
    }
  });

  // Location creation uploads the selected Google photo before creating the list.
  // Keep that boundary deterministic so the test exercises the complete UI flow.
  await page.route('**/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { url: 'https://cdn.example.test/locations/paris-trip.jpg' }
      ])
    });
  });

  await page.route('**/recommended-places**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 456, documentId: 'place-rec-456' }]
      })
    });
  });

  await page.route('**/graphql', async route => {
    const payload = route.request().postDataJSON();
    const operationName =
      payload?.operationName ??
      payload?.query?.match(/(?:query|mutation)\s+(\w+)/i)?.[1] ??
      '';
    const place = {
      __typename: 'RecommendedPlace',
      documentId: 'place-rec-456',
      Place_Details: JSON.stringify({
        name: 'Eiffel Tower',
        formatted_address: 'Paris, France',
        rating: 4.7,
        user_ratings_total: 1000,
      }),
      Contact_Name: null,
      Contact_Number: null,
      Places_Social_Link: null,
      Places_Website: null,
      Users_Place_Note: null,
      Users_Social_URL: null,
      Recommendation_Type: 'Self',
      user_recommendation_note: null,
      user_rating: null,
      google_rating: 4.7,
      media_details: '{}',
      Media: null,
      recommendation_sub_category: {
        documentId: 'subcategory-document-123',
        sub_category: 'Landmark',
      },
      recommendation_category: {
        documentId: 'category-document-123',
        Category_Name: 'Sightseeing',
      },
      recommendation_list: { documentId: 'place-list-123' },
    };
    const claimablePlace = {
      __typename: 'ClaimablePlaceProfile',
      documentId: 'claimable-123',
      Place_Id: 'mock-place-id',
      Name: 'Eiffel Tower',
      Address: 'Paris, France',
      Lat: 48.8566,
      Long: 2.3522,
      Phone: null,
      Website: null,
      Meta_Data: {},
      Recommendation_Count: 1,
      Added_By_User: [],
      Is_Claimed: false,
      Claiming_Account: null,
    };

    if (payload?.query?.includes('CheckOnboardingStatus') || payload?.query?.includes('MyAccount') || payload?.query?.toLowerCase().includes('userspermissionsuser')) {
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
    } else if (payload?.query?.toLowerCase().includes('createrecommendationlist')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendationList: {
              __typename: 'RecommendationList',
              documentId: 'place-list-123',
              List_Name: 'Paris',
              Instagram_Media_URL: null,
              List_Name_Details: null,
              slug: 'paris-trip',
              Visibility: false,
              is_pinned: false,
              pin_order: null,
              display_order: 0,
              account: { documentId: 'acc-123' },
              recommended_places: [],
            }
          }
        })
      });
    } else if (payload?.query?.toLowerCase().includes('createrecommendedplace')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createRecommendedPlace: {
              ...place,
            }
          }
        })
      });
    } else if (payload?.query?.toLowerCase().includes('updaterecommendedplace')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateRecommendedPlace: {
              ...place,
            }
          }
        })
      });
    } else if (operationName === 'RecommendationLists') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recommendationLists: [
              {
                __typename: 'RecommendationList',
                documentId: 'place-list-123',
                List_Name: 'Paris',
                slug: 'paris-trip',
                Visibility: false,
                display_order: 0,
                createdAt: '2026-07-09T00:00:00Z',
                is_pinned: false,
                pin_order: null,
                account: { documentId: 'acc-123' },
                List_Name_Details: null,
                Instagram_Media_URL: null,
                person_lists: [],
                product_lists: [],
                recommended_places: []
              }
            ],
            recommendationList: {
              __typename: 'RecommendationList',
              documentId: 'place-list-123',
              slug: 'paris-trip',
              List_Name: 'Paris',
              Visibility: false,
              display_order: 0,
              createdAt: '2026-07-09T00:00:00Z',
              is_pinned: false,
              pin_order: null,
              account: { documentId: 'acc-123' },
              List_Name_Details: null,
              Instagram_Media_URL: null,
              person_lists: [],
              product_lists: [],
              recommended_places: [place],
            }
          }
        })
      });
    } else if (payload?.query?.toLowerCase().includes('recommendationcategories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recommendationCategories: [
              {
                documentId: 'category-document-123',
                Category_Name: 'Sightseeing',
                recommendation_sub_categories: [
                  {
                    documentId: 'subcategory-document-123',
                    sub_category: 'Landmark'
                  }
                ]
              }
            ]
          }
        })
      });
    } else if (operationName === 'RecommendedPlace') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { recommendedPlace: place } }),
      });
    } else if (operationName === 'RecommendedPlaces') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { recommendedPlaces: [place] } }),
      });
    } else if (operationName === 'AllRecommendedPlaces') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recommendationList: {
              __typename: 'RecommendationList',
              documentId: 'place-list-123',
              recommended_places: [place],
            },
          },
        }),
      });
    } else if (payload?.query?.toLowerCase().includes('claimableplaceprofiles') || payload?.query?.toLowerCase().includes('findclaimableplaceprofile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            claimablePlaceProfiles: []
          }
        })
      });
    } else if (payload?.query?.toLowerCase().includes('createclaimableplaceprofile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createClaimablePlaceProfile: {
              ...claimablePlace,
            }
          }
        })
      });
    } else if (payload?.query?.toLowerCase().includes('updateclaimableplaceprofile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updateClaimablePlaceProfile: {
              ...claimablePlace,
            }
          }
        })
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

test('Flow 8: Locations List and Autocomplete E2E', async ({ page }) => {
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
  await page.goto('/recommendations/places');

  const addListBtn = page.locator('text=Add Location').first();
  await expect(addListBtn).toBeVisible();
  await addListBtn.click();

  const nameInput = page.locator('input[placeholder*="Enter city"]');
  await nameInput.fill('Paris');

  // Wait for Google Autocomplete to attach
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder*="Enter city"]') as any;
    return input && input._autocompleteMock !== undefined;
  });

  // Trigger place changed callback on autocomplete
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="Enter city"]') as any;
    if (input && input._autocompleteMock) {
      input._autocompleteMock.callback();
    }
  });

  // Fill placeUrl (list URL slug)
  const slugInput = page.locator('input[name="placeUrl"]');
  await slugInput.fill('paris-trip');

  const submitBtn = page.locator('button[type="submit"]:has-text("Add Location")');
  await submitBtn.click();

  // Click on the created city card to enter Step 2 details view
  await page.locator('span:has-text("Paris")').first().click();

  const addPlaceBtn = page.locator('button:has-text("Add Place")');
  await expect(addPlaceBtn).toBeVisible();
  await addPlaceBtn.click();

  const placeSearchInput = page.locator('#add-place-search-input');
  await expect(placeSearchInput).toBeVisible();
  await placeSearchInput.fill('Eiffel Tower');

  // Wait for Google Autocomplete to attach to placeSearchInput
  await page.waitForFunction(() => {
    const input = document.querySelector('#add-place-search-input') as any;
    return input && input._autocompleteMock !== undefined;
  });

  // Trigger place changed callback on Eiffel Tower search
  await page.evaluate(() => {
    const input = document.querySelector('#add-place-search-input') as any;
    if (input && input._autocompleteMock) {
      input._autocompleteMock.callback();
    }
  });

  // Wait for navigation to the new recommendation form page
  await page.waitForURL(/\/place-list-123\/new/);

  // Wait for form to finish loading (main input is visible)
  const mainFormInput = page.locator('input[placeholder="Enter your Recommendation"]');
  await expect(mainFormInput).toBeVisible();

  // New place recommendations ask the user to confirm the map position.
  const setLocationButton = page.getByRole('button', { name: /Set Location/i });
  await expect(setLocationButton).toBeVisible();
  await setLocationButton.click();

  // Select Category (which maps to subcategory Landmark)
  const categoryInput = page.locator('input[placeholder="Search Enter a Category"]').first();
  await expect(categoryInput).toBeVisible();
  await categoryInput.click();
  const categoryOption = page.locator('div:has-text("Landmark")').last();
  await categoryOption.click();

  const noteEditor = page.locator('.ql-editor');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill('Must visit iconic landmark.');

  const saveBtn = page.locator('button:has-text("Add recommendation")');
  await saveBtn.click();

  await expect(page).toHaveURL(/\/recommendations$/);
  await expect(page.getByText('Recommendation Created Successfully!!!')).toBeVisible();
  expect(failedResponses).toEqual([]);
  expect(consoleIssues).toEqual([]);
});
