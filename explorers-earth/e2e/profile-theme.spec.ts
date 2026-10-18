import { test, expect } from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';
import { profileBatchPublicOrder as expectedPublicOrderForRow } from './setup/profile-batch-order';
import { LIVE_READ_ONLY_TAG } from '../scripts/music-public-live-preflight.mjs';

const FACTORS = {
  preset: [
    'cinematic-dark',
    'glassmorphism',
    'sunset-glow',
    'minimal-light',
    'emerald-nature',
    'neon-cyber',
  ],
  accent: [
    '#10B981',
    '#38BDF8',
    '#EC4899',
    '#8B5CF6',
    '#F59E0B',
    '#F43F5E',
  ],
  wallpaper: [
    'banner-top',
    'full-wallpaper-image',
    'ambient-gradient',
    'solid-color',
  ],
  firstView: [
    'all-recommendations',
    'places',
    'movies',
    'books',
    'games',
    'guides',
    'apps',
    'products',
    'people',
    'gallery',
    'business',
  ],
  layout: ['shelves', 'grid', 'featured'],
  orderShape: ['canonical', 'reverse', 'rotate', 'preferred-first'],
} as const;

type FactorName = keyof typeof FACTORS;
type CoveringRow = { [Name in FactorName]: (typeof FACTORS)[Name][number] };

const FACTOR_NAMES = Object.keys(FACTORS) as FactorName[];

const pairKey = (
  leftName: FactorName,
  leftValue: string,
  rightName: FactorName,
  rightValue: string,
) => `${leftName}=${leftValue}|${rightName}=${rightValue}`;

const rowPairs = (row: CoveringRow) => {
  const pairs: string[] = [];
  for (let left = 0; left < FACTOR_NAMES.length; left += 1) {
    for (let right = left + 1; right < FACTOR_NAMES.length; right += 1) {
      const leftName = FACTOR_NAMES[left];
      const rightName = FACTOR_NAMES[right];
      pairs.push(pairKey(leftName, row[leftName], rightName, row[rightName]));
    }
  }
  return pairs;
};

const allRows = () => {
  const rows: CoveringRow[] = [];
  const build = (index: number, partial: Partial<CoveringRow>) => {
    if (index === FACTOR_NAMES.length) {
      rows.push(partial as CoveringRow);
      return;
    }
    const name = FACTOR_NAMES[index];
    for (const value of FACTORS[name]) {
      build(index + 1, { ...partial, [name]: value });
    }
  };
  build(0, {});
  return rows;
};

const allRequiredPairs = () => {
  const required = new Set<string>();
  for (let left = 0; left < FACTOR_NAMES.length; left += 1) {
    for (let right = left + 1; right < FACTOR_NAMES.length; right += 1) {
      const leftName = FACTOR_NAMES[left];
      const rightName = FACTOR_NAMES[right];
      for (const leftValue of FACTORS[leftName]) {
        for (const rightValue of FACTORS[rightName]) {
          required.add(pairKey(leftName, leftValue, rightName, rightValue));
        }
      }
    }
  }
  return required;
};

const generateCoveringArray = (): CoveringRow[] => {
  const candidates = allRows().map((row) => ({ row, pairs: rowPairs(row) }));
  const uncovered = allRequiredPairs();
  const selected: CoveringRow[] = [];

  while (uncovered.size > 0) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      const score = candidates[index].pairs.reduce(
        (total, pair) => total + Number(uncovered.has(pair)),
        0,
      );
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    if (bestIndex < 0 || bestScore <= 0) {
      throw new Error(`Unable to cover ${uncovered.size} remaining pairs`);
    }

    const [best] = candidates.splice(bestIndex, 1);
    selected.push(best.row);
    best.pairs.forEach((pair) => uncovered.delete(pair));
  }

  return selected;
};

const batchCoveringRows = (rows: readonly CoveringRow[]) => {
  const batches: CoveringRow[][] = [];
  for (let index = 0; index < rows.length; index += 12) {
    batches.push(rows.slice(index, index + 12));
  }
  return batches;
};

