import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecommendationsHub from '../RecommendationsHub';
import { loginSurface, ordinaryCategories, surfaceHarness, writtenPins, writtenVisibility } from '../../features/navigation/__tests__/surfaceHarness';
import useAuthStore from '../../store/store';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../features/music/publicMusicClient', () => ({ publicMusicClient: { discover: vi.fn().mockRejectedValue(new Error('offline')) } }));
// Decorative SVG path animation is unrelated to consent and emits an existing
// undefined-stroke warning in jsdom. Keep the actual controls and other motion.
vi.mock('framer-motion', async original => {
  const actual = await original<typeof import('framer-motion')>();
  const { createElement, forwardRef } = await import('react');
  const Path = forwardRef<SVGPathElement, any>(({ animate, initial, transition, exit, whileHover, ...props }, ref) => createElement('path', { ...props, ref }));
  return { ...actual, motion: new Proxy(actual.motion, { get: (target, key) => key === 'path' ? Path : Reflect.get(target, key) }) };
});
describe('Hub navigation consent', () => {
  beforeEach(() => loginSurface()); afterEach(() => { cleanup(); useAuthStore.getState().logout(); });
  async function openBooks() { fireEvent.click((await screen.findAllByTitle('Category options'))[2]); }
  async function openCategory(category: string) { fireEvent.click((await screen.findAllByTitle('Category options'))[ordinaryCategories.indexOf(category as any)]); }
  it.each(ordinaryCategories)('%s Off cleans only target and On never pins', async category => {
    const h = surfaceHarness(<RecommendationsHub />, { initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready(); await openCategory(category);
    fireEvent.click(screen.getByRole('button', { name: /Disable Public/ }));
    await waitFor(() => expect(h.saved[category]).toBe('No')); await waitFor(() => expect(h.navigation.busy).toBe(false));
    await openCategory(category); fireEvent.click(screen.getByRole('button', { name: /Enable Public/ }));
    await waitFor(() => expect(h.saved[category]).toBe('Yes'));
    expect(h.writes).toHaveLength(2);
    // Off: the target goes private and only its own pin is dropped.
    expect(writtenVisibility(h.writes[0].variables.input, category)).toBe(false);
    expect(writtenPins(h.writes[0].variables.input)).toEqual(['public_profile', 'public_music']);
    // On: it goes public again without the pin coming back.
    expect(writtenVisibility(h.writes[1].variables.input, category)).toBe(true);
    expect(writtenPins(h.writes[1].variables.input)).toEqual(['public_profile', 'public_music']);
  });
  it.each(ordinaryCategories)('%s hidden Pin remains disabled with no visibility write', async category => {
    const h = surfaceHarness(<RecommendationsHub />, { initial: { [category]: 'No', pinned_nav_tabs: ['public_profile'] } }); await h.ready(); await openCategory(category);
    const pin = screen.getByRole('button', { name: /Pin to Public Nav/ }); expect(pin).toBeDisabled(); fireEvent.click(pin); expect(h.writes).toEqual([]);
  });
  it('cannot pin a hidden category or publish it as a pin side effect', async () => {
    const h = surfaceHarness(<RecommendationsHub />, { initial: { public_books: 'No', pinned_nav_tabs: ['public_profile'] } }); await h.ready(); await openBooks();
    const pin = screen.getByRole('button', { name: /Pin to Public Nav/ }); expect(pin).toBeDisabled(); fireEvent.click(pin); expect(h.writes).toEqual([]);
  });
  it('Off removes only its stored pin, preserving saved Music during outage', async () => {
    const h = surfaceHarness(<RecommendationsHub />); await h.ready(); await openBooks();
    fireEvent.click(screen.getByRole('button', { name: /Disable Public/ })); await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(writtenVisibility(h.writes[0].variables.input, 'public_books')).toBe(false);
    expect(writtenPins(h.writes[0].variables.input)).toEqual(['public_profile', 'public_music']);
  });
  it('automatic placement links to Settings and does not silently change mode', async () => {
    const h = surfaceHarness(<RecommendationsHub />, { initial: { auto_pinning: true } }); await h.ready(); await openBooks();
    expect(screen.getByRole('button', { name: /Manual mode in Settings/ })).toBeInTheDocument(); expect(h.writes).toEqual([]);
  });
  // The pin E2E cases timed out in CI because the menu closed itself ~40ms after Playwright
  // resolved its buttons: the menu dismissed on any scroll event, and the layout scroller
  // emits them on its own whenever a banner above the grid appears or goes away.
  describe('category menu under unsolicited scroll', () => {
    const menu = () => document.querySelector<HTMLElement>('[data-kebab-menu]');
    async function openAnchoredAt(bottom: { value: number }) {
      const h = surfaceHarness(<RecommendationsHub />); await h.ready();
      const trigger = (await screen.findAllByTitle('Category options'))[2];
      trigger.getBoundingClientRect = () => ({ x: 400, y: bottom.value - 28, width: 28, height: 28, top: bottom.value - 28, bottom: bottom.value, left: 400, right: 428, toJSON: () => ({}) });
      fireEvent.click(trigger);
      await waitFor(() => expect(menu()).not.toBeNull());
      return h;
    }
    it('stays open when a scroll does not move its trigger', async () => {
      const bottom = { value: 120 }; await openAnchoredAt(bottom);
      expect(menu()!.style.top).toBe('128px');
      fireEvent.scroll(document.body); fireEvent.scroll(window);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
      expect(menu()).not.toBeNull(); expect(screen.getByRole('button', { name: /Disable Public/ })).toBeInTheDocument();
    });
    it('follows its trigger instead of closing when the layout shifts under it', async () => {
      const bottom = { value: 120 }; await openAnchoredAt(bottom);
      bottom.value = 66; fireEvent.scroll(document.body);
      await waitFor(() => expect(menu()!.style.top).toBe('74px'));
      expect(screen.getByRole('button', { name: /Disable Public/ })).toBeInTheDocument();
    });
    it('still closes once its trigger has scrolled out of view', async () => {
      const bottom = { value: 120 }; await openAnchoredAt(bottom);
      bottom.value = -10; fireEvent.scroll(document.body);
      await waitFor(() => expect(menu()).toBeNull());
    });
    it('still closes on a pointer press outside the menu', async () => {
      const bottom = { value: 120 }; await openAnchoredAt(bottom);
      fireEvent.mouseDown(document.body);
      await waitFor(() => expect(menu()).toBeNull());
    });
  });
});
