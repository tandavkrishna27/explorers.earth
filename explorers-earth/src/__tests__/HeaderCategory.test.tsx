import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Header Category Switcher Registry', () => {
  it('contains All Recommendations Hub and updated category paths', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, '../components/Header.tsx'), 'utf8');

    expect(fileContent).toContain("{ id: 'hub', name: 'All Recommendations', path: '/recommendations' }");
    expect(fileContent).toContain("{ id: 'places', name: 'Places', path: '/recommendations/places' }");
    expect(fileContent).toContain("{ id: 'guides', name: 'Guides', path: '/recommendations/guides' }");
    expect(fileContent).toContain("{ id: 'music', name: 'Music', path: '/recommendations/music' }");
  });
});
