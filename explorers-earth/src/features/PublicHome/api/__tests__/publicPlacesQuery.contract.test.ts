import { print } from "graphql";
import { describe, expect, it } from "vitest";

import { accountsDetailQuery } from "../query";

describe("public Places account query contract", () => {
  it("keeps optional linked-category relations out of the core account query", () => {
    const source = print(accountsDetailQuery);

    expect(source).not.toContain("person_lists");
    expect(source).not.toContain("product_lists");
    expect(source).toContain("recommendation_lists");
    expect(source).toContain("recommended_places");
  });
});
