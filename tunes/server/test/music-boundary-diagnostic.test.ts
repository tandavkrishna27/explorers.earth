import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { transformSync } from 'esbuild';

// Removal of the boundary recorder must fail these behavioral assertions too.
const implementation = await import('../../scripts/music-boundary-diagnostic').catch(() => undefined);

describe('Music qualification boundary diagnostics', () => {
  it('retains the first failing callback boundary without error material', async () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    const sensitive = new Error('postgresql://private:secret@host/db Cookie=private stack');
    try { await diagnostic?.run('startup', 'migration', async () => { throw sensitive; }); } catch { }
    try { await diagnostic?.run('startup', 'runtime-login', async () => { throw new Error('later'); }); } catch { }
    expect(diagnostic?.line()).toBe('Music boundary failed: phase=startup step=migration cause=unknown completed=none');
  });

  it('reports the last completed boundary when the next callback fails', async () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    await diagnostic?.run('startup', 'migration', async () => 1);
    try { await diagnostic?.run('startup', 'runtime-login', async () => { throw implementation?.musicBoundaryError('timeout'); }); } catch { }
    expect(diagnostic?.line()).toBe('Music boundary failed: phase=startup step=runtime-login cause=timeout completed=migration');
  });

  it.each(['timeout', 'interrupted', 'operation-failed', 'spawn-failed', 'child-nonzero', 'child-exit', 'child-signal', 'startup-refused', 'ipc-failed', 'readiness-refused'] as const)('keeps the finite %s cause', async cause => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    try { await diagnostic?.run('startup', 'music-launch', () => { throw implementation?.musicBoundaryError(cause); }); } catch { }
    expect(diagnostic?.line()).toBe(`Music boundary failed: phase=startup step=music-launch cause=${cause} completed=none`);
  });

  it('rejects a forged message or object cause and preserves the original exception', async () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    const original = { cause: 'timeout', message: 'Music timeout secret' };
    let caught: unknown;
    try { await diagnostic?.run('startup', 'database-start', () => { throw original; }); } catch (error) { caught = error; }
    expect(caught).toBe(original);
    expect(diagnostic?.line()).toBe('Music boundary failed: phase=startup step=database-start cause=unknown completed=none');
  });

  it('does not report a failure after successful callback completion', async () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    expect(await diagnostic?.run('startup', 'auth-context', () => 17)).toBe(17);
    expect(diagnostic?.line()).toBeUndefined();
  });

  it('rejects phase and step mismatch before executing the callback', async () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    let executed = false;
    await expect(diagnostic?.run('execution', 'migration', () => { executed = true; })).rejects.toThrow('Invalid Music diagnostic boundary');
    expect(executed).toBe(false);
    expect(diagnostic?.line()).toBeUndefined();
  });

  it('rejects dynamic step data without retaining it', () => {
    const diagnostic = implementation?.createMusicBoundaryDiagnostic();
    expect(() => diagnostic?.enter('startup', 'Cookie=private' as never)).toThrow('Invalid Music diagnostic boundary');
    diagnostic?.capture(new Error('Bearer sensitive'));
    expect(diagnostic?.line()).toBe('Music boundary failed: phase=startup step=initialization cause=unknown completed=none');
  });
});

describe('original Music launcher failure boundary', () => {
  // Execute the original function with a child transport double. No child,
  // listener, database or provider is started by this source harness.
  const source = readFileSync(new URL('../../scripts/canonical-music-browser-fixture.ts', import.meta.url), 'utf8');
  const launcherSource = source.slice(source.indexOf('async function launch('), source.indexOf('async function main()'));
  const launcherCode = transformSync(launcherSource.replace('import.meta.filename', "'owned-source.ts'"), { loader: 'ts', target: 'es2022' }).code;
  const loadLauncher = new Function('spawn', 'pinnedNode', 'resolve', 'tunes', 'musicBoundaryError', `${launcherCode}; return launch;`);

  it.each([
    { kind: 'music', step: 'music-profile', want: 'music-profile' },
    { kind: 'music', step: 'music-production-start', want: 'music-production-start' },
    { kind: 'canonical', step: 'canonical-production-start', want: 'canonical-production-start' },
    { kind: 'music', step: 'Cookie=private', want: 'music-launch' },
    { kind: 'music', step: 'canonical-production-start', want: 'music-launch' },
  ])('retains only allowed $kind child substep $want and the registered child', async ({ kind, step, want }) => {
    const diagnostic = implementation!.createMusicBoundaryDiagnostic();
    await diagnostic.run('startup', 'control-server', () => undefined);
    diagnostic.enter('startup', kind === 'music' ? 'music-launch' : 'canonical-launch');
    const child = Object.assign(new EventEmitter(), { pid: 17, send: () => { queueMicrotask(() => child.emit('message', { action: 'startup-failed', kind, step, error: 'Bearer private' })); } });
    const children: unknown[] = [], outcomes: unknown[] = [];
    const launch = loadLauncher(() => child, 'owned-node', (path: string) => path, 'owned-cwd', implementation!.musicBoundaryError);
    await expect(launch(kind, {}, 'private-marker', 'private-capability', children, outcomes, diagnostic)).rejects.toThrow('Owned Music boundary failed');
    child.emit('exit', 1, null);
    expect(children).toEqual([child]);
    expect(outcomes).toMatchObject([{ kind, pid: 17, exitCode: 1, signal: null }]);
    expect(diagnostic.line()).toBe(`Music boundary failed: phase=startup step=${want} cause=startup-refused completed=control-server`);
  });

  it('keeps a successful readiness result when later exit events arrive', async () => {
    const diagnostic = implementation!.createMusicBoundaryDiagnostic(); diagnostic.enter('startup', 'music-launch');
    const child = Object.assign(new EventEmitter(), { pid: 17, send: () => { queueMicrotask(() => child.emit('message', { action: 'ready', kind: 'music' })); } });
    const launch = loadLauncher(() => child, 'owned-node', (path: string) => path, 'owned-cwd', implementation!.musicBoundaryError);
    expect(await launch('music', {}, 'private-marker', 'private-capability', [], [], diagnostic)).toBe(child);
    child.emit('exit', 1, null);
    child.emit('message', { action: 'startup-failed', kind: 'music', step: 'music-profile' });
    expect(diagnostic.line()).toBeUndefined();
  });
});

