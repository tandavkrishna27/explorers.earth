import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MONTHLY_GUEST_REQUEST_CAP } from "../repositories/musicDomainRepository";

/**
 * The monthly guest song request cap. Decision D1, 2026-10-08: 100 per venue per calendar
 * month, surface labelled beta.
 *
 * The transactional behaviour - that the hundred-and-first request is refused and that a
 * refused request does not consume quota - needs PostgreSQL and is proved in the migration
 * integration suite. What is checked here is the cap value, the storage rules that make the
 * counting correct, and the properties of the enforcement that a reviewer would otherwise
 * have to take on trust by reading it.
 */

const repository = readFileSync(
  resolve(__dirname, "../repositories/musicDomainRepository.ts"), "utf8",
);
const migration = readFileSync(
  resolve(__dirname, "../../migrations/0051_explorers_launch_controls.sql"), "utf8",
);
const routes = readFileSync(
  resolve(__dirname, "../routes/musicSurfaceRoutes.ts"), "utf8",
);

describe("monthly guest request cap", () => {
  it("is the hundred TK decided", () => {
    expect(MONTHLY_GUEST_REQUEST_CAP).toBe(100);
  });

  it("counts by upsert-and-read, so the count and the queue insert are one transaction", () => {
    // A read followed by a separate write would let two concurrent requests both see 99 and
    // both commit, and would also make a refused request consume quota.
    expect(repository).toContain("INSERT INTO music_request_quota");
    expect(repository).toContain("ON CONFLICT (music_user_id,period_start)");
    expect(repository).toContain("RETURNING accepted_count");
  });

  it("refuses by rolling back, which also undoes the increment", () => {
    const enforcement = repository.slice(repository.indexOf("INSERT INTO music_request_quota"));
    const refusal = enforcement.slice(0, enforcement.indexOf("INSERT INTO songs"));
    expect(refusal).toContain(`monthlyCount > MONTHLY_GUEST_REQUEST_CAP`);
    expect(refusal).toContain('ROLLBACK');
    expect(refusal).toContain('status: "quota_exceeded"');
  });

  it("checks the cap before inserting the song, not after", () => {
    // After would mean the row is written and then the transaction abandoned, which works
    // only by accident of the rollback and reads as a bug to the next person.
    // Scoped to addGuestSongIdempotent: other methods insert into songs too.
    const method = repository.slice(repository.indexOf("async addGuestSongIdempotent("));
    const quotaAt = method.indexOf("INSERT INTO music_request_quota");
    const songAt = method.indexOf("INSERT INTO songs(user_id,youtube_id");
    expect(quotaAt).toBeGreaterThan(-1);
    expect(songAt).toBeGreaterThan(-1);
    expect(quotaAt).toBeLessThan(songAt);
  });

  it("takes the period boundary and the retry time from the database clock", () => {
    // The bucket is computed by date_trunc in the database, so the time until it rolls over
    // has to come from the same clock or the two can disagree across a timezone or a
    // process with a skewed system time.
    expect(repository).toContain("date_trunc('month',transaction_timestamp())::date");
    expect(repository).toContain("EXTRACT(EPOCH FROM (date_trunc('month',transaction_timestamp())");
  });

  it("is distinct from the per-minute burst limiter beside it", () => {
    // Two different controls: one stops a client flooding, one bounds a venue's month.
    // Collapsing them would silently drop whichever was written second.
    expect(repository).toContain("recentForSource >= 20");
    expect(repository).toContain("MONTHLY_GUEST_REQUEST_CAP");
  });
});

describe("migration 0051 quota storage rules", () => {
  it("makes one venue-month exactly one row", () => {
    expect(migration).toContain("PRIMARY KEY(music_user_id, period_start)");
  });

  it("refuses a period that is not the first of a month", () => {
    // Without this a caller computing the bucket differently writes a second row for the
    // same month, and the cap silently doubles.
    expect(migration).toContain("CHECK(period_start = date_trunc('month', period_start)::date)");
  });

  it("cannot hold a negative count", () => {
    expect(migration).toContain("CHECK(accepted_count >= 0)");
  });

  it("drops the counters with the Music owner", () => {
    expect(migration).toContain("REFERENCES public.users(id) ON DELETE CASCADE");
  });

  it("grants UPDATE, which email_suppressions deliberately does not get", () => {
    // Incrementing is an amendment; a suppression is a fact. The two tables in this
    // migration get different grants for that reason.
    expect(migration).toContain("GRANT SELECT,INSERT,UPDATE ON public.music_request_quota TO music_runtime");
    expect(migration).not.toMatch(/GRANT[^;]*DELETE[^;]*music_request_quota/);
  });
});

describe("how the cap is reported to a guest", () => {
  it("answers 429 and names the cap", () => {
    const arm = routes.slice(routes.indexOf('result.status === "quota_exceeded"'));
    const body = arm.slice(0, arm.indexOf("if (result.status !== \"completed\")"));
    expect(body).toContain("RATE_LIMITED");
    expect(body).toContain("429");
    expect(body).toContain("${result.cap}");
  });

  it("reports the real time until the limit resets, not a token minute", () => {
    const arm = routes.slice(routes.indexOf('result.status === "quota_exceeded"'));
    const body = arm.slice(0, arm.indexOf("if (result.status !== \"completed\")"));
    expect(body).toContain("result.retryAfterSeconds");
    // The generic burst limiter beside it uses a literal 60; the monthly cap must not.
    expect(body).not.toMatch(/,\s*60\s*\)/);
  });

  it("says the limit is the venue's and that it reopens, not that the request was wrong", () => {
    expect(routes).toContain("This venue has reached its monthly limit of");
    expect(routes).toContain("Requests open again next month.");
  });
});
