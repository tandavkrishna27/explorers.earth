import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicCategoryThemeProvider } from '../../../features/PublicHome/components/PublicCategoryThemeContext';
import Modal from '../Modal';

const categoryStyles = {
  '--category-panel': '#FFFFFF',
  '--category-text': '#0F172A',
  '--category-muted': '#475569',
  '--category-control-border': '#CBD5E1',
  '--category-accent': '#0F172A',
  '--category-focus': '#0F172A',
};

describe('Modal viewport contract', () => {
  it('does not create a body portal while closed', () => {
    render(<Modal isOpen={false} onClose={() => {}}><p>Hidden dialog</p></Modal>);

    expect(screen.queryByText('Hidden dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-modal-wrapper]')).not.toBeInTheDocument();
  });

  it('keeps content clicks isolated from the backdrop', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose}><button type="button">Inside action</button></Modal>);

    fireEvent.click(screen.getByRole('button', { name: 'Inside action' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes exactly once from either the backdrop or named Close control', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal isOpen onClose={onClose}><p>Default content</p></Modal>);
    const wrapper = document.querySelector<HTMLElement>('[data-modal-wrapper]')!;

    fireEvent.click(wrapper.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(<Modal isOpen onClose={onClose}><p>Default content</p></Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog', exact: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bounds default geometry with one explicitly shared available-height property', () => {
    render(<Modal isOpen onClose={() => {}}><p>Default content</p></Modal>);
    const wrapper = document.querySelector<HTMLElement>('[data-modal-wrapper]')!;
    const panel = document.querySelector<HTMLElement>('[data-modal-panel]')!;
    const close = screen.getByRole('button', { name: 'Close dialog', exact: true });

    expect(wrapper).toHaveClass('min-h-0', 'min-w-0', 'max-w-full');
    expect(wrapper.style.getPropertyValue('--modal-available-height')).toBe('min(95dvh, calc(100dvh - var(--modal-gutter)))');
    expect(wrapper.style.maxHeight).toBe('var(--modal-available-height)');
    expect(panel.style.width).toBe('100%');
    expect(panel.style.minWidth).toBe('0px');
    expect(panel.style.maxWidth).toBe('100%');
    expect(panel.style.minHeight).toBe('0px');
    expect(panel.style.maxHeight).toBe('calc(var(--modal-available-height) - 60px)');
    expect(panel).toHaveClass('overflow-y-auto', 'overflow-x-hidden');
    expect(close).toHaveAttribute('type', 'button');
    expect(close).toHaveClass('min-h-11', 'min-w-11');
  });

  it('keeps crop caller controls, uses the shared height cap, and omits wrapper Close', () => {
    render(<Modal isOpen onClose={() => {}} type="crop"><button type="button">Cancel crop</button><button type="button">Confirm crop</button></Modal>);
    const panel = document.querySelector<HTMLElement>('[data-modal-panel]')!;

    expect(screen.getByRole('button', { name: 'Cancel crop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm crop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close dialog', exact: true })).not.toBeInTheDocument();
    expect(panel.style.maxHeight).toBe('var(--modal-available-height)');
    expect(panel.style.minHeight).toBe('min(clamp(400px, 60vh, 80vh), var(--modal-available-height))');
  });

  it('preserves dashboard and category palette aliases through the body portal', () => {
    const { rerender } = render(<Modal isOpen onClose={() => {}}><h2>Shared dialog</h2></Modal>);
    const defaultPanel = document.querySelector<HTMLElement>('[data-modal-panel]')!;

    expect(defaultPanel).toHaveClass('bg-dashboard-sidebar', 'border-gray-600');
    expect(defaultPanel.closest('.dashboard-theme')).not.toBeNull();

    rerender(<PublicCategoryThemeProvider styles={categoryStyles}><Modal isOpen onClose={() => {}}><h2>Shared dialog</h2></Modal></PublicCategoryThemeProvider>);
    const categoryRoot = document.querySelector<HTMLElement>('[data-category-modal]')!;
    const categoryPanel = document.querySelector<HTMLElement>('[data-modal-panel]')!;
    expect(categoryRoot.style.getPropertyValue('--category-panel')).toBe('#FFFFFF');
    expect(categoryPanel).toHaveClass('bg-[var(--category-panel)]', 'border-[var(--category-control-border)]');
    expect(categoryRoot).not.toHaveClass('dashboard-theme');

    rerender(<PublicCategoryThemeProvider styles={null}><Modal isOpen onClose={() => {}}><h2>Shared dialog</h2></Modal></PublicCategoryThemeProvider>);
    expect(document.querySelector('[data-category-modal]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-modal-panel]')).toHaveClass('bg-dashboard-sidebar', 'border-gray-600');
  });
});