describe('original Vite readiness spawn failure', () => {
  const source = readFileSync(new URL('../../scripts/canonical-music-browser-fixture.ts', import.meta.url), 'utf8');
  const functionStart = source.indexOf('async function awaitVite(');
  const readinessSource = functionStart >= 0 ? source.slice(functionStart, source.indexOf('async function main()', functionStart)) : `async function awaitVite(vite, browserOrigin, continuing, diagnostic) { ${source.slice(source.indexOf('    let viteSpawnFailed = false;'), source.indexOf('    const browserEnvironment ='))} }`;
  const readinessCode = transformSync(readinessSource, { loader: 'ts', target: 'es2022' }).code;
  const loadReadiness = new Function('fetch', 'musicBoundaryError', 'watchMusicViteReadiness', `${readinessCode}; return awaitVite;`);

  it.each(['before-fetch', 'during-successful-fetch'] as const)('fails promptly on spawn error %s before discovery', async timing => {
    const diagnostic = implementation!.createMusicBoundaryDiagnostic(); diagnostic.enter('startup', 'vite-readiness');
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
    const original = new Error('private spawn authority');
    let discovery = false, fetched = false;
    const fetch = async () => { fetched = true; if (timing === 'during-successful-fetch') child.emit('error', original); return { ok: true }; };
    const continuing = () => { if (timing === 'before-fetch') child.emit('error', original); };
    const awaitVite = loadReadiness(fetch, implementation!.musicBoundaryError, (implementation as any)?.watchMusicViteReadiness);
    const result = (async () => { await awaitVite(child, 'private-origin', continuing, diagnostic); discovery = true; })();
    await expect(result).rejects.toBe(original);
    expect(discovery).toBe(false);
    expect(fetched).toBe(timing !== 'before-fetch');
    expect(diagnostic.line()).toBe('Music boundary failed: phase=startup step=vite-readiness cause=spawn-failed completed=none');
    expect(child.listenerCount('error')).toBe(0);
  });

  it('fails while fetch is pending and stops that poll when fetch later succeeds', async () => {
    const diagnostic = implementation!.createMusicBoundaryDiagnostic(); diagnostic.enter('startup', 'vite-readiness');
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
    const original = new Error('private pending-fetch spawn detail');
    let finishFetch!: (result: { ok: boolean }) => void;
    let fetches = 0, continuations = 0, discovery = false;
    const fetch = () => { fetches++; return new Promise<{ ok: boolean }>(done => { finishFetch = done; }); };
    const awaitVite = loadReadiness(fetch, implementation!.musicBoundaryError, implementation!.watchMusicViteReadiness);
    const result = (async () => { await awaitVite(child, 'private-origin', () => { continuations++; }, diagnostic); discovery = true; })();
    child.emit('error', original);
    await expect(result).rejects.toBe(original);
    expect(child.listenerCount('error')).toBe(0);
    finishFetch({ ok: true });
    await Promise.resolve(); await Promise.resolve();
    expect(discovery).toBe(false);
    expect(fetches).toBe(1);
    expect(continuations).toBe(1);
    expect(diagnostic.line()).toBe('Music boundary failed: phase=startup step=vite-readiness cause=spawn-failed completed=none');
  });

  it('removes the error watcher when readiness succeeds', async () => {
    const diagnostic = implementation!.createMusicBoundaryDiagnostic(); diagnostic.enter('startup', 'vite-readiness');
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
    const awaitVite = loadReadiness(async () => ({ ok: true }), implementation!.musicBoundaryError, implementation!.watchMusicViteReadiness);
    await awaitVite(child, 'private-origin', () => undefined, diagnostic);
    expect(child.listenerCount('error')).toBe(0);
    expect(diagnostic.line()).toBeUndefined();
  });
});
