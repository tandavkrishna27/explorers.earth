import { describe, it, expect, vi } from 'vitest';
import { InMemoryCache, gql } from '@apollo/client';
import { typePolicies } from '../apolloCache';

const BOOK_LISTS = gql`
  query BookLists {
    bookLists {
      documentId
      visibility
      List_Name
      __typename
    }
  }
`;

function seedDraftList(cache: InMemoryCache) {
  cache.writeQuery({
    query: BOOK_LISTS,
    data: {
      bookLists: [
        { __typename: 'BookList', documentId: 'abc123', visibility: false, List_Name: 'My Reads' },
      ],
    },
  });
}

const PUBLISH = gql`fragment Published on BookList { visibility }`;

const USERNAME_SELECTION = gql`
  query UserName($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      __typename
      documentId
      username
    }
  }
`;

const ACCOUNTS_SELECTION = gql`
  query UserAccounts($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      __typename
      documentId
      accounts {
        __typename
        documentId
        Account_Name
      }
    }
  }
`;

const RECOMMENDATION_LIST_SUMMARY = gql`
  query RecommendationListSummary($documentId: ID!) {
    recommendationList(documentId: $documentId) {
      __typename
      documentId
      Visibility
    }
  }
`;

const RECOMMENDATION_LIST_PLACES = gql`
  query RecommendationListPlaces($documentId: ID!) {
    recommendationList(documentId: $documentId) {
      __typename
      documentId
      recommended_places {
        __typename
        documentId
        Place_Details
      }
    }
  }
`;

