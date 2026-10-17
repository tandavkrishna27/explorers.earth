interface EndingClient {
  once(event: "end", listener: () => void): unknown;
}

interface EndingPool {
  on(event: "connect", listener: (client: EndingClient) => void): unknown;
  end(): Promise<void>;
}

export function trackPostgresPoolShutdown(pool: EndingPool): () => Promise<void> {
  // pg-pool removes idle clients before their end callbacks complete, so
  // pool.end() alone can race pg_terminate_backend during database teardown.
  // Register before the first query, including clients that end before cleanup.
  const connections: Promise<void>[] = [];
  pool.on("connect", client => {
    connections.push(new Promise<void>(resolve => { client.once("end", resolve); }));
  });
  return async () => {
    await pool.end();
    await Promise.all(connections);
  };
}
