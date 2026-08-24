import type { UTMParameters } from '../utils/urlHelpers';

const CONSENT_STORAGE_KEY = 'explorers-cookie-consent';
export const ANALYTICS_CONSENT_CHANGED_EVENT =
  'explorers:analytics-consent-changed';
const DEFAULT_LOCAL_TUNES_URL =
  import.meta.env.VITE_LOCAL_TUNES_API_URL || 'https://localtunes.earth';

type FetchLike = typeof fetch;

export interface ExplorersAnalyticsEventPayload {
  type: 'view' | 'click' | 'interaction';
  timestamp: string;
  page: string;
  element?: string;
  canonicalPath: string;
  metadata?: Record<string, unknown>;
  utmParams?: UTMParameters;
  referrerOrigin?: string;
}

export interface ExplorersAnalyticsWritePayload {
  consent: true;
  eventId: string;
  accountId: string;
  locationId?: string | null;
  recommendationId?: string | null;
  event: ExplorersAnalyticsEventPayload;
}

export interface ExplorersAnalyticsRecord {
  Account_Id: string;
  Location_Id?: string | null;
  Recommendation_Id?: string | null;
  Stats: ExplorersAnalyticsEventPayload[];
  createdAt?: string;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface WriteOptions extends ClientOptions {
  retryCount?: number;
  pendingPollCount?: number;
  pendingPollBaseDelayMs?: number;
  pendingPollMaxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const endpoint = (baseUrl: string) =>
  `${baseUrl.replace(/\/+$/, '')}/api/explorers/analytics/events`;

export function hasAnalyticsConsent(
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  try {
    const stored = storage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return false;
    return JSON.parse(stored)?.analytics === true;
  } catch {
    return false;
  }
}

export function createAnalyticsEventId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): string {
  return randomUuid();
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return `Analytics request failed with ${response.status}${body ? `: ${body}` : ''}`;
}

export async function postExplorersAnalyticsEvent(
  payload: ExplorersAnalyticsWritePayload,
  {
    baseUrl = DEFAULT_LOCAL_TUNES_URL,
    fetchImpl = fetch,
    retryCount = 1,
    pendingPollCount = 7,
    pendingPollBaseDelayMs = 250,
    pendingPollMaxDelayMs = 2_000,
    sleep = (delayMs) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)),
  }: WriteOptions = {},
): Promise<void> {
  const body = JSON.stringify(payload);
  let lastError: unknown;
  let transientRetries = 0;
  let pendingPolls = 0;

  while (true) {
    try {
      const response = await fetchImpl(endpoint(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.ok && response.status !== 202) return;

      const message = await errorMessage(response);
      if (response.status === 202) {
        lastError = new Error(message);
        if (pendingPolls >= pendingPollCount) break;
        await sleep(
          Math.min(
            pendingPollBaseDelayMs * 2 ** pendingPolls,
            pendingPollMaxDelayMs,
          ),
        );
        pendingPolls += 1;
        continue;
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(message);
      }
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.startsWith('Analytics request failed with 4') &&
        !error.message.startsWith('Analytics request failed with 429')
      ) {
        throw error;
      }
    }

    if (transientRetries >= retryCount) break;
    transientRetries += 1;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Analytics request failed');
}

export async function readExplorersAnalyticsEvents(
  scope: {
    accountId: string;
    from: string;
    to: string;
    token: string;
  },
  {
    baseUrl = DEFAULT_LOCAL_TUNES_URL,
    fetchImpl = fetch,
  }: ClientOptions = {},
): Promise<ExplorersAnalyticsRecord[]> {
  if (!scope.token) {
    throw new Error('Analytics dashboard authentication is required');
  }

  const url = new URL(endpoint(baseUrl));
  url.searchParams.set('accountId', scope.accountId);
  url.searchParams.set('from', scope.from);
  url.searchParams.set('to', scope.to);

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${scope.token}` },
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const body = await response.json();
  if (!Array.isArray(body?.events)) {
    throw new Error('Analytics response did not contain an events array');
  }
  return body.events;
}
