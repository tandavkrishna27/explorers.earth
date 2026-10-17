import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const configPath = fileURLToPath(new URL('../../../vitest.config.ts', import.meta.url));

describe('default test environment', () => {
  it('disables Vite environment-file loading in the exported config', () => {
    const sourceFile = ts.createSourceFile(
      configPath,
      fs.readFileSync(configPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const defaultExports = sourceFile.statements.filter(
      (statement): statement is ts.ExportAssignment =>
        ts.isExportAssignment(statement) && !statement.isExportEquals,
    );

    expect(defaultExports).toHaveLength(1);
    const expression = defaultExports[0]?.expression;
    expect(expression && ts.isCallExpression(expression)).toBe(true);
    if (!expression || !ts.isCallExpression(expression)) return;

    expect(ts.isIdentifier(expression.expression) && expression.expression.text).toBe(
      'defineConfig',
    );
    expect(expression.arguments).toHaveLength(1);
    const config = expression.arguments[0];
    expect(config && ts.isObjectLiteralExpression(config)).toBe(true);
    if (!config || !ts.isObjectLiteralExpression(config)) return;

    const envDirEntries = config.properties.flatMap((property, index) => {
      if (!('name' in property) || !property.name) return [];
      const name = property.name;
      const isPlainEnvDir =
        (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'envDir';
      const isComputedEnvDir =
        ts.isComputedPropertyName(name) &&
        ts.isStringLiteral(name.expression) &&
        name.expression.text === 'envDir';
      return isPlainEnvDir || isComputedEnvDir ? [{ property, index, isComputedEnvDir }] : [];
    });

    expect(envDirEntries).toHaveLength(1);
    const [envDir] = envDirEntries;
    expect(envDir?.isComputedEnvDir).toBe(false);
    expect(envDir && ts.isPropertyAssignment(envDir.property)).toBe(true);
    if (!envDir || !ts.isPropertyAssignment(envDir.property)) return;

    expect(envDir.property.initializer.kind).toBe(ts.SyntaxKind.FalseKeyword);
    const hasLaterPossibleOverride = config.properties.slice(envDir.index + 1).some((property) =>
      ts.isSpreadAssignment(property) ||
      ('name' in property && Boolean(property.name && ts.isComputedPropertyName(property.name))),
    );
    expect(hasLaterPossibleOverride).toBe(false);
  });
});
