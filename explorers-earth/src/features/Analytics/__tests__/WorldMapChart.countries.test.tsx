import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import topology from "world-atlas/countries-110m.json";
import { feature } from "topojson-client";

vi.mock("world-atlas/countries-110m.json?url", () => ({ default: "topology.json" }));
vi.mock("react-simple-maps", () => {
  const features = (feature(topology as never, (topology as never as { objects: { countries: never } }).objects.countries) as unknown as { features: unknown[] }).features;
  return {
    ComposableMap: ({ children }: any) => <svg>{children}</svg>,
    ZoomableGroup: ({ children }: any) => <g>{children}</g>,
    Geographies: ({ children }: any) => <>{children({ geographies: features.map((geo: any, index) => ({ ...geo, rsmKey: `geo-${index}` })) })}</>,
    Geography: ({ geography, fill, ...rest }: any) => <path data-name={geography.properties.name} data-fill={fill} data-country={rest["data-country"]} />,
  };
});
vi.mock("../../../hooks/useResponsiveChart", () => ({ useResponsiveChart: () => ({ chartConfig: { chartHeight: 300 } }) }));
import WorldMapChart from "../components/charts/WorldMapChart";

afterEach(cleanup);
const view = (country: string) => ({ type: "view", page: "public-home", country }) as never;

describe("WorldMapChart country matching", () => {
  it("counts the UK once however the events spell it, and shades it", () => {
    const { container, getByText } = render(<WorldMapChart events={[view("GB"), view("UK"), view("United Kingdom"), view("IN")]} />);
    expect(getByText("2 countries with views")).toBeTruthy();
    const fillOf = (name: string) => container.querySelector(`[data-name="${name}"]`)!.getAttribute("data-fill");
    expect(fillOf("United Kingdom")).not.toBe("#F3F4F6");
    expect(fillOf("India")).not.toBe("#F3F4F6");
    expect(fillOf("France")).toBe("#F3F4F6");
  });

  it("shades countries whose topology name differs from the display name", () => {
    const { container } = render(<WorldMapChart events={[view("CZ"), view("CD")]} />);
    expect(container.querySelector('[data-name="Czechia"]')!.getAttribute("data-fill")).not.toBe("#F3F4F6");
    expect(container.querySelector('[data-name="Dem. Rep. Congo"]')!.getAttribute("data-fill")).not.toBe("#F3F4F6");
  });
});
