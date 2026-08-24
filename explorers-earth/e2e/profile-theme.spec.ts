import {
  test,
  expect,
  type Page,
  type Request,
  type Response,
  type Route,
} from '@playwright/test';

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
    'music',
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

test('restore guard uses one emergency cleanup and preserves the original failure', async () => {
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

test('restore guard never performs an emergency write after a confirmed normal restore', async () => {
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

test('restore guard refuses every write after a concurrent profile change', async () => {
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

test('covering array dry run proves all values and all factor pairs', () => {
  const matrix = generateCoveringArray();
  const repeated = generateCoveringArray();
  const coveredPairs = new Set(matrix.flatMap(rowPairs));
  const requiredPairs = allRequiredPairs();

  expect(repeated).toEqual(matrix);
  expect(matrix.length).toBeGreaterThanOrEqual(72);
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
  expect(
    matrix.some(
      (row) => row.firstView === 'music' && row.firstView !== 'gallery',
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

test('live timeout preserves at least five minutes for exact restore', () => {
  for (const batch of LIVE_BATCHES) {
    const batchPublishBudgetMs = (batch.length + 2) * 8_000;
    expect(liveBatchTimeoutMs(batch) - batchPublishBudgetMs).toBeGreaterThanOrEqual(
      5 * 60_000,
    );
  }
});

test('live matrix is split into ordered batches of at most twelve rows', () => {
  const matrix = generateCoveringArray();
  const batches = batchCoveringRows(matrix);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every((batch) => batch.length <= 12)).toBe(true);
  expect(batches.flat()).toEqual(matrix);
});

const LIVE_USERNAME = process.env.E2E_PROFILE_USERNAME;
const LIVE_STORAGE_STATE = process.env.E2E_PROFILE_STORAGE_STATE;
const LIVE_WRITES_APPROVED = process.env.E2E_PROFILE_LIVE_WRITES === '1';
const LIVE_MATRIX = generateCoveringArray();
const LIVE_BATCHES = batchCoveringRows(LIVE_MATRIX);
const liveBatchTimeoutMs = (rows: readonly CoveringRow[]) =>
  (rows.length + 2) * 8_000 + 5 * 60_000;

const PRESET_LABELS: Record<string, string> = {
  'cinematic-dark': 'Cinematic Dark',
  glassmorphism: 'Glassmorphism Frost',
  'sunset-glow': 'Sunset Glow',
  'minimal-light': 'Minimal Light',
  'emerald-nature': 'Emerald Nature',
  'neon-cyber': 'Neon Cyber',
};
const ACCENT_LABELS: Record<string, string> = {
  '#10B981': 'Emerald',
  '#38BDF8': 'Ocean Blue',
  '#EC4899': 'Sunset Pink',
  '#8B5CF6': 'Royal Purple',
  '#F59E0B': 'Amber Gold',
  '#F43F5E': 'Crimson',
};
const LAYOUT_LABELS: Record<string, string> = {
  shelves: 'Classic Shelves',
  grid: 'Category Mosaic',
  featured: 'Featured First',
};
const LAYOUT_TEST_IDS: Record<string, string> = {
  shelves: 'recommendations-shelves',
  grid: 'recommendations-grid',
  featured: 'recommendations-featured',
};
const normalizeLayout = (layout: unknown) =>
  typeof layout === 'string' && layout in LAYOUT_TEST_IDS ? layout : 'shelves';
const CATEGORY_IDS = [
  'places',
  'music',
  'movies',
  'books',
  'games',
  'guides',
  'apps',
  'products',
  'people',
] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_IDS)[number], string> = {
  places: 'Places',
  music: 'Music',
  movies: 'Movies & Shows',
  books: 'Books',
  games: 'Games',
  guides: 'Guides',
  apps: 'Apps & Tools',
  products: 'Products',
  people: 'People',
};
interface MutationTemplate {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

const requestOperation = (request: Request) => {
  if (!request.url().includes('/graphql')) return '';
  const payload = request.postDataJSON() as
    | { operationName?: string; query?: string }
    | undefined;
  return (
    payload?.operationName ||
    payload?.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] ||
    ''
  );
};

const profileResponse = (response: Response) =>
  requestOperation(response.request()) === 'UsersPermissionsUser';

const clone = <Value,>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

class ConcurrentProfileChangeError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Profile changed outside this test (expected updatedAt=${expected}, actual=${actual}); refusing to overwrite it`,
    );
    this.name = 'ConcurrentProfileChangeError';
  }
}

const accountVersion = (account: Record<string, any>) => {
  if (typeof account.updatedAt !== 'string' || !account.updatedAt) {
    throw new Error('Authenticated profile response did not include account.updatedAt');
  }
  return account.updatedAt;
};

const assertAccountVersion = (
  account: Record<string, any>,
  expected: string,
) => {
  const actual = accountVersion(account);
  if (actual !== expected) throw new ConcurrentProfileChangeError(expected, actual);
};

const restorableAccountSnapshot = (account: Record<string, any>) => ({
  Account_Name: account.Account_Name,
  Account_Type: account.Account_Type,
  Bio: account.Bio,
  Addresss: account.Addresss,
  Primary_Address: account.Primary_Address,
  Public_Profile_Address: account.Public_Profile_Address,
  Feed_Data: account.Feed_Data,
  social_media: account.social_media,
  mobile_number: account.mobile_number,
  mobile_number_visibility: account.mobile_number_visibility,
});

const accountFromProfileResponse = async (response: Response) => {
  const payload = await response.json();
  const account = payload?.data?.usersPermissionsUser?.accounts?.[0];
  if (!account || typeof account.social_media !== 'object') {
    throw new Error('Authenticated profile response did not include raw social_media');
  }
  return account as Record<string, any>;
};

async function openDashboard(page: Page) {
  const responsePromise = page.waitForResponse(profileResponse);
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  const account = await accountFromProfileResponse(await responsePromise);
  const appearanceTab = page.getByRole('tab', {
    name: 'Appearance',
    exact: true,
  });
  await expect(appearanceTab).toBeVisible();
  if ((await appearanceTab.getAttribute('aria-selected')) !== 'true') {
    await appearanceTab.click();
  }
  await expect(page.getByTestId('appearance-workspace')).toBeVisible();
  await expect(page.getByLabel('First view')).toBeVisible();
  return account;
}

async function readDashboardOrder(page: Page) {
  const ids = await page
    .getByTestId('recommendations-order-category')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-category-id') || ''),
    );
  if (ids.length !== CATEGORY_IDS.length || ids.some((id) => !id)) {
    throw new Error('Dashboard did not expose all nine recommendation categories');
  }
  return ids as (typeof CATEGORY_IDS)[number][];
}

async function readDashboardPresentation(page: Page) {
  const preset = await page
    .locator('button[aria-pressed="true"]')
    .filter({ hasText: /Cinematic|Glassmorphism|Sunset|Minimal|Emerald|Neon/ })
    .first()
    .textContent();
  const presetId = Object.entries(PRESET_LABELS).find(([, label]) =>
    preset?.includes(label),
  )?.[0];
  const accentName = await page
    .locator('section[aria-labelledby="accent-color-title"] button[aria-pressed="true"]')
    .getAttribute('aria-label');
  const accent = Object.entries(ACCENT_LABELS).find(
    ([, label]) => label === accentName,
  )?.[0];
  const layout = await page
    .locator('input[name="recommendations-layout"]:checked')
    .getAttribute('value');
  if (!presetId || !accent || !layout) {
    throw new Error('Dashboard presentation baseline was incomplete');
  }
  return {
    preset: presetId,
    accent,
    wallpaper: await page.getByLabel('Wallpaper and cover style').inputValue(),
    firstView: await page.getByLabel('First view').inputValue(),
    layout,
    order: await readDashboardOrder(page),
  };
}

const orderForShape = (
  shape: CoveringRow['orderShape'],
  firstView: CoveringRow['firstView'],
) => {
  const canonical = [...CATEGORY_IDS];
  if (shape === 'reverse') return canonical.reverse();
  if (shape === 'rotate') return [...canonical.slice(2), ...canonical.slice(0, 2)];
  if (
    shape === 'preferred-first' &&
    CATEGORY_IDS.includes(firstView as (typeof CATEGORY_IDS)[number])
  ) {
    return [
      firstView as (typeof CATEGORY_IDS)[number],
      ...canonical.filter((id) => id !== firstView),
    ];
  }
  return canonical;
};

const expectedPublicOrderForRow = (
  shape: CoveringRow['orderShape'],
  firstView: CoveringRow['firstView'],
) => {
  const savedOrder = orderForShape(shape, firstView);
  if (
    CATEGORY_IDS.includes(firstView as (typeof CATEGORY_IDS)[number])
  ) {
    return [
      firstView as (typeof CATEGORY_IDS)[number],
      ...savedOrder.filter((id) => id !== firstView),
    ];
  }
  return savedOrder;
};

test('live row oracle promotes a category first view independently of saved order', () => {
  expect(expectedPublicOrderForRow('reverse', 'places')).toEqual([
    'places',
    'people',
    'products',
    'apps',
    'guides',
    'games',
    'books',
    'movies',
    'music',
  ]);
});

async function setDashboardOrder(
  page: Page,
  target: readonly (typeof CATEGORY_IDS)[number][],
) {
  for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
    const targetId = target[targetIndex];
    let current = await readDashboardOrder(page);
    let currentIndex = current.indexOf(targetId);
    while (currentIndex > targetIndex) {
      await page
        .getByRole('button', {
          name: `Move ${CATEGORY_LABELS[targetId]} up`,
          exact: true,
        })
        .click();
      current = await readDashboardOrder(page);
      currentIndex = current.indexOf(targetId);
    }
  }
  expect(await readDashboardOrder(page)).toEqual(target);
}

async function applyDashboardRow(page: Page, row: CoveringRow) {
  await page
    .getByRole('button', { name: PRESET_LABELS[row.preset], exact: false })
    .click();
  await page
    .getByRole('button', { name: ACCENT_LABELS[row.accent], exact: true })
    .click();
  await page.getByLabel('Wallpaper and cover style').selectOption(row.wallpaper);
  await page.getByLabel('First view').selectOption(row.firstView);
  await page
    .getByRole('radio', { name: LAYOUT_LABELS[row.layout], exact: true })
    .check();
  await setDashboardOrder(page, orderForShape(row.orderShape, row.firstView));
}

async function publishDashboard(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) => requestOperation(response.request()) === 'UpdateAccount',
  );
  await page.getByRole('button', { name: 'Save & Publish', exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json();
  if (!response.ok() || payload?.errors?.length || !payload?.data?.updateAccount) {
    throw new Error('Save & Publish was not confirmed');
  }
}

const safeTemplateHeaders = (headers: Record<string, string>) => {
  const result = { ...headers };
  delete result['content-length'];
  delete result.host;
  return result;
};

async function runTemplateMutation(
  page: Page,
  template: MutationTemplate,
  data: Record<string, unknown>,
) {
  const body = clone(template.body);
  body.variables.data = clone(data);
  const response = await page.request.post(template.url, {
    headers: safeTemplateHeaders(template.headers),
    data: body,
  });
  const payload = await response.json();
  if (!response.ok() || payload?.errors?.length || !payload?.data?.updateAccount) {
    throw new Error('Controlled profile mutation was not confirmed');
  }
}

async function captureAbortedMutationTemplate(
  page: Page,
  baselineAccent: string,
) {
  let captured: MutationTemplate | undefined;
  let resolveCaptured: ((template: MutationTemplate) => void) | undefined;
  const capturedPromise = new Promise<MutationTemplate>((resolve) => {
    resolveCaptured = resolve;
  });
  const handler = async (route: Route) => {
    if (requestOperation(route.request()) !== 'UpdateAccount') {
      return route.continue();
    }
    captured = {
      url: route.request().url(),
      headers: route.request().headers(),
      body: route.request().postDataJSON() as Record<string, any>,
    };
    resolveCaptured?.(captured);
    await route.abort('aborted');
  };
  await page.route('**/graphql', handler);
  const alternativeAccent = Object.keys(ACCENT_LABELS).find(
    (accent) => accent !== baselineAccent,
  )!;
  await page
    .getByRole('button', { name: ACCENT_LABELS[alternativeAccent], exact: true })
    .click();
  await page.getByRole('button', { name: 'Save & Publish', exact: true }).click();
  const template = await capturedPromise;
  await page.unroute('**/graphql', handler);
  return template;
}

async function publicCategoryIds(page: Page, layout: string) {
  const ids = await page
    .getByTestId(LAYOUT_TEST_IDS[layout])
    .locator('[data-category-id]')
    .evaluateAll((nodes) =>
      Array.from(
        new Set(nodes.map((node) => node.getAttribute('data-category-id') || '')),
      ).filter(Boolean),
    );
  return ids;
}

async function verifyPublicRow(
  page: Page,
  username: string,
  row: CoveringRow,
  hasBusiness: boolean,
) {
  await page.goto(`/${username}`, { waitUntil: 'domcontentloaded' });
  const themeRoot = page.getByTestId('public-profile-theme-root');
  await expect(themeRoot).toHaveAttribute('data-theme-preset', row.preset);
  await expect(themeRoot).toHaveAttribute('data-theme-accent', row.accent);
  await expect(themeRoot).toHaveAttribute(
    'data-wallpaper-mode',
    row.wallpaper,
  );
  await expect
    .poll(() =>
      themeRoot.evaluate((node) =>
        getComputedStyle(node).getPropertyValue('--accent-color').trim(),
      ),
    )
    .toBe(row.accent);
  const expectedTab =
    row.firstView === 'gallery'
      ? 'Gallery'
      : row.firstView === 'business' && hasBusiness
        ? 'Business Details'
        : 'Recommendations';
  await expect(page.getByRole('tab', { name: expectedTab })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  if (expectedTab !== 'Recommendations') {
    await page.getByRole('tab', { name: 'Recommendations' }).click();
  }
  await expect(page.getByTestId(LAYOUT_TEST_IDS[row.layout])).toBeVisible();
  const rendered = await publicCategoryIds(page, row.layout);
  const expectedOrder = expectedPublicOrderForRow(
    row.orderShape,
    row.firstView,
  ).filter((id) => rendered.includes(id));
  expect(rendered.slice(0, expectedOrder.length)).toEqual(expectedOrder);
  if (
    CATEGORY_IDS.includes(row.firstView as (typeof CATEGORY_IDS)[number]) &&
    rendered.includes(row.firstView)
  ) {
    expect(rendered[0]).toBe(row.firstView);
    expect(rendered.length).toBeGreaterThan(1);
  }
  if (row.layout === 'featured') {
    await expect(page.getByTestId('featured-category')).toHaveAttribute(
      'data-category-id',
      expectedOrder[0],
    );
  }
  await page.getByRole('tab', { name: 'Gallery' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Gallery' })).toBeVisible();
  if (hasBusiness) {
    await page.getByRole('tab', { name: 'Business Details' }).click();
    await expect(
      page.getByRole('tabpanel', { name: 'Business Details' }),
    ).toBeVisible();
  }
}

async function normalExactRestore(
  page: Page,
  baselinePresentation: Awaited<ReturnType<typeof readDashboardPresentation>>,
  baselineMutationData: Record<string, unknown>,
  expectedUpdatedAt: string,
) {
  const beforeRestore = await openDashboard(page);
  assertAccountVersion(beforeRestore, expectedUpdatedAt);
  await page
    .getByRole('button', {
      name: PRESET_LABELS[baselinePresentation.preset],
      exact: false,
    })
    .click();
  await page
    .getByRole('button', {
      name: ACCENT_LABELS[baselinePresentation.accent],
      exact: true,
    })
    .click();
  await page
    .getByLabel('Wallpaper and cover style')
    .selectOption(baselinePresentation.wallpaper);
  await page.getByLabel('First view').selectOption(baselinePresentation.firstView);
  await page
    .getByRole('radio', {
      name: LAYOUT_LABELS[baselinePresentation.layout],
      exact: true,
    })
    .check();
  await setDashboardOrder(page, baselinePresentation.order);

  let restoreRequestSeen = false;
  const handler = async (route: Route) => {
    if (requestOperation(route.request()) !== 'UpdateAccount') {
      return route.continue();
    }
    restoreRequestSeen = true;
    const body = route.request().postDataJSON() as Record<string, any>;
    body.variables.data = clone(baselineMutationData);
    const response = await route.fetch({
      headers: safeTemplateHeaders(route.request().headers()),
      postData: JSON.stringify(body),
    });
    await route.fulfill({ response });
  };
  await page.route('**/graphql', handler);
  try {
    await publishDashboard(page);
  } finally {
    await page.unroute('**/graphql', handler);
  }
  if (!restoreRequestSeen) throw new Error('Normal restore publish was not sent');
}

test.describe('approved live profile writes', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({
    storageState: LIVE_STORAGE_STATE || undefined,
  });
  test.skip(
    !LIVE_USERNAME || !LIVE_STORAGE_STATE || !LIVE_WRITES_APPROVED,
    'Requires approved profile account, auth storage state, and E2E_PROFILE_LIVE_WRITES=1',
  );

  for (const [batchIndex, liveRows] of LIVE_BATCHES.entries()) {
  test(`publishes pairwise matrix batch ${batchIndex + 1}/${LIVE_BATCHES.length} and restores exact raw social_media`, async ({
      page,
    }) => {
    test.setTimeout(liveBatchTimeoutMs(liveRows));
    const username = LIVE_USERNAME!;
    const baselineAccount = await openDashboard(page);
    const baselineSnapshot = restorableAccountSnapshot(baselineAccount);
    const baselineUpdatedAt = accountVersion(baselineAccount);
    const baselineSocialMedia = clone(
      baselineAccount.social_media,
    ) as Record<string, unknown>;
    const baselinePresentation = await readDashboardPresentation(page);
    const template = await captureAbortedMutationTemplate(
      page,
      baselinePresentation.accent,
    );
    const baselineMutationData = clone(
      template.body.variables.data,
    ) as Record<string, any>;
    baselineMutationData.social_media = clone(baselineSocialMedia);

    const afterAbort = await openDashboard(page);
    expect(afterAbort.social_media).toEqual(baselineSocialMedia);
    assertAccountVersion(afterAbort, baselineUpdatedAt);

    const sentinelMutationData = clone(baselineMutationData) as Record<string, any>;
    const sentinelSocialMedia = sentinelMutationData.social_media as Record<string, any>;
    const sentinel = `profile-presentation-${Date.now()}`;
    const theme = (sentinelSocialMedia.theme_settings ||= {});
    const recommendations = (theme.recommendations ||= {});
    recommendations.__e2eSentinel = sentinel;
    let liveFailure: unknown;
    let liveWriteStarted = false;
    let baselineHasBusiness = false;
    let expectedUpdatedAt = baselineUpdatedAt;
    try {
      // From this point onward, every exit path is inside the exact-restore guard.
      liveWriteStarted = true;
      assertAccountVersion(afterAbort, expectedUpdatedAt);
      await runTemplateMutation(page, template, sentinelMutationData);
      const afterSentinel = await openDashboard(page);
      expectedUpdatedAt = accountVersion(afterSentinel);
      expect(
        afterSentinel.social_media?.theme_settings?.recommendations
          ?.__e2eSentinel,
      ).toBe(sentinel);

      await page.goto(`/${username}`, { waitUntil: 'domcontentloaded' });
      const recommendationsTab = page.getByRole('tab', {
        name: 'Recommendations',
      });
      if ((await recommendationsTab.getAttribute('aria-selected')) !== 'true') {
        await recommendationsTab.click();
      }
      const baselineLayout = normalizeLayout(
        afterSentinel.social_media?.theme_settings?.recommendations?.layout ||
          'shelves',
      );
      await expect(
        page.getByTestId(LAYOUT_TEST_IDS[baselineLayout]),
      ).toBeVisible();
      const eligible = await publicCategoryIds(page, baselineLayout);
      if (eligible.length < 2) {
        throw new Error(
          'Approved live account needs at least two content-bearing recommendation categories',
        );
      }
      baselineHasBusiness =
        (await page.getByRole('tab', { name: 'Business Details' }).count()) > 0;

      for (const row of liveRows) {
        const beforeRow = await openDashboard(page);
        assertAccountVersion(beforeRow, expectedUpdatedAt);
        await applyDashboardRow(page, row);
        await publishDashboard(page);
        const afterPublish = await openDashboard(page);
        expectedUpdatedAt = accountVersion(afterPublish);
        await verifyPublicRow(page, username, row, baselineHasBusiness);
      }
    } catch (error) {
      liveFailure = error;
    } finally {
      if (liveWriteStarted) {
        await restoreWithEmergency({
          normalRestore: async () =>
            normalExactRestore(
              page,
              baselinePresentation,
              baselineMutationData,
              expectedUpdatedAt,
            ),
          emergencyRestore: async () => {
            const beforeEmergency = await openDashboard(page);
            assertAccountVersion(beforeEmergency, expectedUpdatedAt);
            await runTemplateMutation(page, template, baselineMutationData);
          },
          verify: async () => {
            const restored = await openDashboard(page);
            expect(restored.social_media).toEqual(baselineSocialMedia);
            expect(restorableAccountSnapshot(restored)).toEqual(baselineSnapshot);

            await page.goto(`/${username}`, { waitUntil: 'domcontentloaded' });
            const expectedInitialTab =
              baselinePresentation.firstView === 'gallery'
                ? 'Gallery'
                : baselinePresentation.firstView === 'business' &&
                    baselineHasBusiness
                  ? 'Business Details'
                  : 'Recommendations';
            await expect(
              page.getByRole('tab', { name: expectedInitialTab }),
            ).toHaveAttribute('aria-selected', 'true');
            if (expectedInitialTab !== 'Recommendations') {
              await page.getByRole('tab', { name: 'Recommendations' }).click();
            }
            const restoredLayout = normalizeLayout(baselinePresentation.layout);
            await expect(
              page.getByTestId(LAYOUT_TEST_IDS[restoredLayout]),
            ).toBeVisible();
            const restoredOrder = await publicCategoryIds(page, restoredLayout);
            const preferredCategory = CATEGORY_IDS.includes(
              baselinePresentation.firstView as (typeof CATEGORY_IDS)[number],
            )
              ? (baselinePresentation.firstView as (typeof CATEGORY_IDS)[number])
              : undefined;
            const expectedBaselineOrder = preferredCategory
              ? [
                  preferredCategory,
                  ...baselinePresentation.order.filter(
                    (category) => category !== preferredCategory,
                  ),
                ]
              : baselinePresentation.order;
            expect(restoredOrder).toEqual(
              expectedBaselineOrder.filter((category) =>
                restoredOrder.includes(category),
              ),
            );
          },
        });
      }
    }

    if (liveFailure) throw liveFailure;
  });
  }
});

test.describe('Public Profile Theme & Customization E2E', () => {
  test('renders homepage, navigation, and theme system elements', async ({ page }) => {
    // 1. Visit homepage
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Check if explorers.earth branding header is visible
    const logo = page.locator('text=explorers.earth');
    await expect(logo.first()).toBeVisible();

    // 3. Visit profile route and verify branding or page container
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    // Page loaded successfully
    expect(page.url()).toContain('/profile');
  });
});
