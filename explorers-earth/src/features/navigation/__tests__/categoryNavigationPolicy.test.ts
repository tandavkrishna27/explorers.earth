import { describe, expect, it } from 'vitest';
import {
  CATEGORY_IDS,
  planCategoryIntent,
  type CategoryId,
  type NavigationSnapshot,
} from '../categoryNavigationPolicy';

const PROFILE = 'public_profile';

function snapshotFor(
  category: CategoryId,
  visibility: 'Yes' | 'No' | null,
  saved: boolean,
  autoPinning: boolean,
): NavigationSnapshot {
  return {
    scope: { userDocumentId: 'u1', accountDocumentId: 'a1' },
    visibility: Object.fromEntries(CATEGORY_IDS.map((id) => [id, id === category ? visibility : 'Yes'])) as NavigationSnapshot['visibility'],
    savedPins: saved ? [PROFILE, category] : [PROFILE],
    autoPinning,
  };
}

const stateConfigurations = CATEGORY_IDS.flatMap((category) =>
  (['Yes', 'No', null] as const).flatMap((visibility) =>
    [true, false].flatMap((saved) =>
      [true, false].map((autoPinning) => ({ category, visibility, saved, autoPinning })),
    ),
  ),
);

describe('planCategoryIntent', () => {
  it.each(stateConfigurations)(
    'publishes $category from $visibility / saved=$saved / auto=$autoPinning without changing pins',
    ({ category, visibility, saved, autoPinning }) => {
      const result = planCategoryIntent(snapshotFor(category, visibility, saved, autoPinning), { category, action: 'publish' });

      expect(result).toEqual(visibility === 'Yes'
        ? { kind: 'noop' }
        : { kind: 'write', patch: { [category]: 'Yes' } });
    },
  );

  it.each(stateConfigurations)(
    'unpublishes $category from $visibility / saved=$saved / auto=$autoPinning by removing only its saved pin',
    ({ category, visibility, saved, autoPinning }) => {
      const result = planCategoryIntent(snapshotFor(category, visibility, saved, autoPinning), { category, action: 'unpublish' });

      if (visibility === 'No' && !saved) {
        expect(result).toEqual({ kind: 'noop' });
      } else if (saved) {
        expect(result).toEqual({ kind: 'write', patch: { [category]: 'No', pinned_nav_tabs: [PROFILE] } });
      } else {
        expect(result).toEqual({ kind: 'write', patch: { [category]: 'No' } });
      }
    },
  );

  it.each(stateConfigurations)(
    'unpins $category from $visibility / saved=$saved / auto=$autoPinning without changing publication',
    ({ category, visibility, saved, autoPinning }) => {
      const result = planCategoryIntent(snapshotFor(category, visibility, saved, autoPinning), { category, action: 'unpin' });

      expect(result).toEqual(saved
        ? { kind: 'write', patch: { pinned_nav_tabs: [PROFILE] } }
        : { kind: 'noop' });
    },
  );

  it.each(stateConfigurations)(
    'pins $category from $visibility / saved=$saved / auto=$autoPinning without publishing it',
    ({ category, visibility, saved, autoPinning }) => {
      const result = planCategoryIntent(snapshotFor(category, visibility, saved, autoPinning), { category, action: 'pin' });

      if (saved) {
        expect(result).toEqual({ kind: 'noop' });
      } else if (visibility !== 'Yes') {
        expect(result).toEqual({ kind: 'blocked', reason: 'not-public' });
      } else if (autoPinning) {
        expect(result).toEqual({ kind: 'blocked', reason: 'manual-required' });
      } else {
        expect(result).toEqual({ kind: 'write', patch: { pinned_nav_tabs: [PROFILE, category] } });
      }
    },
  );

  it('emits the exact combined unpublish cleanup, exact unpin cleanup, and blocked hidden pin mutations', () => {
    const snapshot: NavigationSnapshot = {
      scope: { userDocumentId: 'u1', accountDocumentId: 'a1' }, autoPinning: false,
      visibility: Object.fromEntries(CATEGORY_IDS.map((id) => [id, 'Yes'])) as NavigationSnapshot['visibility'],
      savedPins: ['public_profile', 'public_music', 'public_books'],
    };

    expect(planCategoryIntent(snapshot, { category: 'public_books', action: 'unpublish' }))
      .toEqual({ kind: 'write', patch: { public_books: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } });
    expect(planCategoryIntent(snapshot, { category: 'public_books', action: 'unpin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_music'] } });
    expect(planCategoryIntent({ ...snapshot, visibility: { ...snapshot.visibility, public_games: 'No' } },
      { category: 'public_games', action: 'pin' })).toEqual({ kind: 'blocked', reason: 'not-public' });
  });

  // Content no longer reaches this decision at all: planCategoryIntent takes no
  // eligibility, so an owner may publish and pin a category whose producer we have
  // not built. Previously both blocked, which made our own gap look like the
  // owner's control failing. Settings still labels such a category "No content".
  it('permits publishing a category with no content behind it', () => {
    expect(planCategoryIntent(snapshotFor('public_books', 'No', false, false), { category: 'public_books', action: 'publish' }))
      .toEqual({ kind: 'write', patch: { public_books: 'Yes' } });
  });

  it('permits a new pin for a visible category with no content behind it', () => {
    expect(planCategoryIntent(snapshotFor('public_books', 'Yes', false, false), { category: 'public_books', action: 'pin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_books'] } });
  });

  it('allows explicit cleanup despite an unknown availability read', () => {
    const saved = snapshotFor('public_books', 'No', true, true);
    expect(planCategoryIntent(saved, { category: 'public_books', action: 'unpublish' }))
      .toEqual({ kind: 'write', patch: { public_books: 'No', pinned_nav_tabs: [PROFILE] } });
    expect(planCategoryIntent(saved, { category: 'public_books', action: 'unpin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: [PROFILE] } });
  });

  it('uses five slots including Profile, with one- and four-slot additions still available', () => {
    const base = snapshotFor('public_books', 'Yes', false, false);
    expect(planCategoryIntent(base, { category: 'public_books', action: 'pin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_books'] } });
    expect(planCategoryIntent({ ...base, savedPins: ['public_profile', 'public_music', 'public_guides', 'public_movie'] },
      { category: 'public_books', action: 'pin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_music', 'public_guides', 'public_movie', 'public_books'] } });
    expect(planCategoryIntent({ ...base, savedPins: ['public_profile', 'public_music', 'public_guides', 'public_movie', 'public_games'] },
      { category: 'public_books', action: 'pin' }))
      .toEqual({ kind: 'blocked', reason: 'slot-limit' });
  });

  it('does not repair overfull, duplicate, or unknown legacy arrays while removing only the requested target', () => {
    const base = snapshotFor('public_books', 'No', false, false);
    const legacy = ['public_profile', 'unknown', 'public_music', 'public_books', 'public_music', 'public_guides'];
    expect(planCategoryIntent({ ...base, savedPins: legacy }, { category: 'public_books', action: 'unpublish' }))
      .toEqual({ kind: 'write', patch: { public_books: 'No', pinned_nav_tabs: ['public_profile', 'unknown', 'public_music', 'public_music', 'public_guides'] } });
    expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins: ['public_profile', 'public_music', 'public_guides', 'public_movie', 'public_games', 'public_apps'] },
      { category: 'public_books', action: 'pin' })).toEqual({ kind: 'blocked', reason: 'slot-limit' });
    expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins: ['public_profile', 'public_music', 'public_music'] },
      { category: 'public_books', action: 'pin' })).toEqual({ kind: 'blocked', reason: 'invalid-pins' });
    expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins: ['public_profile', 'unknown'] },
      { category: 'public_books', action: 'pin' })).toEqual({ kind: 'blocked', reason: 'invalid-pins' });
  });

  it('initializes fresh null or empty pin storage without inventing cleanup', () => {
    const base = snapshotFor('public_books', 'No', false, false);
    for (const savedPins of [null, []]) {
      expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins },
        { category: 'public_books', action: 'unpublish' }))
        .toEqual({ kind: 'write', patch: { public_books: 'No' } });
      expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins },
        { category: 'public_books', action: 'pin' }))
        .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_books'] } });
      expect(planCategoryIntent({ ...base, savedPins }, { category: 'public_books', action: 'unpin' }))
        .toEqual({ kind: 'noop' });
    }
  });

  it('keeps visibility cleanup safe when pin storage is malformed', () => {
    const base = snapshotFor('public_books', 'No', false, false);
    for (const savedPins of [['public_profile', 12], { tabs: ['public_books'] }, undefined]) {
      expect(planCategoryIntent({ ...base, savedPins }, { category: 'public_books', action: 'unpublish' }))
        .toEqual({ kind: 'write', patch: { public_books: 'No' }, cleanupPending: true });
      expect(planCategoryIntent({ ...base, visibility: { ...base.visibility, public_books: 'Yes' }, savedPins },
        { category: 'public_books', action: 'pin' })).toEqual({ kind: 'blocked', reason: 'invalid-pins' });
      expect(planCategoryIntent({ ...base, savedPins }, { category: 'public_books', action: 'unpin' }))
        .toEqual({ kind: 'blocked', reason: 'invalid-pins' });
    }
  });

  it('rejects a runtime Profile intent and does not modify the caller snapshot while handling a Music outage', () => {
    const snapshot: NavigationSnapshot = {
      ...snapshotFor('public_books', 'Yes', true, true),
      savedPins: Object.freeze(['public_profile', 'public_music', 'public_books']),
    };
    expect(planCategoryIntent(snapshot, { category: 'public_profile' as CategoryId, action: 'unpin' }))
      .toEqual({ kind: 'blocked', reason: 'invalid-pins' });
    expect(planCategoryIntent(snapshot, { category: 'public_books', action: 'unpin' }))
      .toEqual({ kind: 'write', patch: { pinned_nav_tabs: ['public_profile', 'public_music'] } });
    expect(snapshot.savedPins).toEqual(['public_profile', 'public_music', 'public_books']);
  });
});
