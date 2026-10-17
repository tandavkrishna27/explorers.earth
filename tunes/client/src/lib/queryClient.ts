import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken } from "./csrf";
import { clearGuestMusicCapability, getGuestMusicCapability, isMusicOwnerRequest, musicCredentialForRequest } from "./musicCredential";
























async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    let error;
    try {
      const json = JSON.parse(text);
      error = new Error(json.message || text);
    } catch {
      error = new Error(text || res.statusText);
    }
    (error as any).status = res.status;
    throw error;
  }
}

const AUTOMATICALLY_RETRYABLE_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"]);
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function hasDurablePublicationIdempotency(method: string, url: string, requestHeaders: Record<string, string>): boolean {
  if (method.toUpperCase() !== "POST" || url.split(/[?#]/, 1)[0] !== "/api/music/publication") return false;
  const idempotencyKey = Object.entries(requestHeaders)
    .find(([name]) => name.toLowerCase() === "idempotency-key")?.[1];
  return typeof idempotencyKey === "string" && IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retryCount: number = 0,
  maxRetries: number = 3,
  requestHeaders: Record<string, string> = {},
): Promise<Response> {
  const retryAllowed = AUTOMATICALLY_RETRYABLE_METHODS.has(method.toUpperCase())
    || hasDurablePublicationIdempotency(method, url, requestHeaders);
  const headers: HeadersInit = {
    "Accept": "application/json",
    ...requestHeaders,
  };

  if (data) {
    headers["Content-Type"] = "application/json";
  }

  // Add JWT token from localStorage (Strapi auth)
  const musicOwnerRequest = isMusicOwnerRequest(url);
  const token = musicOwnerRequest ? await musicCredentialForRequest() : localStorage.getItem('qrtoken');
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Add CSRF token using our standardized function
  const csrfToken = getCsrfToken();

  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
    console.log('Using CSRF token:', csrfToken.substring(0, 6) + '...');
  } else {
    console.warn('No CSRF token found in cookies');
  }

  // Prepare request body with CSRF token if needed
  let body = data;
  if (!musicOwnerRequest && data && typeof data === 'object' && !Array.isArray(data)) {
    body = {
      ...data,
      _csrf: csrfToken
    };
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include", // Always include credentials for cross-origin requests
      mode: "cors", // Ensure CORS support
    });

    // Special handling for 503 Service Unavailable
    if (res.status === 503 && retryAllowed) {
      if (retryCount < maxRetries) {
        console.warn(`Server returned 503 for ${url}. Retrying (${retryCount + 1}/${maxRetries})...`);
        // Increased backoff times for 503 errors with randomized jitter
        // Base delay: 1000ms, 2000ms, 4000ms, etc. - longer than normal retries
        const baseDelay = 1000 * Math.pow(2, retryCount);
        // Add jitter (plus or minus 30%) to prevent synchronized retries from multiple clients
        const jitterFactor = 0.7 + (Math.random() * 0.6); // 0.7-1.3
        const delay = Math.min(baseDelay * jitterFactor, 10000); // Cap at 10 seconds

        console.log(`Waiting ${Math.round(delay)}ms before retry attempt ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return apiRequest(method, url, data, retryCount + 1, maxRetries, requestHeaders);
      } else {
        console.error(`Server unavailable (503) after ${maxRetries} retries:`, url);
        // Create a more descriptive error for the UI
        const error = new Error(`The server is temporarily unavailable. Please try again later.`);
        (error as any).status = 503;
        throw error;
      }
    }

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    // Network error handling (fetch() will reject for network errors but not HTTP errors)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (retryAllowed && retryCount < maxRetries) {
        console.warn(`Network error for ${url}. Retrying (${retryCount + 1}/${maxRetries})...`);
        // Apply similar backoff strategy as 503 errors for network errors
        const baseDelay = 1000 * Math.pow(2, retryCount);
        const jitterFactor = 0.7 + (Math.random() * 0.6); // 0.7-1.3
        const delay = Math.min(baseDelay * jitterFactor, 8000); // Cap at 8 seconds

        console.log(`Waiting ${Math.round(delay)}ms before retry attempt ${retryCount + 1} for network error`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return apiRequest(method, url, data, retryCount + 1, maxRetries, requestHeaders);
      } else {
        // Create a user-friendly error message for network failures
        const friendlyError = new Error("Unable to connect to the server. Please check your internet connection and try again.");
        (friendlyError as any).status = 0; // Network error status
        (friendlyError as any).originalError = error;
        throw friendlyError;
      }
    }

    // Re-throw the error after all retries have been exhausted
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
type GetQueryFnOptions = {
  on401: UnauthorizedBehavior;
  shouldLog?: (status: number, url?: string) => boolean;
};

const isAuthRelatedPage = () => {
  const path = window.location.pathname;
  return path === '/auth' || path === '/login' || path === '/register';
};

export const getQueryFn: <T>(options: GetQueryFnOptions) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, shouldLog = () => true }) =>
    async ({ queryKey }) => {
      const url = queryKey[0] as string;
      const isUserEndpoint = url === '/api/user';
      const authPage = isAuthRelatedPage();

      // Skip logging entirely for auth checking on auth pages
      if (!isUserEndpoint || !authPage) {
        if (shouldLog(200, url)) {
          console.log('Making API request:', url);
        }
      }

      try {
        // Initialize headers with Accept
        const headers: HeadersInit = {
          "Accept": "application/json",
        };

        // Add JWT token from localStorage (Strapi auth)
        const token = isMusicOwnerRequest(url) ? await musicCredentialForRequest() : localStorage.getItem('qrtoken');
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const guestMatch = /^\/api\/playlist\/([^/]+)$/.exec(url);
        const guestUrl = guestMatch ? decodeURIComponent(guestMatch[1]) : undefined;
        if (guestUrl) {
          const guestCapability = getGuestMusicCapability(guestUrl);
          if (guestCapability) headers["X-Music-Guest-Capability"] = guestCapability;
        }

        // Add CSRF token to headers using our helper function
        const csrfToken = getCsrfToken();

        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        }

        let res = await fetch(url, {
          credentials: "include",
          mode: "cors",
          headers
        });
        if (res.status === 404 && guestUrl) {
          clearGuestMusicCapability(guestUrl);
        }

        // Handle 503 Service Unavailable with exponential backoff
        if (res.status === 503) {
          console.warn(`Server returned 503 for ${url}. This will be retried automatically.`);
          // Let the retry logic handle it
          const error = new Error("Service Unavailable");
          (error as any).status = 503;
          throw error;
        }

        if (res.status === 401) {
          // Silently handle expected auth check failures
          if (isUserEndpoint && authPage) {
            return null;
          }

          if (shouldLog(401, url)) {
            console.log('Unauthorized request:', url);
          }

          if (unauthorizedBehavior === "returnNull") {
            return null;
          } else {
            const error = new Error("Unauthorized");
            (error as any).status = 401;
            throw error;
          }
        }

        await throwIfResNotOk(res);
        return await res.json();
      } catch (error) {
        // Only log unexpected errors
        const isAuthError = error instanceof Error && error.message === "Unauthorized";
        const isProfileEndpoint = url === '/api/user/profile';

        // Don't log auth errors for profile or user endpoints during auth transitions
        if (!(isAuthError && (isUserEndpoint || isProfileEndpoint))) {
          console.error('API request failed:', error);
        } else {
          // For debugging: show a more subtle message for expected auth errors
          console.debug('Auth-related request failed (expected):', url);
        }
        throw error;
      }
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({
        on401: "throw",
        shouldLog: (status, url) => {
          // Never log expected auth checks
          if (status === 401 && url === '/api/user' && isAuthRelatedPage()) {
            return false;
          }
          return true;
        }
      }),
      retry: (failureCount: number, error: any) => {
        // Don't retry expected auth failures
        if (error instanceof Error &&
          error.message === "Unauthorized" &&
          isAuthRelatedPage()) {
          return false;
        }

        // Retry server errors (like 503 Service Unavailable) more aggressively
        if (error && error.status >= 500 && error.status < 600) {
          console.warn(`Retrying server error (${error.status}). Attempt ${failureCount + 1}`);
          return failureCount < 5; // More retries for server errors
        }

        // For network errors and other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => {
        // Implement exponential backoff with jitter for retries
        const baseDelay = 500; // Start with 500ms
        const maxDelay = 10000; // Cap at 10 seconds

        // Calculate delay with exponential backoff: 500ms, 1000ms, 2000ms, etc.
        const delay = Math.min(
          Math.pow(2, attemptIndex) * baseDelay,
          maxDelay
        );

        // Add jitter to prevent request thundering herd
        const jitter = delay * (0.5 + Math.random() * 0.5);
        return jitter;
      },
      refetchOnWindowFocus: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      // apiRequest owns method- and idempotency-aware retries. A global mutation
      // retry cannot know whether the server committed the previous attempt.
      retry: false,
    },
  },
});
