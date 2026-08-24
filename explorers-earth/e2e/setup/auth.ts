import { BrowserContext } from '@playwright/test';

export async function setupMockAuthentication(context: BrowserContext) {
  // Populate storage state / session data to skip login
  await context.addCookies([
    {
      name: 'token',
      value: 'mock-jwt-token-xyz',
      domain: 'localhost',
      path: '/',
    }
  ]);
  
  // Inject localStorage login state safely
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          isAuthenticated: true,
          token: 'mock-jwt-token-xyz',
          jwt: 'mock-jwt-token-xyz',
          user: {
            id: 'mock-user-123',
            documentId: 'mock-user-123',
            username: 'testuser',
            email: 'test@explorers.earth',
            blocked: false
          }
        }
      }));
      window.localStorage.setItem('user', JSON.stringify({
        id: 'mock-user-123',
        documentId: 'mock-user-123',
        username: 'testuser',
        email: 'test@explorers.earth',
        role: 'explorer'
      }));
      window.localStorage.setItem('auth_session', 'mock-session-id-456');
      window.localStorage.setItem('explorers-cookie-consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: '2026-08-24T00:00:00.000Z',
      }));
    } catch (e) {
      // Safe to ignore on about:blank, will run again on target origin
    }
  });

  // Mock subscription API calls at context level
  await context.route('**/api/subscriptions/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            documentId: 'sub-plan-123',
            plan_id: 'plan-basic',
            start_date: '2026-07-09T00:00:00Z',
            end_date: '2027-07-09T00:00:00Z',
            status: 'active'
          }
        ]
      })
    });
  });

  // Mock the subscription plans LIST endpoint. Registered after the generic
  // '**/api/subscriptions/**' route so it wins (Playwright matches routes in
  // reverse registration order). Without this, the plans request receives
  // subscription records lacking plan_name, which crashed OnBoarding.
  await context.route('**/api/subscriptions/plans', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            documentId: 'plan-free',
            plan_name: 'Free',
            plan_cost: 0,
            duration: 'monthly',
            features: '[]',
            ai_guide_quota: 10,
            song_quota: 10
          },
          {
            documentId: 'plan-basic',
            plan_name: 'Basic Plan',
            plan_cost: 99,
            duration: 'monthly',
            features: '[]',
            ai_guide_quota: 100,
            song_quota: 100
          }
        ]
      })
    });
  });

  // Mock subscription plan by ID calls
  await context.route('**/api/subscriptions/plans/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          documentId: 'plan-basic',
          plan_name: 'Basic Plan',
          ai_guide_quota: 100,
          song_quota: 100
        }
      })
    });
  });

  // Mock song/request limits API calls
  await context.route('**/api/song-limits/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            documentId: 'song-limit-123',
            username: 'testuser',
            song_requests: 0,
            ai_guide_requests: 0
          }
        ]
      })
    });
  });
}
