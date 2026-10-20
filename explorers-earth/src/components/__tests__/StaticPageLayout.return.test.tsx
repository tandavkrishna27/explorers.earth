import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import StaticPageLayout from '../StaticPageLayout';

const hrefFor = (search: string) => {
  render(
    <MemoryRouter initialEntries={[`/terms${search}`]}>
      <StaticPageLayout title="Terms">x</StaticPageLayout>
    </MemoryRouter>,
  );
  return screen.getAllByRole('link')[0].getAttribute('href');
};

describe('StaticPageLayout return param', () => {
  it('ignores backslash open-redirect payloads', () => {
    expect(hrefFor('?return=' + encodeURIComponent('/\\evil.example'))).toBe('/');
  });
  it('keeps a safe in-app path', () => {
    expect(hrefFor('?return=/register')).toBe('/register');
  });
});
