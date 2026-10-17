import { describe, expect, it } from "vitest";
import {
  getPublicHeaderFallback,
  resolvePublicHeaderRegistrationUrl,
} from "../publicHeaderDescriptor";

describe("getPublicHeaderFallback", () => {
  it("builds the approved category fallback without leaking capability parameters", () => {
    expect(getPublicHeaderFallback({
      origin: "https://explorers.earth",
      pathname: "/alice/books",
      search: "?utm_source=qr&access=secret",
      username: "alice",
      profileName: "Alice",
    })).toMatchObject({
      title: "Alice's Books",
      url: "https://explorers.earth/alice/books?utm_source=qr",
      analyticsContext: "books-header",
    });
  });

  it.each([
    ["root", "/Requested-Name/", "/alice", "Alice's Profile", "profile-header"],
    ["category", "/Requested-Name/BOOKS/", "/alice/books", "Alice's Books", "books-header"],
    ["list", "/Requested-Name/BOOKS/My%20List/", "/alice/books/My%20List", "Alice's Books", "books-header"],
    ["subject", "/Requested-Name/BOOKS/SUBJECT/Sci%2DFi/", "/alice/books/subject/Sci%2DFi", "Alice's Books", "books-header"],
    ["genre", "//Requested-Name//MOVIES//GENRE//Neo%2FNoir//", "/alice/movies/genre/Neo%2FNoir", "Alice's Movies", "movies-header"],
    ["sector", "/Requested-Name/PEOPLE/SECTOR/Film%20Makers/", "/alice/people/sector/Film%20Makers", "Alice's People", "people-header"],
    ["guide detail", "/Requested-Name/GUIDES/Hidden%2FValley/", "/alice/guides/Hidden%2FValley", "Alice's Guides", "guides-header"],
    ["map", "/Requested-Name/PLACES/Some%20Place/MAP/", "/alice/places/Some%20Place/map", "Alice's Places", "places-header"],
    ["music", "/Requested-Name/MUSIC/", "/alice/music", "Alice's Music", "music-header"],
  ])("canonicalizes the %s route while preserving encoded dynamic slugs", (_name, pathname, expectedPath, title, analyticsContext) => {
    const descriptor = getPublicHeaderFallback({
      origin: "https://explorers.earth/ignored/path",
      pathname,
      search: "?utm_campaign=Launch%20Day#ignored",
      username: "Alice",
      profileName: "Alice",
      navigationKey: "nav-1",
    });

    expect(descriptor).toEqual({
      navigationKey: "nav-1",
      title,
      text: `Check out ${title}!`,
      url: `https://explorers.earth${expectedPath}?utm_campaign=Launch+Day`,
      analyticsContext,
      ...(analyticsContext === 'books-header' ? { analyticsReady: false } : {}),
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });
});

describe("resolvePublicHeaderRegistrationUrl", () => {
  const input = {
    origin: "https://explorers.earth",
    username: "Alice",
    currentSearch: "?utm_source=current&utm_campaign=Launch%20Day&access=private",
    fallbackUrl: "https://explorers.earth/alice/places?utm_source=current&utm_campaign=Launch+Day",
  };

  it("accepts and canonicalizes a same-origin current-user public detail target with only current attribution", () => {
    expect(resolvePublicHeaderRegistrationUrl({
      ...input,
      registeredUrl: "https://explorers.earth/Alice/PLACES/Hyderabad/?utm_source=forged&token=private#secret",
    })).toBe("https://explorers.earth/alice/places/Hyderabad?utm_source=current&utm_campaign=Launch+Day");
  });

  it.each([
    ["cross-origin", "https://evil.example/alice/places/hyderabad"],
    ["wrong user", "https://explorers.earth/bob/places/hyderabad"],
    ["different public category", "https://explorers.earth/alice/books/travel"],
    ["invalid public target", "https://explorers.earth/alice/music/private"],
    ["malformed target", "not a public URL"],
  ])("falls back for a %s registration", (_label, registeredUrl) => {
    expect(resolvePublicHeaderRegistrationUrl({ ...input, registeredUrl })).toBe(input.fallbackUrl);
  });
});
