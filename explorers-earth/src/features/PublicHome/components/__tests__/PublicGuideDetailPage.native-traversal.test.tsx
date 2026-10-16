import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, expect, it, vi } from 'vitest';
import PublicGuideDetailPage from '../PublicGuideDetailPage';
import { PublicHeaderDescriptorProvider } from '../PublicHeaderDescriptorContext';
import { createPublicProfileGatewayClient, publicProfileGatewayClient } from '../../api/publicProfileGatewayClient';
import { buildGuidesSeedPlan, GUIDES_CASES } from '../../../../../../tunes/scripts/guides-browser-support';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { act } from '@testing-library/react';
import { errors } from '@playwright/test';
import { types as nativeTypes } from 'node:util';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('the actual public guide page retains 53 sections; native auto/manual race=%s', async automaticRace => {
  // Native DOM constructors rather than the shared arrow-function mocks: the real
  // continuation and geometry effects instantiate these browser APIs.
  const observers = new Set<{ callback: IntersectionObserverCallback; target?: Element }>();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(readonly callback: IntersectionObserverCallback) { observers.add(this); }
    target?: Element;
    observe(target: Element) { this.target = target; }
    unobserve() { this.target = undefined; }
    disconnect() { observers.delete(this); }
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const seed = buildGuidesSeedPlan(GUIDES_CASES[4]);
  const selected = seed.guides[0];
  const sections = seed.sections.filter(section => section.guideKey === selected.key).map(section => ({
    documentId: section.key, Title: section.title, Sequence: section.displayOrder + 1,
    Description: section.description, Timeline: section.blocks.timeline, Transport: section.blocks.transport,
    Stay: section.blocks.stay, Recommendation_Activity: section.blocks.activities, Budget: section.blocks.budget,
    Map_Details: section.blocks.mapDetails, Packing_List: section.blocks.packingList.items,
    Pre_Tasks: section.blocks.preTasks.items, Section_tags: section.blocks.tags,
  }));
  expect(sections).toHaveLength(53);
  const completedOffsets: number[] = [];
  const client = createPublicProfileGatewayClient('http://127.0.0.1:55001', async (input, init) => {
    const url = new URL(String(input));
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (url.pathname === '/api/explorers/v1/profiles/reader') return new Response(JSON.stringify({ username: 'reader' }), { status: 200 });
    expect(url.pathname).toBe('/api/explorers/v1/profiles/reader/recommendations/guides/guide-1');
    const offset = Number(url.searchParams.get('cursor')?.slice(1) ?? 0);
    expect(url.searchParams.get('limit')).toBe(offset === 0 ? null : '12');
    completedOffsets.push(offset);
    return new Response(JSON.stringify({ guides: [{
      documentId: selected.key, Title: selected.title, slug: selected.slug, Description: '',
      Guide_Type: selected.details.guideType, Number_Of_Days: selected.details.numberOfDays,
      Guide_Media: [], guide_sections: sections.slice(offset, offset + 12),
      guide_sections_next_cursor: offset + 12 < sections.length ? `o${offset + 12}` : null,
    }] }), { status: 200 });
  });
  vi.spyOn(publicProfileGatewayClient, 'shell').mockImplementation(client.shell);
  vi.spyOn(publicProfileGatewayClient, 'detail').mockImplementation(client.detail);
  vi.spyOn(publicProfileGatewayClient, 'detailPage').mockImplementation(client.detailPage);
  render(<StrictMode><HelmetProvider><MemoryRouter initialEntries={['/reader/guides/guide-1']}>
    <PublicHeaderDescriptorProvider username="reader"><Routes><Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} /></Routes></PublicHeaderDescriptorProvider>
  </MemoryRouter></HelmetProvider></StrictMode>);
  await screen.findByRole('button', { name: 'Day 12', exact: true });
  for (const last of automaticRace ? [24, 36, 48] : [24, 36, 48, 53]) {
    const buttons = screen.getAllByRole('button', { name: 'Load more days', exact: true });
    const enabled = buttons.find(button => !(button as HTMLButtonElement).disabled);
    expect(enabled).toBeDefined();
    fireEvent.click(enabled!);
    await screen.findByRole('button', { name: `Day ${last}`, exact: true });
  }
  if (automaticRace) {
    const source = readFileSync('e2e/replatform/guides.spec.ts', 'utf8');
    const ast = ts.createSourceFile('guides.ts', source, ts.ScriptTarget.Latest, true);
    const helper = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'nativeGuideContinuation')!;
    let staleClick = false;
    const locator = {
      filter() { return this; }, first() { return this; },
      async scrollIntoViewIfNeeded() {},
      async isVisible() { return screen.queryAllByRole('button', { name: 'Load more days', exact: true }).length > 0; },
      async count() { return screen.queryAllByRole('button', { name: 'Load more days', exact: true }).length; },
      async isEnabled() {
        const enabled = screen.getAllByRole('button', { name: 'Load more days', exact: true }).some(button => !(button as HTMLButtonElement).disabled);
        // Native observation can finish the last page after the truthy enabled
        // observation, before Playwright begins resolving its awaited click.
        await act(async () => {
          for (const observer of [...observers]) if (observer.target?.isConnected) observer.callback([{ isIntersecting: true, target: observer.target } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
        });
        await screen.findByRole('button', { name: 'Day 53', exact: true });
        return enabled;
      },
      async click(options?: { timeout: number }) { staleClick = true; if (options) expect(options.timeout).toBe(15000); expect(screen.queryAllByRole('button', { name: 'Load more days', exact: true })).toHaveLength(0); throw new errors.TimeoutError('Synthetic missing native click target'); },
    };
    const nativeExpect = Object.assign((value: unknown) => ({
      toBe: (expected: unknown) => expect(value).toBe(expected),
      async toBeVisible() { expect(await locator.isVisible()).toBe(true); },
      async toHaveCount(count: number) { expect(screen.queryAllByRole('button', { name: 'Load more days', exact: true })).toHaveLength(count); },
    }), { poll: (work: () => Promise<boolean>) => ({ async toBe(expected: boolean) { await waitFor(async () => expect(await work()).toBe(expected)); } }) });
    const run = Function('expect', 'errors', 'nativeTypes', 'guidesNativeTimeoutPrototype', ts.transpileModule(helper.getText(ast) + '\nreturn nativeGuideContinuation;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(nativeExpect, errors, nativeTypes, errors.TimeoutError.prototype);
    await expect(run({ getByRole: () => locator }, 'days', async () => screen.queryAllByRole('button', { name: 'Day 53', exact: true }).length === 1, async () => screen.getAllByRole('button', { name: /^Day \d+$/ }).length)).resolves.toBeUndefined();
    expect(staleClick).toBe(true);
  }
  await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Load more days', exact: true })).toHaveLength(0));
  expect(screen.getAllByRole('button', { name: /^Day \d+$/ }).map(button => button.textContent)).toEqual(sections.map(section => `Day ${section.Sequence}`));
  // StrictMode may begin one superseded first request; every continuation is issued once.
  expect(completedOffsets.filter(offset => offset !== 0)).toEqual([12, 24, 36, 48]);
});

it.each([
  ['obstructed still-present control', true, 1, true],
  ['incomplete pagination', false, 0, true],
  ['ordinary failure after completion', true, 0, false],
] as const)('preserves the same native click failure for %s', async (_label, completed, controls, timeout) => {
  const source = readFileSync('e2e/replatform/guides.spec.ts', 'utf8');
  const config = readFileSync('e2e/replatform/guides.playwright.config.ts', 'utf8');
  expect(config).toContain('expect: { timeout: 15000 }');
  const ast = ts.createSourceFile('guides.ts', source, ts.ScriptTarget.Latest, true);
  const helper = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'nativeGuideContinuation')!;
  const original = timeout ? new errors.TimeoutError('Synthetic blocked control') : Error('Synthetic other failure');
  let clicked = false;
  const locator = { filter() { return this; }, first() { return this; }, async scrollIntoViewIfNeeded() {}, async isVisible() { return true; }, async isEnabled() { return true; }, async count() { return controls; }, async click(options: { timeout: number }) { expect(options).toEqual({ timeout: 15000 }); clicked = true; throw original; } };
  const nativeExpect = Object.assign(() => ({ async toBeVisible() {} }), { poll: () => ({ async toBe() { throw Error('Poll must not follow refused click'); } }) });
  const run = Function('expect', 'errors', 'nativeTypes', 'guidesNativeTimeoutPrototype', ts.transpileModule(helper.getText(ast) + '\nreturn nativeGuideContinuation;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(nativeExpect, errors, nativeTypes, errors.TimeoutError.prototype);
  await expect(run({ getByRole: () => locator }, 'days', async () => clicked && completed, async () => 48)).rejects.toBe(original);
  expect(clicked).toBe(true);
});

it.each(['completion', 'control-count'] as const)('retains the primary timeout when the %s witness cannot be read', async boundary => {
  const source = readFileSync('e2e/replatform/guides.spec.ts', 'utf8'), ast = ts.createSourceFile('guides.ts', source, ts.ScriptTarget.Latest, true);
  const helper = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'nativeGuideContinuation')!;
  const original = new errors.TimeoutError('Synthetic primary timeout');
  let clicked = false;
  const locator = { filter() { return this; }, first() { return this; }, async scrollIntoViewIfNeeded() {}, async isVisible() { return true; }, async isEnabled() { return true; }, async count() { throw Error('Synthetic unavailable count'); }, async click() { clicked = true; throw original; } };
  const nativeExpect = Object.assign(() => ({ async toBeVisible() {} }), { poll: () => ({ async toBe() { throw Error('Unexpected poll'); } }) });
  const run = Function('expect', 'errors', 'nativeTypes', 'guidesNativeTimeoutPrototype', ts.transpileModule(helper.getText(ast) + '\nreturn nativeGuideContinuation;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(nativeExpect, errors, nativeTypes, errors.TimeoutError.prototype);
  await expect(run({ getByRole: () => locator }, 'days', async () => { if (!clicked) return false; if (boundary === 'completion') throw Error('Synthetic unavailable completion'); return true; }, async () => 48)).rejects.toBe(original);
});

it.each(['proxy', 'getters', 'forged-prototype', 'subclass'] as const)('refuses %s without reading untrusted error properties or replacing the original', async shape => {
  const source = readFileSync('e2e/replatform/guides.spec.ts', 'utf8'), ast = ts.createSourceFile('guides.ts', source, ts.ScriptTarget.Latest, true);
  const helper = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'nativeGuideContinuation')!;
  let hooks = 0;
  class ForeignTimeout extends errors.TimeoutError {}
  const original = shape === 'proxy' ? new Proxy(Error('Synthetic proxy'), { getPrototypeOf() { hooks++; throw Error('Synthetic trap'); } })
    : shape === 'getters' ? Object.defineProperties({}, { name: { get() { hooks++; throw Error(); } }, message: { get() { hooks++; throw Error(); } } })
    : shape === 'forged-prototype' ? Object.create(errors.TimeoutError.prototype) : new ForeignTimeout('Synthetic subclass');
  let clicked = false;
  const locator = { filter() { return this; }, first() { return this; }, async scrollIntoViewIfNeeded() {}, async isVisible() { return true; }, async isEnabled() { return true; }, async count() { return 0; }, async click() { clicked = true; throw original; } };
  const nativeExpect = Object.assign(() => ({ async toBeVisible() {} }), { poll: () => ({ async toBe() { throw Error('Unexpected poll'); } }) });
  const run = Function('expect', 'errors', 'nativeTypes', 'guidesNativeTimeoutPrototype', ts.transpileModule(helper.getText(ast) + '\nreturn nativeGuideContinuation;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(nativeExpect, errors, nativeTypes, errors.TimeoutError.prototype);
  const result = await run({ getByRole: () => locator }, 'days', async () => clicked, async () => 48).catch((error: unknown) => error);
  expect(result).toBe(original); expect(hooks).toBe(0);
});
