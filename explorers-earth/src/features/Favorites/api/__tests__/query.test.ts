import { describe, expect, it } from 'vitest';
import { print } from 'graphql';
import { allRecommendedPlacesQuery } from '../query';

describe('allRecommendedPlacesQuery', () => {
  it('selects the recommendation list documentId for Apollo cache normalization', () => {
    const source = print(allRecommendedPlacesQuery);

    expect(source).toMatch(
      /recommendationList\(documentId: \$documentId\)\s*\{\s*documentId/,
    );
  });
});
