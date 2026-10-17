import type { ChildProcess } from 'node:child_process';

// Only these locally authored boundary outcomes may cross the parent boundary.
export const musicBoundaryPhases = ['startup', 'discovery', 'execution', 'cleanup'] as const;
export const musicBoundarySteps = ['initialization', 'private-directory', 'ports', 'secrets', 'database-start', 'migrator-pool', 'migration', 'runtime-login', 'runtime-pool', 'runtime-verification', 'schema-readiness', 'auth-config', 'auth-context', 'owner-user', 'owner-account', 'owner-initial-account', 'owner-profile', 'owner-session', 'environment', 'startup-marker', 'control-server', 'music-launch', 'canonical-launch', 'private-initialization', 'music-profile', 'music-production-start', 'canonical-production-start', 'session-file', 'vite-launch', 'vite-readiness', 'browser-discovery', 'browser-launch', 'browser-exit', 'browser-receipt', 'receipt-finish'] as const;
export const musicBoundaryCauses = ['unknown', 'timeout', 'interrupted', 'operation-failed', 'spawn-failed', 'child-nonzero', 'child-exit', 'child-signal', 'startup-refused', 'ipc-failed', 'readiness-refused'] as const;
type Phase = typeof musicBoundaryPhases[number];
type Step = typeof musicBoundarySteps[number];
type Cause = typeof musicBoundaryCauses[number];
const ownedCauses = new WeakMap<object, Cause>();
export function musicBoundaryError(cause: Exclude<Cause, 'unknown'>): Error {
  const error = new Error('Owned Music boundary failed');
  ownedCauses.set(error, musicBoundaryCauses.includes(cause) ? cause : 'unknown');
  return error;
}
export function createMusicBoundaryDiagnostic() {
  let active: { phase: Phase; step: Step } = { phase: 'startup', step: 'initialization' };
  let completed: Step | 'none' = 'none';
  let first: { phase: Phase; step: Step; cause: Cause; completed: Step | 'none' } | undefined;
  const capture = (error: unknown) => {
    first ??= { ...active, completed, cause: typeof error === 'object' && error !== null ? ownedCauses.get(error) ?? 'unknown' : 'unknown' };
  };
  const enter = (phase: Phase, step: Step) => {
    // Runtime checks keep a caller's accidental dynamic data out of diagnostics.
    const expectedPhase = step === 'browser-discovery' ? 'discovery' : ['browser-launch', 'browser-exit', 'browser-receipt'].includes(step) ? 'execution' : step === 'receipt-finish' ? 'cleanup' : 'startup';
    if (!musicBoundaryPhases.includes(phase) || !musicBoundarySteps.includes(step) || phase !== expectedPhase) throw new Error('Invalid Music diagnostic boundary');
    active = { phase, step };
  };
  return {
    enter, capture,
    complete() { completed = active.step; },
    async run<T>(phase: Phase, step: Step, operation: () => T | Promise<T>): Promise<T> {
      enter(phase, step);
      try { const value = await operation(); completed = step; return value; }
      catch (error) { capture(error); throw error; }
    },
    line(): string | undefined {
      return first && `Music boundary failed: phase=${first.phase} step=${first.step} cause=${first.cause} completed=${first.completed}`;
    },
  };
}

export async function watchMusicViteReadiness(
  child: Pick<ChildProcess, 'once' | 'off'>,
  readiness: (assertHealthy: () => void) => Promise<void>,
  diagnostic: ReturnType<typeof createMusicBoundaryDiagnostic>,
): Promise<void> {
  let failed = false, original: Error | undefined;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_done, reject) => { rejectFailure = reject; });
  const onError = (error: Error) => {
    failed = true; original = error;
    diagnostic.capture(musicBoundaryError('spawn-failed'));
    rejectFailure(error);
  };
  const assertHealthy = () => { if (failed) throw original; };
  child.once('error', onError);
  try { await Promise.race([failure, readiness(assertHealthy)]); }
  finally { child.off('error', onError); }
}
