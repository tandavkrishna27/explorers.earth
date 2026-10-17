import type { EventEmitter } from "node:events";

const CHANNEL = "music_identity_suspended";
const READINESS_LOCK = "music:identity-suspension-listener-ready";

interface Notification {
  channel: string;
  payload?: string;
}

interface ListenClient extends EventEmitter {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  release(): void;
}

interface ListenPool {
  connect(): Promise<ListenClient>;
}

interface SuspensionFence {
  musicUserId: number;
  sessionVersion: number;
}

export interface MusicReconciliationSuspensionListener {
  stop(): Promise<void>;
}

function parseSuspensionFence(payload: string | undefined): SuspensionFence | undefined {
  const match = /^([1-9]\d*):([1-9]\d*)$/.exec(payload ?? "");
  if (!match) return undefined;
  const musicUserId = Number(match[1]);
  const sessionVersion = Number(match[2]);
  return Number.isSafeInteger(musicUserId) && Number.isSafeInteger(sessionVersion)
    ? { musicUserId, sessionVersion }
    : undefined;
}

export async function startMusicReconciliationSuspensionListener(options: {
  pool: ListenPool;
  disconnectOwner(musicUserId: number): Promise<void>;
  onDisconnectError(error: unknown): void;
  onFatal(error: unknown): void;
  maxConcurrency?: number;
  maxPending?: number;
}): Promise<MusicReconciliationSuspensionListener> {
  const maxConcurrency = options.maxConcurrency ?? 8;
  const maxPending = options.maxPending ?? 1_000;
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32
      || !Number.isSafeInteger(maxPending) || maxPending < maxConcurrency || maxPending > 10_000) {
    throw new Error("Music reconciliation listener bounds are invalid");
  }
  const client = await options.pool.connect();
  let accepting = true;
  let active = 0;
  let fatal = false;
  const queue: SuspensionFence[] = [];
  const drained: Array<() => void> = [];
  let stopPromise: Promise<void> | undefined;
  const resolveDrained = (): void => {
    if (active === 0 && queue.length === 0) drained.splice(0).forEach((resolve) => resolve());
  };
  const pump = (): void => {
    while (active < maxConcurrency && queue.length > 0) {
      const fence = queue.shift()!;
      active += 1;
      void shouldDisconnectCurrentSuspension(client, fence)
        .then((shouldDisconnect) => shouldDisconnect ? options.disconnectOwner(fence.musicUserId) : undefined)
        .catch(options.onDisconnectError).finally(() => {
        active -= 1;
        pump();
        resolveDrained();
      });
    }
    resolveDrained();
  };
  const onNotification = (notification: Notification): void => {
    if (!accepting || notification.channel !== CHANNEL) return;
    const fence = parseSuspensionFence(notification.payload);
    if (!fence) return;
    if (active + queue.length >= maxPending) {
      accepting = false;
      fatal = true;
      options.onFatal(new Error("Music reconciliation listener queue capacity exceeded"));
      return;
    }
    queue.push(fence);
    pump();
  };
  const onClientError = (error: unknown): void => {
    accepting = false;
    if (!fatal) {
      fatal = true;
      options.onFatal(error);
    }
  };

  client.on("notification", onNotification);
  client.on("error", onClientError);
  try {
    await client.query("SET application_name = 'music-reconciliation-suspension-listener'");
    await client.query(`LISTEN ${CHANNEL}`);
    await client.query(`SELECT pg_advisory_lock_shared(hashtextextended('${READINESS_LOCK}',0))`);
  } catch (error) {
    client.off("notification", onNotification);
    client.off("error", onClientError);
    client.release();
    throw error;
  }

  return {
    stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      accepting = false;
      client.off("notification", onNotification);
      client.off("error", onClientError);
      stopPromise = (async () => {
        if (active > 0 || queue.length > 0) await new Promise<void>((resolve) => drained.push(resolve));
        try {
          await client.query(`SELECT pg_advisory_unlock_shared(hashtextextended('${READINESS_LOCK}',0))`);
          await client.query(`UNLISTEN ${CHANNEL}`);
        } finally {
          client.release();
        }
      })();
      return stopPromise;
    },
  };
}

async function shouldDisconnectCurrentSuspension(client: ListenClient, fence: SuspensionFence): Promise<boolean> {
  const result = await client.query(`SELECT EXISTS (
      SELECT 1 FROM users identity
      JOIN music_identity_lifecycle_operations operation
        ON operation.operation_id=identity.lifecycle_operation_id
       AND operation.music_user_id=identity.id
       AND operation.strapi_user_document_id=identity.strapi_user_document_id
       AND operation.strapi_account_document_id=identity.strapi_account_document_id
      WHERE identity.id=$1
        AND identity.session_version=$2
        AND identity.identity_status='suspended'
        AND identity.lifecycle_state='completed'
        AND operation.operation_kind='suspend'
        AND operation.requested_identity_status='suspended'
        AND operation.operation_state='completed'
        AND operation.operation_phase='single'
        AND operation.result_session_version=$2
        AND operation.result_session_version=identity.session_version
    ) AS should_disconnect`, [fence.musicUserId, fence.sessionVersion]) as { rows?: Array<{ should_disconnect?: unknown }> };
  return result.rows?.[0]?.should_disconnect === true;
}
