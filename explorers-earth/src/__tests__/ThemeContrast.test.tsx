import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Theme CSS Contrast Variables', () => {
  it('should define distinct background color variables for light and dark themes', () => {
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

    expect(cssContent).toContain('--dash-sidebar-bg: #ffffff;');
    expect(cssContent).toContain('--dash-sidebar-bg: #14141C;');
  });
});
