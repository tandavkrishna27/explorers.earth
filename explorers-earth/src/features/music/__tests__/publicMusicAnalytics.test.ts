import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPublicMusicAnalyticsClient,
  type PublicMusicProductEvent,
} from "../publicMusicAnalytics";

describe("public Music product analytics", () => {
  beforeEach(()=>localStorage.setItem('explorers-cookie-consent',JSON.stringify({analytics:true})));
  it('stops pending polls after consent withdrawal',async()=>{
    const transport=vi.fn(async()=>new Response(null,{status:202}));
    const client=createPublicMusicAnalyticsClient('https://localtunes.example',transport,{sleep:async()=>{localStorage.clear();}});
    await expect(client.track({publicSlug:'public-owner',eventId:'event-12345678',event:{name:'playlist_opened'}})).rejects.toThrow('consent');expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects a successful response without committed receipt',async()=>{
    const client=createPublicMusicAnalyticsClient('https://localtunes.example',vi.fn(async()=>new Response(null,{status:201})));
    await expect(client.track({publicSlug:'public-owner',eventId:'event-12345678',event:{name:'playlist_opened'}})).rejects.toThrow('receipt');
  });
  it.each<PublicMusicProductEvent>([
    { name: "navigation_opened", route: "friendly" },
    { name: "section_opened", section: "queue" },
    { name: "playlist_opened" },
    { name: "song_selected", source: "playlist" },
    { name: "playback_started", source: "current" },
    { name: "request_submitted", outcome: "accepted" },
    { name: "request_submitted", outcome: "rate_limited" },
    { name: "unavailable", reason: "service_unavailable" },
  ])("serializes the normalized $name event without resource identity", async (event) => {
    const capability = "C".repeat(43);
    const publicSlug = "private-public-slug";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({status:"committed",duplicate:false}), { status: 201 }));
    const client = createPublicMusicAnalyticsClient("https://localtunes.example", fetchImpl as typeof fetch);

    await client.track({
      publicSlug,
      capability,
      eventId: "event-12345678",
      event,
      attribution: {
        utm_source: "newsletter",
        utm_medium: "email",
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://localtunes.example/api/explorers/analytics/music/${publicSlug}/events`);
    expect(init?.headers).toMatchObject({ "X-Music-Guest-Capability": capability });
    const serialized = String(init?.body);
    expect(JSON.parse(serialized)).toEqual({
      consent: true,
      eventId: "event-12345678",
      event,
      utmParams: { utm_source: "newsletter", utm_medium: "email" },
    });
    for (const forbidden of [capability, publicSlug, "account-document-id", "youtube.com", "raw query", "credential"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects unknown event properties before sending", async () => {
    const fetchImpl = vi.fn();
    const client = createPublicMusicAnalyticsClient("https://localtunes.example", fetchImpl as typeof fetch);
    await expect(client.track({
      publicSlug: "public-owner",
      eventId: "event-12345678",
      event: { name: "song_selected", source: "queue", mediaUrl: "https://youtube.com/secret" } as never,
    })).rejects.toThrow("Invalid public Music analytics event");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses friendly Account descriptor only as URL authority", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({status:"committed",duplicate:false}), { status: 201 }));
    const client = createPublicMusicAnalyticsClient("https://localtunes.example", fetchImpl as typeof fetch);
    await client.track({ accountDocumentId: "account-friendly-1", eventId: "event-friendly-1", event: { name: "unavailable", reason: "not_public" } });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://localtunes.example/api/explorers/analytics/music-account/account-friendly-1/events");
    expect(String(fetchImpl.mock.calls[0][1]?.body)).not.toContain("account-friendly-1");
  });

  it("polls an in-flight receipt with the identical event body until it is committed", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({status:"committed",duplicate:true}), { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const client = createPublicMusicAnalyticsClient("https://localtunes.example", fetchImpl as typeof fetch, { sleep });
    await client.track({ publicSlug: "public-owner", eventId: "event-12345678", event: { name: "playlist_opened" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(fetchImpl.mock.calls[0][1]?.body);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries one ambiguous transport failure with the identical event body", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify({status:"committed",duplicate:false}), { status: 201 }));
    const sleep = vi.fn(async () => undefined);
    const client = createPublicMusicAnalyticsClient("https://localtunes.example", fetchImpl as typeof fetch, { sleep });
    await client.track({ publicSlug: "public-owner", eventId: "event-12345678", event: { name: "playlist_opened" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(fetchImpl.mock.calls[0][1]?.body);
  });
});
