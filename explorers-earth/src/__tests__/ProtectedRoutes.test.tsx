import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ProtectedRoutes Topology Definition', () => {
  it('should map /recommendations to RecommendationsHub and contain category sub-routes', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, '../routes/ProtectedRoutes.tsx'), 'utf8');

    expect(fileContent).toContain('path="recommendations" element={<RecommendationsHub />}');
    expect(fileContent).toContain('path="recommendations/places" element={<Favorites />}');
    expect(fileContent).toContain('path="recommendations/guides" element={<GuidesPage />}');
    // The Music page was removed in P3-4; its old route lands on the hub.
    expect(fileContent).toContain('path="recommendations/music" element={<Navigate to="/recommendations" replace />}');
    expect(fileContent).toContain('path="guides" element={<Navigate to="/recommendations/guides" replace />}');
  });
});
