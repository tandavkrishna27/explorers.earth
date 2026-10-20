/** Test table shared by the server and SPA handle-rule suites: [input, acceptable]. */
export const HANDLE_RULE_CASES: ReadonlyArray<readonly [string, boolean]> = [
  ["Ab", false], ["1234", false], ["-abc", false], ["abc-", false], ["ab--c", false], ["ab_c", false],
  ["ADMIN", false], ["admin1", false], ["settings", false], ["alpha", false],
  ["about", false], ["terms", false], ["hub", false], ["analytics", false], ["contact", false],
  ["privacy", false], ["cookies", false], ["use-cases", false], ["register", false],
  ["forgot-password", false], ["reset-password", false], ["email-verification", false],
  ["email-confirmed", false], ["reset-link-sent", false], ["media", false], ["health", false],
  ["a".repeat(31), false], ["a".repeat(30), true], ["abc", true],
  ["uat-owner-a", true], ["test-kitchen", true], ["john-doe", true], ["xadmin", true], ["bassline", true],
  ["my-damn-name", false], ["Mixed-Case", true],
];
