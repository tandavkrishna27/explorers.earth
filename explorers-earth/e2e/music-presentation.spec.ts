import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { musicPermissionOracle } from '../../test-fixtures/music-permission-oracle';
import { installMusicPresentationFixture, populatedPublicResource, resourceForMask } from './setup/music-presentation';

const friendly = '/fixture-owner/music', direct = '/music/share/fixture-public-music';
const resourcePath = '/api/music/public-resource/v1/fixture-public-music';
const titles = ['Queue', 'Recently played', 'Playlists', 'Play on this device'];
async function openSections(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Music', exact: true })).toBeVisible();
  for (const name of titles) {
    const trigger = page.getByRole('button', { name, exact: true });
    if (await trigger.count() && await trigger.getAttribute('aria-expanded') === 'false') {
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    }
  }
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Music', exact: true })).toHaveCount(1);
}
test('friendly Music starts below the header without an identity strip; direct shares retain identity', async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await page.goto(friendly);
  const heading = page.getByRole('heading', { level: 1, name: 'Music', exact: true });
  await expect(heading).toBeVisible();
  const firstSection = page.locator('.public-music__sections').first();
  await expect(firstSection).toBeVisible();
  await expect(page.getByText('Fixture Explorer', { exact: true })).toHaveCount(0);
  await expect(page.locator('.public-music__identity')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
  const bannerBox = await page.getByRole('banner').boundingBox();
  const firstSectionBox = await firstSection.boundingBox();
  expect(bannerBox).not.toBeNull();
  expect(firstSectionBox).not.toBeNull();
  const gap = firstSectionBox!.y - (bannerBox!.y + bannerBox!.height);
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(gap).toBeLessThanOrEqual(32);
  await layout(page);
  await page.screenshot({ path: info.outputPath('friendly-music-no-identity.png'), fullPage: true });
  await page.goto(direct);
  await expect(page.getByText('The Listening Room', { exact: true })).toBeVisible();
  await expect(page.locator('.public-music__identity')).toBeVisible();
  fixture.assertClean();
});
test('queue first, explicit device open and manual browsing never autoplay', async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await page.goto(friendly);
  await expect(page.getByRole('button', { name: 'Queue', exact: true })).toHaveAttribute('aria-expanded', 'true');
  for (const name of titles.slice(1)) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('contained-music-media')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next music card' }).click();
  await expect(page.getByTestId('music-featured-active')).toContainText('Coastal drive');
  await expect(page.locator('[data-testid=public-music-player] button[aria-label^="Play Coastal"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listen on this device' }).click();
  await expect(page.getByRole('button', { name: 'Play Coastal drive on this device', exact: true })).toBeVisible();
  await expect(page.getByTestId('contained-music-media')).toHaveAttribute('data-play-attempts', '0');
  await expect(page.getByTestId('contained-music-media')).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: /^Pause / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Coastal drive on this device', exact: true }).click();
  await expect(page.getByTestId('contained-music-media')).toHaveAttribute('data-play-attempts', '1');
  await expect(page.getByTestId('contained-music-media')).toHaveAttribute('data-playing', 'true');
  await page.getByRole('button', { name: 'Pause Coastal drive', exact: true }).click();
  await expect(page.getByTestId('contained-music-media')).toHaveAttribute('data-playing', 'false');
  await page.getByRole('button', { name: 'Play on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Coastal drive on this device', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('contained-music-media')).toHaveCount(0);
  expect(fixture.requests).toEqual([]);
  await layout(page); fixture.assertClean();
});
for (const path of [friendly, direct]) test('all 32 masks on ' + path, async ({ page, context, baseURL }) => {
  test.setTimeout(240_000);
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: resourceForMask(0) });
  for (const [mask, requests, playback, playlists, history, queue, current] of musicPermissionOracle) {
    fixture.update({ ...resourceForMask(mask), revision: mask + 10 });
    await page.goto(path + '?matrix=' + mask);
    await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    for (const [allowed, title] of [[queue, 'Queue'], [history, 'Recently played'], [playlists, 'Playlists'], [playback, 'Play on this device']] as const) {
      await expect(page.getByRole('button', { name: title, exact: true }), 'mask ' + mask).toHaveCount(allowed ? 1 : 0);
    }
    await openSections(page);
    await expect(page.getByRole('textbox', { name: /Search for a song/ })).toHaveCount(requests ? 1 : 0);
    await expect(page.getByText('Morning reflections', { exact: true })).toHaveCount(history ? 1 : 0);
    await expect(page.getByText('Golden hour', { exact: true })).toHaveCount(playlists ? 1 : 0);
    expect(await page.getByText('Evening light', { exact: true }).count() > 0).toBe(Boolean(current));
    await expect(page.getByRole('button', { name: /^Play .+ on this device$/ })).toHaveCount(playback ? 1 : 0);
    if (!queue) await expect(page.getByText('Coastal drive', { exact: true })).toHaveCount(0);
    if (!requests) await expect(page.getByRole('button', { name: /Prepare request/ })).toHaveCount(0);
    await layout(page);
  }
  fixture.assertClean();
});
test('six presets at five widths', async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name.endsWith('mobile'), 'Explicit widths covered once; mobile interaction covered in other cases.');
  test.setTimeout(240_000);
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  for (const preset of ['cinematic-dark', 'glassmorphism', 'sunset-glow', 'minimal-light', 'emerald-nature', 'neon-cyber']) {
    fixture.setAppearance(preset);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(friendly);
      await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
      await expect(page.locator('[data-public-profile-chrome]')).toHaveAttribute('data-theme-preset', preset);
      await layout(page);
      await page.getByRole('button', { name: 'Playlists', exact: true }).click();
      await page.getByRole('button', { name: 'On the road', exact: true }).click();
      await expect(page.getByText('Open horizons', { exact: true })).toBeVisible();
      await layout(page);
      await page.keyboard.press('Control+Home');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({ path: info.outputPath(preset + '-' + width + '.png'), fullPage: true });
    }
  }
  fixture.assertClean();
});
test('four backgrounds with selected, missing and broken images', async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  for (const mode of ['solid-color', 'banner-top', 'ambient-gradient', 'full-wallpaper-image']) {
    for (const image of ['valid', 'missing', 'broken'] as const) {
      fixture.setAppearance('minimal-light', mode, image);
      await page.goto(friendly);
      await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
      const shouldShow = image === 'valid' && ['banner-top', 'full-wallpaper-image'].includes(mode);
      await expect(page.locator('.public-music__cover img,.public-music__wallpaper img')).toHaveCount(shouldShow ? 1 : 0);
      await expect(page.locator('img[src*="unsplash"]')).toHaveCount(0);
      await layout(page);
      if (image === 'broken') await expect(page.locator('.public-music__featured-image img,img.public-music__featured-image')).toHaveCount(0);
    }
  }
  await page.screenshot({ path: info.outputPath('broken-artwork.png'), fullPage: true });
  fixture.assertClean();
});
test('320px expanded playlist stays inside the viewport', async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto(friendly);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await layout(page);
  fixture.assertClean();
});
test('search Enter and playlist request require explicit confirmation', async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await page.goto(friendly);
  await page.getByRole('textbox', { name: /Search for a song/ }).fill('evening');
  await page.getByRole('textbox', { name: /Search for a song/ }).press('Enter');
  await expect(page.getByRole('button', { name: 'Request Verified request song by Verified artist' })).toBeVisible();
  expect(fixture.requests.filter(r => r.path.endsWith('/requests'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Request Verified request song by Verified artist' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Song requested.' })).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare request for Golden hour' }).click();
  await expect(page.getByRole('button', { name: 'Request Verified request song by Verified artist' })).toBeVisible();
  expect(fixture.requests.filter(r => r.path.endsWith('/requests'))).toHaveLength(1);
  expect(fixture.requests.filter(r => r.path.endsWith('/video-from-url'))).toHaveLength(1);
  fixture.assertClean();
});
test('permission revisions close revoked surfaces and restore only allowed content', async ({ page, context, baseURL }) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  await page.goto(direct);
  await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
  await expect.poll(() => fixture.state.sockets.size).toBeGreaterThan(0);
  let revision = 100;
  for (const [bit, control] of [[1, 'request'], [2, 'Play on this device'], [4, 'Playlists'], [8, 'Recently played'], [16, 'Queue']] as const) {
    await openSections(page);
    if (bit === 1) await page.getByRole('textbox').focus();
    if (bit === 2) await page.getByRole('button', { name: 'Play Evening light on this device' }).focus();
    fixture.update({ ...resourceForMask(31 ^ bit), revision: revision++ });
    if (control === 'request') await expect(page.getByRole('textbox')).toHaveCount(0);
    else await expect(page.getByRole('button', { name: control, exact: true })).toHaveCount(0);
    if (bit === 1 || bit === 2) await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeFocused();
    fixture.update({ ...resourceForMask(31), revision: revision++ });
    await expect(control === 'request' ? page.getByRole('textbox') : page.getByRole('button', { name: control, exact: true })).toBeVisible();
  }
  fixture.assertClean();
});
test('ready and empty light/dark accessibility and keyboard controls', async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  for (const preset of ['minimal-light', 'cinematic-dark']) {
    fixture.setAppearance(preset);
    for (const mask of [31, 0]) {
      fixture.update(resourceForMask(mask));
      await page.goto(friendly);
      await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
      if (mask === 31) {
        const trigger = page.getByRole('button', { name: 'Playlists', exact: true });
        await trigger.focus(); await trigger.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await trigger.press('Space'); await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      } else await expect(page.getByText('Nothing has been shared here yet')).toBeVisible();
      if (mask === 0) {
        await expect.poll(() => page.locator('[data-public-profile-chrome]').evaluate(el => el.getBoundingClientRect().height >= window.innerHeight)).toBe(true);
      }
      await layout(page);
      const result = await new AxeBuilder({ page }).include('.public-music').analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(preset + '-' + (mask ? 'ready' : 'empty') + '.png'), fullPage: true });
    }
  }
  fixture.assertClean();
});
test('delayed standalone resource shows one skeleton status then ready content', async ({ page, context, baseURL }) => {
  let release!: () => void;
  const resourceDelay = new Promise<void>(resolve => { release = resolve; });
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource, resourceDelay });
  await page.goto(direct);
  await expect(page.locator('[data-music-skeleton]')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading Music' })).toHaveCount(1);
  await expect(page.locator('.public-music__identity')).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
  await expect(page.locator('[data-music-skeleton]')).toHaveCount(0);
  fixture.assertClean();
});
for (const status of [429, 503]) test('standalone ' + status + ' has full-width frame and explicit recovery', async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  // StrictMode restarts the initial read. Keep the outage active until the
  // explicit recovery step rather than letting the replay consume a success.
  fixture.state.faults.set(resourcePath, Array.from({ length: 100 }, () => ({ kind: 'error' as const, status })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(direct);
  await expect(page.getByRole('alert')).toContainText(status === 429 ? 'Too many requests' : 'temporarily unavailable');
  const frame = await page.locator('main.public-music__frame').boundingBox();
  expect(frame?.width).toBe(1440);
  expect(await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.public-music__identity')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('standalone-' + status + '.png'), fullPage: true });
  fixture.state.faults.delete(resourcePath);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
  fixture.assertClean();
});
test('private direct resource shows no owner identity or retry', async ({ page, context, baseURL }, info) => {
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource: populatedPublicResource });
  fixture.state.mode = 'private';
  await page.goto(direct);
  await expect(page.getByRole('heading', { name: 'Music page unavailable' })).toBeVisible();
  await expect(page.locator('.public-music__identity')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('private-resource.png'), fullPage: true });
  fixture.assertClean();
});
test('long text and empty playlist remain readable at narrow and enlarged widths', async ({ page, context, baseURL }) => {
  const resource = structuredClone(populatedPublicResource);
  resource.currentlyPlaying!.title = 'LongUnbrokenTitle'.repeat(25);
  resource.currentlyPlaying!.artist = 'A very long artist name '.repeat(20);
  resource.playlists.items[0].name = 'A very long playlist name '.repeat(4);
  const fixture = await installMusicPresentationFixture(context, baseURL!, { resource });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(friendly);
    await openSections(page);
    await layout(page);
    await page.getByRole('button', { name: 'Late night discoveries', exact: true }).click();
    await expect(page.getByText('No songs in this playlist yet')).toBeVisible();
    await layout(page);
  }
  fixture.assertClean();
});
