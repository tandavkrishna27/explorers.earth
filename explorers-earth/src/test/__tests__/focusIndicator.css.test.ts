import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(__dirname, '../..');
const css = readFileSync(join(srcRoot, 'index.css'), 'utf8');
const allCss = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? allCss(p) : p.endsWith('.css') ? [readFileSync(p, 'utf8')] : [];
  });
const everyCss = allCss(srcRoot).join('\n');

describe('global keyboard focus indicator (XC-02 / XC-X02)', () => {
  it('is not wrapped in :where(), so it out-ranks Tailwind outline-none utilities', () => {
    const rule = css.split('\n').find((l) => /\):focus-visible/.test(l) && l.includes('[role="tab"]'));
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/:where\(/);
    // repeated pseudo-class raises specificity above .focus\:outline-none:focus
    expect(rule).toMatch(/:focus-visible:focus-visible/);
    expect(rule).toContain('a,');
    expect(rule).toContain('button');
    expect(rule).toContain('input');
  });

  it('never sets an outline from a custom property that is not defined', () => {
    const defined = new Set([...everyCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = [...css.matchAll(/outline(?:-color)?\s*:[^;{}]*var\((--[\w-]+)/g)].map((m) => m[1]);
    // --text-primary and friends are injected at runtime by the theme presets (themePresets.ts).
    const runtime = new Set(['--text-primary']);
    const missing = used.filter((v) => !defined.has(v) && !runtime.has(v));
    expect(missing).toEqual([]);
  });
});
