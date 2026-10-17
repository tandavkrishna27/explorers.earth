import { afterEach, expect, it, vi } from "vitest";
const { io } = vi.hoisted(() => ({ io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), disconnect: vi.fn() })) }));
vi.mock("socket.io-client", () => ({ io }));
import { subscribeToPublicMusic } from "../publicMusicLiveClient";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it.each([true, false])("wires websocket and polling to the same authority (dev=%s)", (development) => {
  vi.stubEnv("DEV", development);
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "https://music.localhost");
  const subscription = subscribeToPublicMusic({ publicSlug: "public-owner", onInvalidate: async () => undefined });
  expect(io).toHaveBeenCalledWith(development ? window.location.origin : "https://music.localhost", expect.objectContaining({
    path: development ? "/__localtunes/ws" : "/ws", transports: ["websocket", "polling"], auth: { publicSlug: "public-owner" },
  }));
  subscription.unsubscribe();
});
