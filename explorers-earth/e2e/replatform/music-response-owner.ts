type ResponseBody = {json(): Promise<any>};
type ResponseEvents<R> = {on(event: 'response', listener: (response: R) => void): unknown; off(event: 'response', listener: (response: R) => void): unknown};

function throwFailures(errors: unknown[]): void {
  errors = [...new Set(errors)];
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Music test and cleanup failures', {cause: errors[0]});
}

// Every read gets an immediate settlement handler; genuine failures remain owned.
export function ownMusicResponses<R extends ResponseBody>(page: ResponseEvents<R>, matches: (response: R) => boolean, observe: (operation: Promise<any>) => Promise<any> = operation => operation) {
  const reads = new Map<R, {sequence: number; operation: Promise<any>; settled: Promise<void>}>();
  const values: {sequence: number; value: any}[] = [], errors: unknown[] = [];
  let sequence = 0;
  function read(response: R): Promise<any> {
    const prior = reads.get(response); if (prior) return prior.operation;
    const id = ++sequence;
    let operation: Promise<any>;
    try { operation = observe(response.json()); } catch (error) { operation = Promise.reject(error); }
    const settled = operation.then(value => { values.push({sequence: id, value}); }, error => { errors.push(error); });
    reads.set(response, {sequence: id, operation, settled});
    return operation;
  }
  const listener = (response: R) => { if (matches(response)) read(response); };
  page.on('response', listener);
  function assertHealthy() { throwFailures(errors); }
  async function drain() {
    const pending = Promise.all([...reads.values()].map(read => read.settled));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Music public response drain timed out')), 10000); })]);
    } catch (error) { throwFailures([...errors, error]); } finally { clearTimeout(timer); }
    assertHealthy();
  }
  return {read, assertHealthy, drain, fence: () => sequence,
    valuesAfter: (fence: number) => { assertHealthy(); return values.filter(entry => entry.sequence > fence).map(entry => entry.value); },
    stop: async () => { page.off('response', listener); await drain(); }};
}

export async function musicCleanup(operations: (() => unknown | Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const operation of operations) { try { await operation(); } catch (error) { errors.push(error); } }
  throwFailures(errors);
}
export async function withMusicCleanup(body: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  await musicCleanup([body, cleanup]);
}
