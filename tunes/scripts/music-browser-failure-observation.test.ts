// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {observeMusicResponseBody} from './music-browser-failure-observation';

// The helper observes a supplied body-read promise, never the following revision push.
async function rejection(operation: Promise<unknown>, phase: () => unknown): Promise<unknown> {
  try { await observeMusicResponseBody(operation, phase); }
  catch (error) { return error; }
  throw new Error('Expected body-read rejection');
}
function assertMarker(error: unknown, marker: string) {
  let safeEnvelope = false;
  try {
    if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype) {
      const keys = Reflect.ownKeys(error), message = Object.getOwnPropertyDescriptor(error, 'message');
      const stack = Object.getOwnPropertyDescriptor(error, 'stack');
      const standardStack = Object.getOwnPropertyDescriptor(new Error(marker), 'stack')!;
      // Node 24 uses shared native stack accessors; admit those, never custom accessors.
      const standardStackShape = stack && stack.enumerable === false && stack.configurable === true &&
        ('value' in standardStack
          ? 'value' in stack && stack.writable === true && typeof stack.value === 'string'
          : stack.get === standardStack.get && stack.set === standardStack.set);
      if (keys.length === 2 && keys.includes('message') && keys.includes('stack') &&
          message && 'value' in message && message.value === marker &&
          message.enumerable === false && message.writable === true && message.configurable === true && standardStackShape) {
        const stackText: unknown = 'value' in stack! ? stack!.value : standardStack.get!.call(error);
        safeEnvelope = typeof stackText === 'string' && stackText.startsWith('Error: ' + marker + '\n') &&
          !/synthetic-private|private\.invalid|private-phase/.test(stackText);
      }
    }
  } catch { safeEnvelope = false; }
  // Boolean-only output cannot print private data from a broken helper.
  expect(safeEnvelope).toBe(true);
}

