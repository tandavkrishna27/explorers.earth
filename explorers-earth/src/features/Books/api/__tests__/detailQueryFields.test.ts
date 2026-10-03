import { describe, it, expect } from "vitest";
import type { DocumentNode, OperationDefinitionNode, FieldNode } from "graphql";
import { collectionViewModel } from "../booksViewModel";
import { GAMES_BY_LIST } from "../../../Games/api/query";
import { MOVIES_BY_LIST } from "../../../Movies/api/query";

function listLevelFields(doc: DocumentNode, listField: string): string[] {
  const op = doc.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === "OperationDefinition",
  );
  const list = op?.selectionSet.selections.find(
    (s): s is FieldNode => s.kind === "Field" && s.name.value === listField,
  );
  return (list?.selectionSet?.selections ?? [])
    .filter((s): s is FieldNode => s.kind === "Field")
    .map((s) => s.name.value);
}

describe("detail queries select list-level display_order (optimisticResponse needs it)", () => {
  it("canonical Books preserves list display_order", () => expect(collectionViewModel({id:"list",displayOrder:0} as never,[]).display_order).toBe(0));
  it("GAMES_BY_LIST", () =>
    expect(listLevelFields(GAMES_BY_LIST, "gameLists")).toContain("display_order"));
  it("MOVIES_BY_LIST", () =>
    expect(listLevelFields(MOVIES_BY_LIST, "movieLists")).toContain("display_order"));
});
