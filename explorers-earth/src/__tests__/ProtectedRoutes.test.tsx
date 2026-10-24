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

  it('keeps an addressable list, add and edit route for each of the six native categories', () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, '../routes/ProtectedRoutes.tsx'), 'utf8');
    for (const [category, id] of [['movies', 'movieId'], ['books', 'bookId'], ['games', 'gameId'], ['apps', 'appId'], ['products', 'productId'], ['people', 'personId']]) {
      expect(fileContent).toContain(`path="recommendations/${category}/:listId"`);
      expect(fileContent).toContain(`path="recommendations/${category}/:listId/add"`);
      expect(fileContent).toContain(`path="recommendations/${category}/:listId/edit/:${id}"`);
    }
    expect(fileContent).toContain('path="recommendations/guides/:guideId"');
  });
});