describe('Music first failure observation: response body promise', () => {
  it('preserves fulfilled value identity without sampling phase or rereading a body', async () => {
    const value = Object.freeze({revision: 'synthetic'});
    let bodyCalls = 0, phaseCalls = 0;
    const readBody = () => { bodyCalls++; return Promise.resolve(value); };
    const observed = observeMusicResponseBody(readBody(), () => { phaseCalls++; return 'body'; });
    expect(await observed).toBe(value);
    expect(bodyCalls).toBe(1);
    expect(phaseCalls).toBe(0);
    expect(await observeMusicResponseBody(Promise.resolve(undefined), () => { throw new Error('unread'); })).toBeUndefined();
  });

  it('samples phase at rejection and propagates one finite marker without retry', async () => {
    let fail!: (error: unknown) => void;
    let currentPhase = 'body', phaseCalls = 0, bodyCalls = 0;
    const readBody = () => { bodyCalls++; return new Promise((_, reject) => { fail = reject; }); };
    const observed = observeMusicResponseBody(readBody(), () => { phaseCalls++; return currentPhase; });
    currentPhase = 'closing';
    fail(new Error('response.json: Target page, context or browser has been closed'));
    let error: unknown;
    try { await observed; } catch (caught) { error = caught; }
    assertMarker(error, '[music-stage:public-response-body-closing] [music-cause:public-read-target-closed]');
    expect(bodyCalls).toBe(1);
    expect(phaseCalls).toBe(1);
  });

  it('admits only finite rejection phases and falls back when phase getter throws', async () => {
    for (const [phase, marker] of [
      ['body', '[music-stage:public-response-body-body] [music-cause:public-read-other]'],
      ['reload', '[music-stage:public-response-body-reload] [music-cause:public-read-other]'],
      ['closing', '[music-stage:public-response-body-closing] [music-cause:public-read-other]'],
      ['unknown', '[music-stage:public-response-body-unknown] [music-cause:public-read-other]'],
      ['private-phase', '[music-stage:public-response-body-unknown] [music-cause:public-read-other]'],
      [null, '[music-stage:public-response-body-unknown] [music-cause:public-read-other]'],
      [{}, '[music-stage:public-response-body-unknown] [music-cause:public-read-other]'],
    ] as const) assertMarker(await rejection(Promise.reject(new Error('unclassified')), () => phase), marker);
    assertMarker(await rejection(Promise.reject(new Error('unclassified')), () => { throw new Error('private-phase'); }),
      '[music-stage:public-response-body-unknown] [music-cause:public-read-other]');
  });

  it('classifies bounded Error metadata without retaining messages or stacks', async () => {
    const rows: [unknown, string][] = [
      [new Error('response.json: Target page, context or browser has been closed'), 'public-read-target-closed'],
      [new Error('response.json: Protocol error (Network.getResponseBody): No resource with given identifier found'), 'public-read-resource-gone'],
      [new SyntaxError('Unexpected token in JSON synthetic-private-body'), 'public-read-json-syntax'],
      [new Error('synthetic-private-cookie https://private.invalid/?token=synthetic-private-ID'), 'public-read-other'],
      ['Target page, context or browser has been closed', 'public-read-other'],
      [{name: 'SyntaxError', message: 'synthetic-private-body'}, 'public-read-other'],
      [null, 'public-read-other'],
      [new Error('x'.repeat(4097) + ' Target page, context or browser has been closed'), 'public-read-other'],
    ];
    for (const [input, cause] of rows) {
      if (input instanceof Error) {
        input.stack = 'synthetic-private-stack';
        Object.defineProperties(input, {
          cause: {value: {body: 'synthetic-private-body'}, configurable: true},
          privateMetadata: {value: 'synthetic-private-cookie', enumerable: true, configurable: true},
        });
        Object.defineProperty(input, Symbol('synthetic-private-ID'), {value: 'synthetic-private-token'});
      }
      const before = input !== null && typeof input === 'object' ? Object.getOwnPropertyDescriptors(input) : undefined;
      const inputPrototype = before ? Object.getPrototypeOf(input) : undefined;
      const error = await rejection(Promise.reject(input), () => 'body');
      assertMarker(error, `[music-stage:public-response-body-body] [music-cause:${cause}]`);
      expect(error === input).toBe(false);
      if (before) {
        const after = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(before);
        const untouched = Object.getPrototypeOf(input) === inputPrototype && Reflect.ownKeys(after).length === keys.length &&
          keys.every(key => {
            const prior = Reflect.get(before, key), next = Reflect.get(after, key);
            return next !== undefined && Reflect.ownKeys(prior).length === Reflect.ownKeys(next).length &&
              Reflect.ownKeys(prior).every(field => Reflect.get(prior, field) === Reflect.get(next, field));
          });
        expect(untouched).toBe(true);
      }
    }
  });

  it('treats throwing and exotic Error metadata as other without coercion', async () => {
    let reads = 0;
    const messageGetter = Object.defineProperty(new Error(), 'message', {get() { reads++; throw new Error('private'); }});
    const nameGetter = Object.defineProperty(new Error('Target page, context or browser has been closed'), 'name', {get() { reads++; throw new Error('private'); }});
    const exotic = Object.defineProperty(new Error(), 'message', {value: {toString() { reads++; throw new Error('private'); }}});
    const proxy = new Proxy(new Error('private'), {getOwnPropertyDescriptor() { throw new Error('private'); }});
    for (const error of [messageGetter, nameGetter, exotic, proxy]) {
      assertMarker(await rejection(Promise.reject(error), () => 'body'),
        '[music-stage:public-response-body-body] [music-cause:public-read-other]');
    }
    expect(reads).toBe(0);
  });

  it('leaves the following revision continuation failure untouched', async () => {
    const continuationError = new Error('synthetic continuation');
    const value: {readonly revision: string} = {get revision(): string { throw continuationError; }};
    let caught: unknown;
    try { await observeMusicResponseBody(Promise.resolve(value), () => 'body').then(body => body.revision); }
    catch (error) { caught = error; }
    expect(caught === continuationError).toBe(true);
  });
});
