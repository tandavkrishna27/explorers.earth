import { describe, expect, it } from "vitest";
import {
  selectCompletedAccount,
  selectExplorerAccountDocument,
  selectExplorerAccountState,
} from "../explorerAccountSelection";

// Ported from features/music/__tests__/musicIdentityCoordinator.test.ts when the
// selection helpers moved out of features/music (P3-3) and that file was deleted (P3-4).
const account = {
  documentId: "account-document-7",
  Account_Name: "Seven",
  Account_Type: "Personal",
  mobile_number: "+15555550123",
};

describe("Explorer account selection", () => {
  it("selects a sole completed immutable Account and rejects ambiguity without positional fallback", () => {
    expect(selectCompletedAccount([account])).toEqual({ documentId: account.documentId });
    expect(selectCompletedAccount([{ ...account, mobile_number: "" }])).toBeUndefined();
    expect(selectCompletedAccount([account, { ...account, documentId: "account-document-8" }])).toBeUndefined();
    expect(selectCompletedAccount(undefined)).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, documentId: "" }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, documentId: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Name: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Name: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Type: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Type: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, mobile_number: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, mobile_number: 7 }])).toBeUndefined();
  });

  it("returns one authoritative shared Account-selection state for reordered, incomplete, ambiguous, and partial results", () => {
    const select = selectExplorerAccountState;
    expect(typeof select).toBe("function");
    const incomplete = { ...account, documentId: "account-incomplete", mobile_number: "" };
    expect(select([incomplete, account], { authoritative: true })).toEqual({ kind: "selected", account: { documentId: account.documentId } });
    expect(select([account, incomplete], { authoritative: true })).toEqual({ kind: "selected", account: { documentId: account.documentId } });
    expect(select([account, { ...account, documentId: "account-document-8" }], { authoritative: true })).toEqual({ kind: "ambiguous" });
    expect(select([], { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(select(undefined, { authoritative: false })).toEqual({ kind: "unknown" });
    expect(select([incomplete], { authoritative: false })).toEqual({ kind: "unknown" });
  });

  it("selects onboarding Account authority by immutable document ID, never order", () => {
    const partial = { id: 7, documentId: "account-partial" };
    expect(selectExplorerAccountDocument([partial], { authoritative: true })).toEqual({
      kind: "selected", account: { documentId: "account-partial" },
    });
    expect(selectExplorerAccountDocument(undefined, { authoritative: false })).toEqual({ kind: "unknown" });
    expect(selectExplorerAccountDocument([], { authoritative: true })).toEqual({ kind: "missing" });
    expect(selectExplorerAccountDocument([{ id: 7 }], { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(selectExplorerAccountDocument([partial, { id: 8, documentId: "account-b" }], { authoritative: true })).toEqual({ kind: "ambiguous" });

  });

});
