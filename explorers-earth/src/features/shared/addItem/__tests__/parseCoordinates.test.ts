import { describe, expect, it } from "vitest";
import { parseCoordinates } from "../parseCoordinates";

describe("parseCoordinates", () => {
  it.each([
    ["15.49, 73.82", { lat: 15.49, lng: 73.82 }],
    ["15.49,73.82", { lat: 15.49, lng: 73.82 }],
    ["  -33.8688   151.2093 ", { lat: -33.8688, lng: 151.2093 }],
    ["15.49° N, 73.82° E", { lat: 15.49, lng: 73.82 }],
    ["33.86 S, 151.20 E", { lat: -33.86, lng: 151.2 }],
    ["40.7128,-74.0060", { lat: 40.7128, lng: -74.006 }],
    ["https://www.google.com/maps/@15.4909,73.8278,15z", { lat: 15.4909, lng: 73.8278 }],
  ])("%s parses", (input, expected) => expect(parseCoordinates(input)).toEqual(expected));

  it.each(["Chowpatty", "91, 10", "10, 181", "15.49", "0, 0", "1,2,3", "Café 15, 73"])("%s is not coordinates", (input) => {
    expect(parseCoordinates(input)).toBeNull();
  });
});