class ConcurrentProfileChangeError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Profile changed outside this test (expected updatedAt=${expected}, actual=${actual}); refusing to overwrite it`,
    );
    this.name = 'ConcurrentProfileChangeError';
  }
}

async function restoreWithEmergency({
  normalRestore,
  emergencyRestore,
  verify,
}: {
  normalRestore: () => Promise<void>;
  emergencyRestore: () => Promise<void>;
  verify: () => Promise<void>;
}) {
  let normalRestoreCompleted = false;
  try {
    await normalRestore();
    normalRestoreCompleted = true;
    await verify();
  } catch (normalRestoreError) {
    if (normalRestoreCompleted) throw normalRestoreError;
    if (normalRestoreError instanceof ConcurrentProfileChangeError) {
      throw normalRestoreError;
    }
    await emergencyRestore();
    await verify();
    throw normalRestoreError;
  }
}

test('restore guard uses one emergency cleanup and preserves the original failure', { tag: LIVE_READ_ONLY_TAG }, async () => {
  const originalFailure = new Error('normal restore failed');
  let emergencyCalls = 0;
  let verificationCalls = 0;

  await expect(
    restoreWithEmergency({
      normalRestore: async () => {
        throw originalFailure;
      },
      emergencyRestore: async () => {
        emergencyCalls += 1;
      },
      verify: async () => {
        verificationCalls += 1;
      },
    }),
  ).rejects.toBe(originalFailure);
  expect(emergencyCalls).toBe(1);
  expect(verificationCalls).toBe(1);
});

test('restore guard never performs an emergency write after a confirmed normal restore', { tag: LIVE_READ_ONLY_TAG }, async () => {
  const verificationFailure = new Error('restore verification failed');
  let emergencyCalls = 0;

  await expect(
    restoreWithEmergency({
      normalRestore: async () => undefined,
      emergencyRestore: async () => {
        emergencyCalls += 1;
      },
      verify: async () => {
        throw verificationFailure;
      },
    }),
  ).rejects.toBe(verificationFailure);
  expect(emergencyCalls).toBe(0);
});

test('restore guard refuses every write after a concurrent profile change', { tag: LIVE_READ_ONLY_TAG }, async () => {
  let emergencyCalls = 0;
  const conflict = new ConcurrentProfileChangeError('before', 'after');

  await expect(
    restoreWithEmergency({
      normalRestore: async () => {
        throw conflict;
      },
      emergencyRestore: async () => {
        emergencyCalls += 1;
      },
      verify: async () => undefined,
    }),
  ).rejects.toBe(conflict);
  expect(emergencyCalls).toBe(0);
});

test('covering array dry run proves all values and all factor pairs', { tag: LIVE_READ_ONLY_TAG }, () => {
  const matrix = generateCoveringArray();
  const repeated = generateCoveringArray();
  const coveredPairs = new Set(matrix.flatMap(rowPairs));
  const requiredPairs = allRequiredPairs();

  expect(repeated).toEqual(matrix);
  // Pairwise lower bound: the two largest factors (11 first views x 6 accents).
  expect(matrix.length).toBeGreaterThanOrEqual(FACTORS.firstView.length * FACTORS.accent.length);
  expect(coveredPairs.size).toBe(requiredPairs.size);
  for (const pair of requiredPairs) expect(coveredPairs).toContain(pair);

  for (const name of FACTOR_NAMES) {
    expect(new Set(matrix.map((row) => row[name]))).toEqual(
      new Set(FACTORS[name]),
    );
  }

  expect(
    matrix.some(
      (row) => row.layout === 'shelves' && row.orderShape === 'reverse',
    ),
  ).toBe(true);
  expect(
    matrix.some((row) => row.layout === 'grid' && row.orderShape === 'rotate'),
  ).toBe(true);
  expect(
    matrix.some(
      (row) =>
        row.layout === 'featured' && row.orderShape === 'preferred-first',
    ),
  ).toBe(true);

  const measuredPublishBudgetSeconds = 8;
  const preflightAndVerificationBudgetSeconds = 300;
  const batches = batchCoveringRows(matrix);
  const normalPublishCount = matrix.length + batches.length * 2;
  const estimatedSeconds =
    normalPublishCount * measuredPublishBudgetSeconds +
    preflightAndVerificationBudgetSeconds;
  console.info(
    `covering-array rows=${matrix.length} batches=${batches.length} matrix-publishes=${matrix.length} ` +
      `normal-total-publishes=${normalPublishCount} optional-emergency-publishes=1 ` +
      `estimated-minutes=${Math.ceil(estimatedSeconds / 60)}`,
  );
});

test('live matrix is split into ordered batches of at most twelve rows', { tag: LIVE_READ_ONLY_TAG }, () => {
  const matrix = generateCoveringArray();
  const batches = batchCoveringRows(matrix);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every((batch) => batch.length <= 12)).toBe(true);
  expect(batches.flat()).toEqual(matrix);
});

test('live row oracle promotes a category first view independently of saved order', { tag: LIVE_READ_ONLY_TAG }, () => {
  expect(expectedPublicOrderForRow('reverse', 'places')).toEqual([
    'places',
    'people',
    'products',
    'apps',
    'guides',
    'games',
    'books',
    'movies',
  ]);
});

test.describe('Public Profile Theme & Customization E2E', { tag: LIVE_READ_ONLY_TAG }, () => {
  test('renders homepage, navigation, and theme system elements', async ({ context, page }) => {
    // 1. Visit homepage
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Check if explorers.earth branding header is visible
    const logo = page.locator('text=explorers.earth');
    await expect(logo.first()).toBeVisible();

    // 3. Authenticate before visiting the protected profile route.
    await setupMockAuthentication(context);
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    // Page loaded successfully
    expect(page.url()).toContain('/profile');
  });
});