describe('apollo typePolicies — documentId normalization (publish-label fix)', () => {
  // All three list types share the documentId policy (Codex P2 #2).
  it.each(['BookList', 'GameList', 'MovieList'])('identifies a %s by documentId', (__typename) => {
    const cache = new InMemoryCache({ typePolicies });
    // Apollo encodes an array keyFields as `BookList:{"documentId":"abc123"}`.
    const id = cache.identify({ __typename, documentId: 'abc123' });
    expect(id).toBeTruthy();
    expect(id).toContain('abc123');
  });

  it.each(['Account', 'UsersPermissionsUser'])("identifies immutable Music profile entities by documentId", (__typename) => {
    const cache = new InMemoryCache({ typePolicies });
    const id = cache.identify({ __typename, documentId: "immutable-document-1" });
    expect(id).toContain("immutable-document-1");
  });

  it("embeds legacy partial profile objects without an Apollo missing-documentId warning", () => {
    const cache = new InMemoryCache({ typePolicies });
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const partial = gql`query PartialAccount { accounts { Account_Name __typename } }`;

    expect(() => cache.writeQuery({
      query: partial,
      data: { accounts: [{ __typename: "Account", Account_Name: "Partial" }] },
    })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a publish mutation result patches the rendered list entity with NO refetch', () => {
    const cache = new InMemoryCache({ typePolicies });
    seedDraftList(cache);

    // Simulate the publish mutation returning { documentId, visibility: true }.
    cache.writeFragment({
      id: cache.identify({ __typename: 'BookList', documentId: 'abc123' }),
      fragment: PUBLISH,
      data: { visibility: true },
    });

    const result = cache.readQuery<{ bookLists: Array<{ visibility: boolean }> }>({ query: BOOK_LISTS });
    expect(result?.bookLists[0].visibility).toBe(true); // label flips, no refetch
  });

  it('WITHOUT normalization the same patch never reaches the list (proves the fix matters)', () => {
    const cache = new InMemoryCache(); // default: keys by `id`, which Strapi v5 lacks
    seedDraftList(cache);

    expect(cache.identify({ __typename: 'BookList', documentId: 'abc123' })).toBeUndefined();
    cache.writeFragment({
      id: 'BookList:abc123', // the id a normalized cache WOULD use
      fragment: PUBLISH,
      data: { visibility: true },
    });

    const result = cache.readQuery<{ bookLists: Array<{ visibility: boolean }> }>({ query: BOOK_LISTS });
    expect(result?.bookLists[0].visibility).toBe(false); // stays "Draft" — the bug
  });
});

describe('apollo typePolicies — partial user selections', () => {
  it('retains username and accounts for one documentId without Apollo cache warning 15', () => {
    const cache = new InMemoryCache({ typePolicies });
    const variables = { documentId: 'user-123' };
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      cache.writeQuery({
        query: USERNAME_SELECTION,
        variables,
        data: {
          usersPermissionsUser: {
            __typename: 'UsersPermissionsUser',
            documentId: 'user-123',
            username: 'tinoue',
          },
        },
      });
      cache.writeQuery({
        query: ACCOUNTS_SELECTION,
        variables,
        data: {
          usersPermissionsUser: {
            __typename: 'UsersPermissionsUser',
            documentId: 'user-123',
            accounts: [
              {
                __typename: 'Account',
                documentId: 'account-456',
                Account_Name: 'Tinoue Explorer',
              },
            ],
          },
        },
      });

      const warning15Calls = consoleWarn.mock.calls.filter((call) => {
        const rendered = call.map(String).join(' ');
        return (
          rendered.includes('usersPermissionsUser') &&
          (rendered.includes('Cache data may be lost') ||
            rendered.includes('%22message%22%3A15'))
        );
      });
      expect(warning15Calls).toEqual([]);

      expect(
        cache.readQuery({ query: USERNAME_SELECTION, variables }),
      ).toEqual({
        usersPermissionsUser: {
          __typename: 'UsersPermissionsUser',
          documentId: 'user-123',
          username: 'tinoue',
        },
      });
      expect(
        cache.readQuery({ query: ACCOUNTS_SELECTION, variables }),
      ).toEqual({
        usersPermissionsUser: {
          __typename: 'UsersPermissionsUser',
          documentId: 'user-123',
          accounts: [
            {
              __typename: 'Account',
              documentId: 'account-456',
              Account_Name: 'Tinoue Explorer',
            },
          ],
        },
      });
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

describe('apollo typePolicies — partial recommendation list selections', () => {
  it('retains summary and places for one documentId without Apollo cache warning 15', () => {
    const cache = new InMemoryCache({ typePolicies });
    const variables = { documentId: 'list-123' };
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      cache.writeQuery({
        query: RECOMMENDATION_LIST_SUMMARY,
        variables,
        data: {
          recommendationList: {
            __typename: 'RecommendationList',
            documentId: 'list-123',
            Visibility: true,
          },
        },
      });
      cache.writeQuery({
        query: RECOMMENDATION_LIST_PLACES,
        variables,
        data: {
          recommendationList: {
            __typename: 'RecommendationList',
            documentId: 'list-123',
            recommended_places: [
              {
                __typename: 'RecommendedPlace',
                documentId: 'place-456',
                Place_Details: '{"name":"Paris"}',
              },
            ],
          },
        },
      });

      const warning15Calls = consoleWarn.mock.calls.filter((call) => {
        const rendered = call.map(String).join(' ');
        return (
          rendered.includes('recommendationList') &&
          (rendered.includes('Cache data may be lost') ||
            rendered.includes('%22message%22%3A15'))
        );
      });
      expect(warning15Calls).toEqual([]);
      expect(
        cache.readQuery({ query: RECOMMENDATION_LIST_SUMMARY, variables }),
      ).toEqual({
        recommendationList: {
          __typename: 'RecommendationList',
          documentId: 'list-123',
          Visibility: true,
        },
      });
      expect(
        cache.readQuery({ query: RECOMMENDATION_LIST_PLACES, variables }),
      ).toEqual({
        recommendationList: {
          __typename: 'RecommendationList',
          documentId: 'list-123',
          recommended_places: [
            {
              __typename: 'RecommendedPlace',
              documentId: 'place-456',
              Place_Details: '{"name":"Paris"}',
            },
          ],
        },
      });
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
