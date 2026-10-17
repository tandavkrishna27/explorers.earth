export interface MusicPublicCanaryMeasurements {
  descriptorP95Ms: number;
  resourceP95Ms: number;
  fiveXxRate: number;
  listenerDisconnectSeconds: number;
  notificationFanoutP95Ms: number;
  fallbackPollingRate: number;
  authorizationLeaks: number;
  crossOwnerEvents: number;
  capabilityExposures: number;
}

type Gate = "authorization_leak" | "cross_owner_event" | "capability_exposure" | "descriptor_latency" | "resource_latency" | "server_error_rate" | "listener_disconnect" | "fanout_latency" | "fallback_polling";

export function evaluateMusicPublicCanary(value: MusicPublicCanaryMeasurements): { action: "promote" | "contain" | "rollback"; failedGates: Gate[] } {
  const immediate: Gate[] = [];
  if (value.authorizationLeaks > 0) immediate.push("authorization_leak");
  if (value.crossOwnerEvents > 0) immediate.push("cross_owner_event");
  if (value.capabilityExposures > 0) immediate.push("capability_exposure");
  if (immediate.length) return { action: "rollback", failedGates: immediate };
  const failed: Gate[] = [];
  if (value.descriptorP95Ms >= 500) failed.push("descriptor_latency");
  if (value.resourceP95Ms >= 500) failed.push("resource_latency");
  if (value.fiveXxRate >= 0.02) failed.push("server_error_rate");
  if (value.listenerDisconnectSeconds >= 30) failed.push("listener_disconnect");
  if (value.notificationFanoutP95Ms >= 2_000) failed.push("fanout_latency");
  if (value.fallbackPollingRate >= 0.1) failed.push("fallback_polling");
  return failed.length ? { action: "contain", failedGates: failed } : { action: "promote", failedGates: [] };
}

const percentile95 = (values: number[]): number => {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
};

export function collectMusicPublicCanary(events: readonly unknown[]): MusicPublicCanaryMeasurements {
  const descriptor: number[] = []; const resource: number[] = []; const fanout: number[] = []; const disconnect: number[] = [];
  let http = 0; let fiveXx = 0; let activeStarts = 0; let activeStops = 0; let fallbackEnters = 0; let fallbackExits = 0;
  let authorizationLeaks = 0; let crossOwnerEvents = 0; let capabilityExposures = 0;
  for (const raw of events) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const event = raw as Record<string, unknown>;
    if (event.version === "music-public-ops/v1" && event.event === "http" && typeof event.status === "number" && typeof event.latencyMs === "number") {
      http += 1; if (event.status >= 500) fiveXx += 1;
      if (event.operation === "descriptor") descriptor.push(event.latencyMs);
      if (event.operation === "resource") resource.push(event.latencyMs);
    }
    if (event.version === "music-public-ops/v1" && event.event === "listener" && event.outcome === "connected" && typeof event.disconnectMs === "number") disconnect.push(event.disconnectMs);
    if (event.version === "music-public-ops/v1" && event.event === "listener" && event.outcome === "notification_fanout" && typeof event.lagMs === "number") fanout.push(event.lagMs);
    if (event.version === "music-public-browser-ops/v1" && event.event === "active_session" && event.outcome === "started") activeStarts += 1;
    if (event.version === "music-public-browser-ops/v1" && event.event === "active_session" && event.outcome === "stopped") activeStops += 1;
    if (event.version === "music-public-browser-ops/v1" && event.event === "fallback_state" && event.outcome === "entered") fallbackEnters += 1;
    if (event.version === "music-public-browser-ops/v1" && event.event === "fallback_state" && event.outcome === "exited") fallbackExits += 1;
    if (event.version === "music-public-ops/v1" && event.event === "security" && event.outcome === "authorization_leak") authorizationLeaks += 1;
    if (event.version === "music-public-ops/v1" && event.event === "security" && event.outcome === "cross_owner_event") crossOwnerEvents += 1;
    if (event.version === "music-public-ops/v1" && event.event === "security" && event.outcome === "capability_exposure") capabilityExposures += 1;
  }
  return {
    descriptorP95Ms: percentile95(descriptor), resourceP95Ms: percentile95(resource), fiveXxRate: http ? fiveXx / http : Number.POSITIVE_INFINITY,
    listenerDisconnectSeconds: percentile95(disconnect) / 1_000, notificationFanoutP95Ms: percentile95(fanout),
    fallbackPollingRate: Math.max(0, activeStarts - activeStops) ? Math.max(0, fallbackEnters - fallbackExits) / Math.max(0, activeStarts - activeStops) : Number.POSITIVE_INFINITY,
    authorizationLeaks, crossOwnerEvents, capabilityExposures,
  };
}
