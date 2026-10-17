import {describe, it, expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QRCodeSVG} from 'qrcode.react';
import jsQR from 'jsqr';
import {generateUserProfileQRUrl, generateUserPlacesQRUrl} from '../qrCodeService';
import {getCurrentDomain} from '../getCurrentDomain';

/**
 * Ticket 5.2. The destination a scanned QR opens, proven by decoding the code the app
 * renders.
 *
 * Asserting that a URL builder returns a string, or that an <svg> element exists, proves
 * nothing about what a phone camera will open. So these cases render the same component
 * the app renders, recover its module matrix from the SVG, and decode it.
 *
 * `qrcode.react@4.2.0` exports only QRCodeCanvas and QRCodeSVG - it cannot decode - which
 * is why a decoder (`jsqr`) is a dev dependency here, as the ticket permits once that is
 * verified. Decoding goes through the matrix rather than a canvas, so jsdom needs no
 * rasteriser.
 */

/** What the storage permits in a handle (0022) and a list slug (0029). */
const HANDLE = /^[a-z][a-z0-9-]{2,29}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The dark modules of a rendered QR, from the run-length path qrcode.react emits. */
function modules(markup: string): boolean[][] {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(markup)?.[1]);
  expect(Number.isInteger(size)).toBe(true);
  const grid = Array.from({length: size}, () => Array.from({length: size}, () => false));
  // The foreground path carries the modules; the first path fills the light background.
  const foreground = [...markup.matchAll(/<path fill="#000000" d="([^"]+)"/g)].map(match => match[1]).join('');
  expect(foreground.length).toBeGreaterThan(0);
  // Runs appear as both `M0 0h7v1H0z` and `M18,0 h7v1H18z`, so the separator and the
  // space before the horizontal command are both optional.
  for (const run of foreground.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v(\d+)H\d+z/g)) {
    const [x, y, width, height] = run.slice(1).map(Number);
    for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) grid[row][column] = true;
  }
  return grid;
}

/** The matrix as RGBA pixels with a quiet zone, which is what a decoder expects. */
function pixels(grid: boolean[][], scale = 4, quiet = 4) {
  const size = grid.length;
  const width = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!grid[row][column]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const index = (((row + quiet) * scale + dy) * width + (column + quiet) * scale + dx) * 4;
          data[index] = 0; data[index + 1] = 0; data[index + 2] = 0; data[index + 3] = 255;
        }
      }
    }
  }
  return {data, width};
}

/** Renders the QR the app renders, and returns what a scanner would read from it. */
function decode(value: string): string {
  const markup = renderToStaticMarkup(React.createElement(QRCodeSVG, {value, size: 288, level: 'M'}));
  const {data, width} = pixels(modules(markup));
  const result = jsQR(data, width, width);
  expect(result, `QR for ${value} could not be decoded`).toBeTruthy();
  return result!.data;
}

describe('the destination a scanned QR opens', () => {
  const domain = getCurrentDomain();

  it('opens the canonical profile route, exactly', () => {
    const url = generateUserProfileQRUrl('explorer');
    expect(url).toBe(`${domain}/explorer`);
    expect(decode(url)).toBe(url);
  });

  it('opens the places route, with and without a city', () => {
    const all = generateUserPlacesQRUrl('explorer');
    const city = generateUserPlacesQRUrl('explorer', 'bengaluru');
    expect(all).toBe(`${domain}/explorer/places`);
    expect(city).toBe(`${domain}/explorer/places/bengaluru`);
    expect(decode(all)).toBe(all);
    expect(decode(city)).toBe(city);
  });

  it('carries the supplied UTM parameters into the scanned destination', () => {
    const url = generateUserPlacesQRUrl('explorer', 'bengaluru', {
      utm_source: 'qr_sticker', utm_medium: 'print', utm_campaign: 'cafe launch',
    });
    const decoded = decode(url);
    expect(decoded).toBe(url);
    const parsed = new URL(decoded);
    expect(parsed.pathname).toBe('/explorer/places/bengaluru');
    expect(parsed.searchParams.get('utm_source')).toBe('qr_sticker');
    expect(parsed.searchParams.get('utm_medium')).toBe('print');
    // The space is encoded on the way in and read back as a space, so the campaign name
    // survives a scan without breaking the URL.
    expect(parsed.searchParams.get('utm_campaign')).toBe('cafe launch');
    expect(decoded).not.toContain('utm_campaign=cafe launch');
  });

  it('round-trips every handle and slug the storage permits, unencoded and unchanged', () => {
    // The route is built by concatenation, with no percent-encoding. That is safe only
    // because 0022 constrains a handle to [a-z][a-z0-9-]* and 0029 a slug to the same
    // alphabet - characters that need no encoding. These are the awkward cases inside
    // those rules.
    for (const handle of ['abc', 'a-b-c', 'explorer2026', 'a'.repeat(30)]) {
      expect(HANDLE.test(handle), `${handle} should be a permitted handle`).toBe(true);
      const url = generateUserProfileQRUrl(handle);
      expect(decode(url)).toBe(`${domain}/${handle}`);
    }
    for (const slug of ['bengaluru', 'new-delhi-2', '1']) {
      expect(SLUG.test(slug), `${slug} should be a permitted slug`).toBe(true);
      const url = generateUserPlacesQRUrl('explorer', slug);
      expect(decode(url)).toBe(`${domain}/explorer/places/${slug}`);
    }
  });

  it('is protected from a space or a non-ASCII handle by the storage rule, not by the builder', () => {
    // Recorded rather than asserted as encoding, because the builder does not encode: a
    // handle with a space would reach the QR as a broken URL. What prevents it is that
    // such a handle cannot be stored. If that rule is ever relaxed, this case fails and
    // the builder must start encoding.
    for (const handle of ['two words', 'café', 'ñandú', 'UPPER']) {
      expect(HANDLE.test(handle), `${handle} must remain unstorable`).toBe(false);
      expect(generateUserProfileQRUrl(handle)).toBe(`${domain}/${handle}`);
    }
    for (const slug of ['two words', 'café', 'Trailing-']) {
      expect(SLUG.test(slug), `${slug} must remain unstorable`).toBe(false);
    }
  });
});
