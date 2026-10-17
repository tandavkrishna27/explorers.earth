// Observe only the supplied body read; the caller still owns its continuation.
function bodyFailureCategory(error: unknown): string {
  try {
    if (!(error instanceof Error)) return 'other';
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    if (!message || !('value' in message) || typeof message.value !== 'string' || message.value.length > 4096) return 'other';
    let current: object | null = error, name: unknown;
    for (let depth = 0; current && depth < 8; depth++, current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'name');
      if (!descriptor) continue;
      if (!('value' in descriptor) || typeof descriptor.value !== 'string' || descriptor.value.length > 4096) return 'other';
      name = descriptor.value;
      break;
    }
    if (typeof name !== 'string') return 'other';
    if (name === 'SyntaxError') return 'json-syntax';
    if (message.value.includes('Target page, context or browser has been closed')) return 'target-closed';
    if (message.value.includes('No resource with given identifier found')) return 'resource-gone';
  } catch { /* Exotic metadata is never read or retained. */ }
  return 'other';
}

export async function observeMusicResponseBody<T>(operation: Promise<T>, phase: () => unknown): Promise<T> {
  try { return await operation; }
  catch (error) {
    let observedPhase: unknown;
    try { observedPhase = phase(); } catch { observedPhase = 'unknown'; }
    const boundedPhase = observedPhase === 'body' || observedPhase === 'reload' || observedPhase === 'closing' ? observedPhase : 'unknown';
    throw new Error(`[music-stage:public-response-body-${boundedPhase}] [music-cause:public-read-${bodyFailureCategory(error)}]`);
  }
}
