import { randomUUID } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import { canonicalAccountFixture } from '../../src/test/canonicalAccountFixture';
import {
  addGuideDaySchema, addGuideDayItemSchema, createGuideSectionSchema, guideAggregateDtoSchema, guideEmptySectionBlocks,
  guideRevisionSchema, moveGuideDayItemSchema, moveGuideDaySchema, setGuideNoteTextSchema, setGuideTimeLabelSchema,
  writeGuideDetailsSchema, type GuideAggregateDto, type GuideDayItem, type GuideSectionDto,
} from '../../../tunes/shared/explorersGuideContract';
import { createCollectionSchema, createCollectionResultSchema } from '../../../tunes/shared/explorersContract';
import * as owner from '../../../tunes/shared/explorersOwnerContentContract';

// WP9 trip editor fixture. A stateful, in-memory stand-in for the canonical Guides API: the
// owner content bracket (snapshot, collection pages, editable reads), the guide aggregate and
// every day/item command. It holds one category revision, as the server does, so the owner
// read's revision checks hold and a stale command is refused with 409. State lives in the test
// process, so a page reload reads back exactly what the commands wrote.
// Everything it does not own falls through to the contained routes behind it.

type Guide = { id: string; title: string; slug: string; revision: number; publicationState: 'draft' | 'published';
  details: GuideAggregateDto['details']; sections: GuideSectionDto[] };

const emptyDetails = (): GuideAggregateDto['details'] => ({ guideType: null, multiCity: false, numberOfDays: null, estimatedBudget: null,
  budgetCurrency: null, budgetType: null, budgetTier: null, startDate: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null,
  place: {}, locationEntityId: null });

