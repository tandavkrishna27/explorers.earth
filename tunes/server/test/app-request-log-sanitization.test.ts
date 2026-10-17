import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizedRequestLogTarget } from "../app";

vi.mock("dotenv", () => {
  throw new Error("DEFAULT_TEST_DOTENV_IMPORT_FORBIDDEN");
});

const databaseBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  const reject = (operation: string) => (..._args: unknown[]): never => {
    unexpected.push(operation);
    throw new Error(`Unexpected database use: ${operation}`);
  };
  return {
    unexpected,
    pool: {
      query: reject("pool.query"),
      connect: reject("pool.connect"),
      end: reject("pool.end"),
    },
  };
});

const storageBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  return {
    unexpected,
    storage: new Proxy({}, {
      get(_target, property): never {
        unexpected.push(String(property));
        throw new Error(`Unexpected storage use: ${String(property)}`);
      },
    }),
  };
});

vi.mock("../db", () => ({ pool: databaseBoundary.pool }));
vi.mock("../storage", () => ({ storage: storageBoundary.storage }));

afterEach(() => {
  expect(databaseBoundary.unexpected).toEqual([]);
  expect(storageBoundary.unexpected).toEqual([]);
});

describe("application request log target", () => {
  it("drops query credentials instead of logging reactivation tokens", () => {
    expect(sanitizedRequestLogTarget({ path: "/api/user/reactivate" }))
      .toBe("/api/user/reactivate");
  });
});
