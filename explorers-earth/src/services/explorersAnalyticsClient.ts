import { runtimeOrigin } from "../lib/publicRuntimeConfig";
import type { UTMParameters } from '../utils/urlHelpers';
import { createMusicDevelopmentFetch } from '../features/music/musicDevelopmentTransport';

const CONSENT_STORAGE_KEY = 'explorers-cookie-consent';
export const ANALYTICS_CONSENT_CHANGED_EVENT =
  'explorers:analytics-consent-changed';
const DEFAULT_LOCAL_TUNES_URL =
  runtimeOrigin(import.meta.env.VITE_LOCAL_TUNES_API_URL || 'https://localtunes.earth');

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
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  try {
    const stored = (storage ?? window.localStorage).getItem(CONSENT_STORAGE_KEY);
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

export async function assertCommittedAnalyticsReceipt(response: Response): Promise<void> {
  const receipt: unknown = await response.json().catch(() => null);
  if ((response.status !== 200 && response.status !== 201) || !receipt || typeof receipt !== 'object' ||
    !('status' in receipt) || receipt.status !== 'committed' || !('duplicate' in receipt) || typeof receipt.duplicate !== 'boolean' ||
    ('documentId' in receipt && typeof receipt.documentId !== 'string') ||
    ('retired' in receipt && (receipt.retired !== true || !receipt.duplicate))) {
    throw new Error('Invalid analytics committed receipt');
  }
}

export async function postExplorersAnalyticsEvent(
  payload: ExplorersAnalyticsWritePayload,
  {
    baseUrl = '',
    fetchImpl,
    retryCount = 1,
    pendingPollCount = 7,
    pendingPollBaseDelayMs = 250,
    pendingPollMaxDelayMs = 2_000,
    sleep = (delayMs) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)),
  }: WriteOptions = {},
): Promise<void> {
  const analyticsFetch = fetchImpl ?? fetch;
  const body = JSON.stringify(payload);
  let lastError: unknown;
  let transientRetries = 0;
  let pendingPolls = 0;

  while (true) {
    if (!hasAnalyticsConsent()) throw new Error('Analytics consent withdrawn');
    try {
      const response = await analyticsFetch(endpoint(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok && response.status !== 202) {
        await assertCommittedAnalyticsReceipt(response);
        return;
      }

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

export interface AnalyticsReadScope {
  accountId: string;
  fromDate: string;
  toDate: string;
  timeZone: string;
  token: string;
}

export async function readExplorersAnalyticsEvents(
  scope: AnalyticsReadScope,
  {
    baseUrl = DEFAULT_LOCAL_TUNES_URL,
    fetchImpl,
  }: ClientOptions = {},
): Promise<ExplorersAnalyticsRecord[]> {
  if (!scope.token) {
    throw new Error('Analytics dashboard authentication is required');
  }
  if (!scope.fromDate || !scope.toDate || !scope.timeZone) {
    throw new Error('Analytics dashboard date-only scope is required');
  }

  const analyticsFetch = fetchImpl ?? createMusicDevelopmentFetch(
    fetch,
    import.meta.env.DEV,
    DEFAULT_LOCAL_TUNES_URL,
  );

  const url = new URL(endpoint(baseUrl));
  url.searchParams.set('accountId', scope.accountId);
  url.searchParams.set('fromDate', scope.fromDate);
  url.searchParams.set('toDate', scope.toDate);
  url.searchParams.set('timeZone', scope.timeZone);

  const response = await analyticsFetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${scope.token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const body = await response.json();
  if (!Array.isArray(body?.events)) {
    throw new Error('Analytics response did not contain an events array');
  }
  return body.events;
}
