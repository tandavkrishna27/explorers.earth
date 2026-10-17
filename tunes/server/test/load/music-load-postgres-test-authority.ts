import { parseUatDatabaseAuthority } from "../../../scripts/music-uat-database";
import { parseC10StandalonePostgresAuthority } from "../../../scripts/music-qualification-postgres";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";

export interface MusicLoadPostgresPool {
  readonly totalCount: number;
  query(queryText: string): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

export type MusicLoadPostgresPoolFactory = (input: {
  connectionString: string;
  max: 4;
}) => MusicLoadPostgresPool | Promise<MusicLoadPostgresPool>;

function ownedMusicLoadPostgresTarget(environment: NodeJS.ProcessEnv): URL | undefined {
  if (environment.MUSIC_C10_POSTGRES_TEST !== "1") return undefined;
  const uatAuthority = parseUatDatabaseAuthority(environment);
  const standaloneAuthority = parseC10StandalonePostgresAuthority(environment);
  if (Number(Boolean(uatAuthority)) + Number(Boolean(standaloneAuthority)) !== 1) {
    throw new Error("Music PostgreSQL load test requires exactly one owned database authority tuple");
  }
  return validateIntegrationDatabaseTarget(environment.DATABASE_URL_TEST ?? "", environment);
}

export function createIdempotentMusicLoadPostgresTeardown(
  pool: Pick<MusicLoadPostgresPool, "end">,
): () => Promise<void> {
  let teardown: Promise<void> | undefined;
  return () => {
    teardown ??= Promise.resolve().then(async () => await pool.end());
    return teardown;
  };
}

export async function runOwnedMusicLoadPostgresTest<T>(
  environment: NodeJS.ProcessEnv,
  createPool: MusicLoadPostgresPoolFactory,
  execute: (pool: MusicLoadPostgresPool) => Promise<T>,
): Promise<{ executed: false } | { executed: true; value: T }> {
  const target = ownedMusicLoadPostgresTarget(environment);
  if (!target) return { executed: false };
  const pool = await createPool({ connectionString: target.toString(), max: 4 });
  const teardown = createIdempotentMusicLoadPostgresTeardown(pool);
  try {
    return { executed: true, value: await execute(pool) };
  } finally {
    await teardown();
  }
}
