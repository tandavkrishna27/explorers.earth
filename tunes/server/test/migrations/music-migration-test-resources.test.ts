import { describe, expect, it } from "vitest";
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from "../../../shared/music-migration-contract";
import {
  MusicMigrationTestResources,
  nextSyntheticMusicMigrationId,
} from "./music-migration-test-resources";

describe("music migration integration test resources", () => {
  it("derives synthetic migration IDs from the greatest checked-in sequence", () => {
    const greatestSequence = [...EXPECTED_MUSIC_MIGRATION_CHAIN]
      .map((id) => Number(id.split("_")[0]))
      .sort((left, right) => right - left)[0];
    const expectedPrefix = String(greatestSequence + 1).padStart(4, "0");
    expect(nextSyntheticMusicMigrationId(
      EXPECTED_MUSIC_MIGRATION_CHAIN,
      "deliberate_failure",
    )).toBe(`${expectedPrefix}_deliberate_failure`);
    expect(nextSyntheticMusicMigrationId(
      ["0001_first", "0009_current", "0004_older"],
      "unapproved",
    )).toBe("0010_unapproved");
  });

  it("ends every tracked pool when a test assertion fails and remains idempotent", async () => {
    const resources = new MusicMigrationTestResources();
    const events: string[] = [];
    resources.trackPool({ end: async () => { events.push("first:end"); } });
    resources.trackPool({ end: async () => { events.push("second:end"); } });

    await expect(resources.runWithCleanup(async () => {
      events.push("test:assertion");
      throw new Error("injected assertion failure");
    })).rejects.toThrow("injected assertion failure");
    await resources.closeAllPools();

    expect(events).toEqual(["test:assertion", "first:end", "second:end"]);
  });

  it("releases a checked-out client destructively when its callback fails", async () => {
    const resources = new MusicMigrationTestResources();
    const releases: Array<boolean | undefined> = [];
    const client = { release: (destroy?: boolean) => { releases.push(destroy); } };
    const pool = {
      end: async () => undefined,
      connect: async () => client,
    };

    await expect(resources.withClient(pool, async () => {
      throw new Error("injected client assertion failure");
    })).rejects.toThrow("injected client assertion failure");

    expect(releases).toEqual([true]);
  });
});