export function createGuidesEditorFixture() {
  let revision = 1;
  const guides: Guide[] = [];
  const commands: string[] = [];
  const accountId = () => canonicalAccountFixture().id;
  const now = () => new Date().toISOString();
  // A snapshot and every page read under it must report the same expiry, so it is fixed per revision.
  const expiries = new Map<number, number>();
  const common = () => {
    if (!expiries.has(revision)) expiries.set(revision, Date.now() + 10 * 60_000);
    return { version: 'explorers-owner-content/v2' as const, snapshotToken: `guides-editor-${revision}`, expiresAt: expiries.get(revision)! };
  };
  const row = (guide: Guide, displayOrder: number) => owner.ownerCollectionDtoSchema.parse({ id: guide.id, accountId: accountId(), category: 'guides',
    title: guide.title, slug: guide.slug, visibility: 'private', publicationState: guide.publicationState, revision: guide.revision,
    description: null, heading: null, coverMediaId: null, archived: false, displayOrder });
  const aggregate = (guide: Guide) => guideAggregateDtoSchema.parse({ collectionId: guide.id, revision, details: guide.details, coverMediaId: null,
    sections: guide.sections.map((section, displayOrder) => ({ ...section, displayOrder })), sectionCount: guide.sections.length, nextCursor: null });
  const newSection = (guide: Guide, title = '', blocks = guideEmptySectionBlocks): GuideSectionDto => ({ id: randomUUID(), collectionId: guide.id,
    title, description: null, displayOrder: 0, blocks: structuredClone(blocks), archived: false, createdAt: now(), updatedAt: now() });
  const section = (guide: Guide, id: string) => guide.sections.find(s => s.id === id);
  const freshItem = (input: ReturnType<typeof addGuideDayItemSchema.parse>['item']): GuideDayItem => {
    const localId = randomUUID();
    if (input.kind === 'note') return { kind: 'note', localId, timeLabel: input.timeLabel, text: input.text };
    if (input.kind === 'place') return { kind: 'place', localId, timeLabel: input.timeLabel, place: { ...input.place, localId } };
    throw new Error('This fixture has no saved list items');
  };

  async function handle(route: Route) {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const path = url.pathname.slice('/api/explorers/v1'.length);
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const fail = (status: number, code: string) => json(status, { error: { code, message: 'Guides editor fixture refused the request', requestId: 'guides-editor' } });
    const params = Object.fromEntries(url.searchParams);

    // Owner search for "From my lists": no saved items in this fixture, so every category answers an empty page.
    if (path === '/recommendations/search') return json(200, {
      version: 'explorers-search/v1', expiresAt: Date.now() + 60_000, nextCursor: null,
      scope: 'owner', snapshot: '1', snapshotToken: 'guides-editor', items: [],
    });

    if (method === 'GET') {
      if (path === '/categories/guides/content-snapshot' || path === '/categories/guides/content-snapshot/validate') {
        if (params.snapshotToken && params.snapshotToken !== common().snapshotToken) return fail(409, 'CONFLICT');
        return json(200, owner.ownerSnapshotSchema.parse({ ...common(), revision: String(revision), pinRevision: 1 }));
      }
      const page = (items: unknown[], extra: Record<string, unknown> = {}) => {
        if (params.snapshotToken && params.snapshotToken !== common().snapshotToken) return fail(409, 'CONFLICT');
        return json(200, { ...common(), snapshot: String(revision), items, nextCursor: null, ...extra });
      };
      if (path === '/collections' && params.category === 'guides') return page(params.status === 'archived' ? [] : guides.map(row));
      if (path === '/recommendations' && params.category === 'guides') return page([]);
      if (path === '/categories/guides/memberships') return page([]);
      if (path === '/categories/guides/top-picks') return page([], { pinRevision: 1 });
      const editable = /^\/collections\/([0-9a-f-]{36})\/editable$/.exec(path);
      const read = /^\/collections\/([0-9a-f-]{36})\/guide$/.exec(path);
      const target = (editable ?? read) && guides.find(g => g.id === (editable ?? read)![1]);
      if (editable && target) return json(200, { collection: owner.editableOwnerCollectionSchema.parse({ ...row(target, guides.indexOf(target)),
        categoryRevision: String(revision), pinOrder: null, linkedLists: [] }) });
      if (read && target) return json(200, { guide: aggregate(target) });
      return route.fallback();
    }

    if (method === 'POST' && path === '/collections') {
      const input = createCollectionSchema.parse(request.postDataJSON());
      if (input.category !== 'guides') return route.fallback();
      const guide: Guide = { id: randomUUID(), title: input.title, slug: input.slug, revision: 1, publicationState: 'draft', details: emptyDetails(), sections: [] };
      guides.push(guide); revision += 1; commands.push('create guide');
      // The create receipt is the core collection: the owner row minus archived and displayOrder.
      return json(201, { collection: createCollectionResultSchema.strip().parse(row(guide, guides.length - 1)) });
    }

    const match = /^\/collections\/([0-9a-f-]{36})\/guide(\/.*)?$/.exec(path);
    const guide = match && guides.find(g => g.id === match[1]);
    if (!match || !guide) return route.fallback();
    const suffix = match[2] ?? '', body = request.postDataJSON() ?? {};
    if (body.revision !== revision) return fail(409, 'CONFLICT');
    const day = /^\/days\/([0-9a-f-]{36})/.exec(suffix)?.[1];
    const daySection = day ? section(guide, day) : undefined;
    if (day && !daySection) return fail(404, 'NOT_FOUND');
    const itemMatch = /^\/days\/[0-9a-f-]{36}\/items\/([^/]+)(\/[a-z-]+)?$/.exec(suffix);
    const itemIndex = itemMatch && daySection ? daySection.blocks.items.findIndex(i => i.localId === decodeURIComponent(itemMatch[1])) : -1;
    if (itemMatch && itemIndex < 0) return fail(404, 'NOT_FOUND');
    const touch = (s: GuideSectionDto) => { s.updatedAt = now(); };
    let name = `${method} ${suffix || '/'}`;

    if (method === 'PUT' && suffix === '') { guide.details = writeGuideDetailsSchema.parse(body).details; name = 'write details'; }
    else if (method === 'POST' && suffix === '/days') {
      const input = addGuideDaySchema.parse(body);
      guide.sections.splice(input.at ?? guide.sections.length, 0, newSection(guide, input.title));
    }
    else if (method === 'POST' && suffix === '/sections') {
      const input = createGuideSectionSchema.parse(body);
      const created = newSection(guide, input.title, input.blocks); created.description = input.description;
      guide.sections.splice(input.position ?? guide.sections.length, 0, created);
    }
    else if (daySection && method === 'PATCH' && suffix.endsWith('/position') && !itemMatch) {
      const input = moveGuideDaySchema.parse(body);
      guide.sections.splice(guide.sections.indexOf(daySection), 1); guide.sections.splice(input.toIndex, 0, daySection);
    }
    else if (daySection && method === 'POST' && suffix.endsWith('/duplicate')) {
      guideRevisionSchema.parse(body);
      const copy = newSection(guide, daySection.title, { ...daySection.blocks, items: daySection.blocks.items.map(i => ({ ...i, localId: randomUUID(),
        ...(i.kind === 'place' ? { place: { ...i.place } } : {}) })).map(i => i.kind === 'place' ? { ...i, place: { ...i.place, localId: i.localId } } : i) });
      guide.sections.splice(guide.sections.indexOf(daySection) + 1, 0, copy);
    }
    else if (daySection && method === 'POST' && suffix.endsWith('/clear')) { guideRevisionSchema.parse(body); daySection.blocks.items = []; touch(daySection); }
    else if (daySection && method === 'DELETE' && !itemMatch) {
      guideRevisionSchema.parse(body);
      if (guide.sections.length <= 1) return fail(409, 'CONFLICT');
      guide.sections.splice(guide.sections.indexOf(daySection), 1);
    }
    else if (daySection && method === 'POST' && suffix.endsWith('/items')) {
      const input = addGuideDayItemSchema.parse(body);
      daySection.blocks.items.splice(input.at ?? daySection.blocks.items.length, 0, freshItem(input.item)); touch(daySection);
    }
    else if (daySection && itemMatch && method === 'PATCH' && itemMatch[2] === '/position') {
      const input = moveGuideDayItemSchema.parse(body), to = section(guide, input.toSectionId);
      if (!to) return fail(404, 'NOT_FOUND');
      const [moved] = daySection.blocks.items.splice(itemIndex, 1);
      to.blocks.items.splice(Math.min(input.toIndex, to.blocks.items.length), 0, moved); touch(daySection); touch(to);
    }
    else if (daySection && itemMatch && method === 'PUT' && itemMatch[2] === '/time-label') {
      daySection.blocks.items[itemIndex] = { ...daySection.blocks.items[itemIndex], timeLabel: setGuideTimeLabelSchema.parse(body).timeLabel }; touch(daySection);
    }
    else if (daySection && itemMatch && method === 'PUT' && itemMatch[2] === '/note') {
      const current = daySection.blocks.items[itemIndex];
      if (current.kind !== 'note') return fail(422, 'INVALID_INPUT');
      daySection.blocks.items[itemIndex] = { ...current, text: setGuideNoteTextSchema.parse(body).text }; touch(daySection);
    }
    else if (daySection && itemMatch && method === 'DELETE' && !itemMatch[2]) {
      guideRevisionSchema.parse(body); daySection.blocks.items.splice(itemIndex, 1); touch(daySection);
    }
    else return fail(404, 'NOT_FOUND');
    revision += 1; commands.push(name);
    return json(200, { guide: aggregate(guide) });
  }

  return {
    commands, guides,
    async install(page: Page) {
      await page.route('**/api/explorers/v1/**', handle);
      // The smart box's Google group: Places (New) text search, answered with no results so
      // Enter on typed text always falls through to "Add as a note".
      await page.route('https://places.googleapis.com/v1/places:searchText', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"places":[]}' }));
    },
  };
}
