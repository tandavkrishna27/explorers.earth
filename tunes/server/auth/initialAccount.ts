import type { Pool } from "pg";

const initialCategories = [
  "places", "guides", "music", "movies", "books", "games", "apps", "products", "people",
] as const;

export interface InitialAccount { accountId: string }

/** The unique binding is the concurrency boundary; a losing transaction rolls back its account. */
export async function ensureInitialAccount(pool: Pick<Pool, "connect" | "query">, userId: string): Promise<InitialAccount> {
  if (!userId) throw new Error("An authenticated user ID is required");
  const previous = await pool.query<{ account_id: string }>(
    "SELECT account_id FROM initial_account_bindings WHERE user_id=$1", [userId],
  );
  if (previous.rows[0]) return { accountId: previous.rows[0].account_id };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ id: string }>("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id");
    const accountId = account.rows[0].id;
    await client.query("INSERT INTO account_memberships(account_id,user_id) VALUES ($1,$2)", [accountId, userId]);
    await client.query("INSERT INTO initial_account_bindings(account_id,user_id) VALUES ($1,$2)", [accountId, userId]);
    await client.query("INSERT INTO user_security_state(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    for (let displayOrder = 0; displayOrder < initialCategories.length; displayOrder++) {
      const category = initialCategories[displayOrder];
      await client.query("INSERT INTO account_category_settings(account_id,category,display_order) VALUES ($1,$2,$3)",
        [accountId, category, displayOrder]);
    }
    await client.query("INSERT INTO account_presentation(account_id) VALUES ($1)", [accountId]);
    await client.query("COMMIT");
    return { accountId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      const winner = await pool.query<{ account_id: string }>(
        "SELECT account_id FROM initial_account_bindings WHERE user_id=$1", [userId],
      );
      if (winner.rows[0]) return { accountId: winner.rows[0].account_id };
    }
    throw error;
  } finally {
    client.release();
  }
}
