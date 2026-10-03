import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export interface RuntimeTableManifestInput {
  manifestTables: string[];
  controlTables?: string[];
  referencedTables: string[];
  migratedTables: string[];
  unmanagedTables?: string[];
}

export interface RuntimeTableInventory {
  drizzleTables: string[];
  rawSqlTables: string[];
  applicationTables: string[];
  systemTables: string[];
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (["node_modules", "dist", ".artifacts", "test", "tests", "__tests__"].includes(name)) return [];
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|sql)$/.test(name) ? [path] : [];
  });
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sqlStatements(file: string, source: string): string[] {
  if (file.endsWith(".sql")) return [source];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const statements: string[] = [];
  const constantString = (identifier: ts.Identifier): string | undefined => {
    // Resolve only lexical const string declarations, never execute expressions.
    for (let scope: ts.Node | undefined = identifier.parent; scope; scope = scope.parent) {
      if (ts.isFunctionLike(scope) && scope.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text)) return undefined;
      if (!ts.isSourceFile(scope) && !ts.isBlock(scope)) continue;
      for (const statement of scope.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== identifier.text) continue;
          return (statement.declarationList.flags & ts.NodeFlags.Const) && declaration.initializer && ts.isStringLiteral(declaration.initializer)
            ? declaration.initializer.text : undefined;
        }
      }
    }
    return undefined;
  };
  const literal = (node: ts.Node | undefined): string | undefined => {
    if (!node) return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      // Preserve static SQL around values without interpreting JS expressions as SQL.
      return node.head.text + node.templateSpans.map(span =>
        (ts.isIdentifier(span.expression) ? constantString(span.expression) ?? " ${dynamic} " : " ${dynamic} ") + span.literal.text,
      ).join("");
    }
    return undefined;
  };
  const visit = (node: ts.Node) => {
    let statement: string | undefined;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query") {
      statement = literal(node.arguments[0]);
    } else if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "sql") {
      statement = literal(node.template);
    } else if (ts.isStringLiteral(node) && ts.isArrayLiteralExpression(node.parent) && /^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(node.text)) {
      // Runtime role attestation executes a literal array of SQL probes through
      // query(statement). Keep those authority references in the inventory.
      statement = node.text;
    }
    if (statement !== undefined) statements.push(statement);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return statements;
}

export function inventoryRuntimeTables(repositoryRoot: string): RuntimeTableInventory {
  const shared = join(repositoryRoot, "tunes", "shared");
  const schema = ["schema.ts", "authSchema.ts", "explorersSchema.ts"]
    .map((file) => join(shared, file))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const drizzleTables = sorted([...schema.matchAll(/pgTable\(\s*["']([a-z_][a-z0-9_]*)["']/g)].map((match) => match[1]));
  const rawSqlTables = new Set<string>();
  for (const file of sourceFiles(join(repositoryRoot, "tunes", "server"))) {
    const source = readFileSync(file, "utf8");
    const statements = sqlStatements(file, source);
    for (const statement of statements) {
      const commonTableExpressions = new Set(
        [...statement.matchAll(/(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([a-z_][a-z0-9_]*)\s*(?:\([^)]*\)\s*)?AS\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/gi)].map((match) => match[1].toLowerCase()),
      );
      for (const match of statement.matchAll(/\b(?:DELETE\s+FROM|FROM|JOIN|UPDATE(?!\s+(?:OF|SKIP|SET)\b)|INTO)\s+(?:LATERAL\s+)?(?:"?public"?\.)?["']?([a-z_][a-z0-9_]*)["']?/gi)) {
        const table = match[1].toLowerCase();
        const statementOffset = statement.lastIndexOf(";", match.index ?? 0) + 1;
        const statementPrefix = statement.slice(statementOffset, match.index);
        if (/^\s*(?:GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES)\b/i.test(statementPrefix)) continue;
        if (/^FROM\b/i.test(match[0]) && /\bextract\s*\(\s*[a-z_]+\s*$/i.test(statementPrefix)) continue;
        const following = statement.slice((match.index ?? 0) + match[0].length).trimStart();
        if (table === "public" && following.startsWith(".")) continue;
        const tableFunction = /^(?:FROM|JOIN)\b/i.test(match[0]) && following.startsWith("(");
        if (!commonTableExpressions.has(table) && !tableFunction) rawSqlTables.add(table);
      }
    }
  }
  const systemTables = sorted([...rawSqlTables].filter((table) => table.startsWith("pg_") || table.startsWith("information_schema")));
  const applicationRawSqlTables = sorted([...rawSqlTables].filter((table) => !systemTables.includes(table)));
  return {
    drizzleTables,
    rawSqlTables: applicationRawSqlTables,
    applicationTables: sorted([...drizzleTables, ...applicationRawSqlTables]),
    systemTables,
  };
}

export function validateRuntimeTableManifest(input: RuntimeTableManifestInput): void {
  const unmanaged = new Set(input.unmanagedTables ?? []);
  const controls = new Set(input.controlTables ?? []);
  for (const table of controls) if (input.manifestTables.includes(table)) throw new Error(`${table} cannot be both a runtime and control table`);
  for (const table of input.referencedTables) if (!input.manifestTables.includes(table) && !controls.has(table)) throw new Error(`${table} is referenced at runtime but missing from the manifest`);
  for (const table of input.manifestTables) if (!input.migratedTables.includes(table) && !unmanaged.has(table)) throw new Error(`${table} is in the manifest but absent from a fresh migrated database`);
  for (const table of unmanaged) if (!input.referencedTables.includes(table)) throw new Error(`${table} is marked unmanaged but has no runtime reference`);
  for (const table of controls) if (!input.referencedTables.includes(table)) throw new Error(`${table} control table has no runtime authority reference`);
}
